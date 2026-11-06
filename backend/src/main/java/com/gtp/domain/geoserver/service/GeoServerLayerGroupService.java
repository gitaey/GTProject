package com.gtp.domain.geoserver.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gtp.domain.geoserver.connection.GeoServerConnection;
import com.gtp.domain.geoserver.connection.GeoServerHttp;
import com.gtp.domain.geoserver.connection.GeoServerHttp.Req;
import com.gtp.domain.geoserver.connection.GeoServerHttp.Resp;
import com.gtp.domain.geoserver.dto.LayerGroupBounds;
import com.gtp.domain.geoserver.dto.LayerGroupCreateRequest;
import com.gtp.domain.geoserver.dto.LayerGroupDetail;
import com.gtp.domain.geoserver.dto.LayerGroupMember;
import com.gtp.domain.geoserver.dto.LayerGroupMemberRef;
import com.gtp.domain.geoserver.dto.LayerGroupSummary;
import com.gtp.domain.geoserver.dto.LayerGroupUpdateRequest;
import com.gtp.domain.geoserver.dto.LayerGroupUpdateResult;
import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.w3c.dom.Document;

import java.io.IOException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * GeoServer 레이어 그룹(여러 레이어를 한 이름으로 묶는 GeoServer 자체 기능) 조회·만들기·삭제.
 * 우리 DB의 레이어 그룹(tbl_layer_group)과 무관하다. 외부 호출은 전부 {@link GeoServerHttp#call}을 지나며,
 * 요청·응답 본문 전체와 입력값은 로그·예외 문구에 남기지 않는다(GeoServer 자원 이름만 문구에 넣는다).
 * 순서 약속: 레이어 배열은 0 = 가장 먼저 그림 = 지도에서 맨 아래이며 어느 쪽도 뒤집지 않는다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GeoServerLayerGroupService {

    private static final String JSON = "application/json";
    private static final String ANY = "*/*";
    private static final String XML_UTF8 = "application/xml; charset=UTF-8";
    static final int MAX_LAYERS = 100;
    private static final Pattern GROUP_NAME = Pattern.compile("^[A-Za-z_][A-Za-z0-9_-]{0,99}$");

    private static final String XML = "application/xml";
    private static final Pattern REVISION = Pattern.compile("^[0-9a-f]{16}$");

    private final GeoServerHttp http;
    private final ObjectMapper objectMapper = new ObjectMapper();
    /** 수정 때 레이어별 영역 조회용(8개 동시). 작업 하나는 순서대로 요청 몇 번뿐이고 다시 작업을 맡기지 않아 서로 기다리다 멈추지 않는다. */
    private final ExecutorService boundsPool = newBoundsPool();
    /** 수정 한 번의 영역 조회 전체 마감(모든 레이어 합계). 넘기면 남은 조회를 취소하고 원래 영역을 두는 STALE로 저장한다. 요청 하나는 따로 30초 제한. */
    Duration boundsDeadline = Duration.ofSeconds(60);

    private static ExecutorService newBoundsPool() {
        AtomicInteger n = new AtomicInteger();
        return Executors.newFixedThreadPool(8, r -> {
            Thread t = new Thread(r, "geoserver-lg-bounds-" + n.incrementAndGet());
            t.setDaemon(true);
            return t;
        });
    }

    @PreDestroy
    void shutdown() {
        boundsPool.shutdownNow();
    }

    // ── 조회 ────────────────────────────────────────────────────

    /** G1: 작업공간의 발행된 레이어 이름(접두사 없음, 대소문자 무시 정렬). GeoServer 요청 1번. */
    public List<String> getLayerNames(GeoServerConnection c, String workspace) {
        List<String> names = layerNamesOrNull(c, workspace);
        if (names == null) throw GisErrorCode.GEOSERVER_REQUEST_FAILED.exception("레이어 이름 조회", 404);
        return names;
    }

    /** 작업공간이 없으면(404) null. 이름에 "ws:" 접두사가 붙어 오는 버전은 접두사를 뗀다. */
    private List<String> layerNamesOrNull(GeoServerConnection c, String workspace) {
        String ws = GeoServerService.seg("작업공간", workspace);
        Resp res = http.call(c, "레이어 이름 조회", Req.get(rest(c, "/workspaces/" + ws + "/layers"),
                JSON, GeoServerHttp.TIMEOUT_NORMAL, GeoServerHttp.MAX_TEXT_BYTES));
        if (res.status() == 404) return null;
        if (!res.is2xx()) throw GisErrorCode.GEOSERVER_REQUEST_FAILED.exception("레이어 이름 조회", res.status());
        JsonNode root = readJson(c, "레이어 이름 조회", res);
        List<String> names = new ArrayList<>();
        String prefix = workspace + ":";
        for (String n : GeoServerService.names(root.path("layers").path("layer"))) {
            names.add(n.startsWith(prefix) ? n.substring(prefix.length()) : n);
        }
        names.sort(String::compareToIgnoreCase);
        return names;
    }

    /** G2·G3: 그룹 목록. workspace가 null이면 전역. */
    public List<LayerGroupSummary> getLayerGroups(GeoServerConnection c, String workspace) {
        Resp res = http.call(c, "레이어 그룹 목록 조회", Req.get(rest(c, scope(workspace)),
                JSON, GeoServerHttp.TIMEOUT_NORMAL, GeoServerHttp.MAX_TEXT_BYTES));
        if (!res.is2xx()) throw GisErrorCode.GEOSERVER_REQUEST_FAILED.exception("레이어 그룹 목록 조회", res.status());
        return LayerGroupJson.parseList(readJson(c, "레이어 그룹 목록 조회", res), workspace);
    }

    /**
     * G4·G5: 그룹 상세. 점이 없는 이름은 확장자 없이 Accept로 형식을 정한다.
     * 점이 있는 이름은 '{name}.json'으로 읽고 응답 이름이 요청과 같을 때만 인정한다(GeoServer가 점을 확장자로 자를 수 있음).
     */
    public LayerGroupDetail getLayerGroup(GeoServerConnection c, String workspace, String name) {
        String seg = GeoServerService.seg("그룹", name);
        boolean dotted = name.indexOf('.') >= 0;
        String wms = workspace == null ? name : workspace + ":" + name;
        Resp res = http.call(c, "레이어 그룹 조회", Req.get(rest(c, scope(workspace) + "/" + seg + (dotted ? ".json" : "")),
                JSON, GeoServerHttp.TIMEOUT_NORMAL, GeoServerHttp.MAX_TEXT_BYTES));
        if (res.status() == 404) throw GisErrorCode.GEOSERVER_LAYERGROUP_NOT_FOUND.exception(wms);
        if (!res.is2xx()) throw GisErrorCode.GEOSERVER_REQUEST_FAILED.exception("레이어 그룹 조회", res.status());
        LayerGroupDetail d = LayerGroupJson.parseDetail(readJson(c, "레이어 그룹 조회", res), workspace);
        if (dotted && !name.equals(d.getName())) throw GisErrorCode.GEOSERVER_LAYERGROUP_NOT_FOUND.exception(wms);
        return d;
    }

    // ── 만들기 ──────────────────────────────────────────────────

    /** G6: 검사 → 이름 중복 확인 → 레이어 존재 확인 → POST(XML) → 다시 읽기. */
    public LayerGroupDetail createLayerGroup(GeoServerConnection c, LayerGroupCreateRequest req) {
        Create in = validateCreate(req);
        String wms = in.workspace == null ? in.name : in.workspace + ":" + in.name;

        // 같은 이름이 이미 있나(GeoServer 쪽 중복 검증의 문구·상태는 버전마다 달라 사전 확인이 1차 방어)
        Resp exists = http.call(c, "레이어 그룹 중복 확인", Req.get(rest(c, scope(in.workspace) + "/" + GeoServerService.seg("그룹", in.name)),
                JSON, GeoServerHttp.TIMEOUT_NORMAL, GeoServerHttp.MAX_TEXT_BYTES));
        if (exists.is2xx()) throw GisErrorCode.GEOSERVER_LAYERGROUP_EXISTS.exception(wms);
        if (exists.status() != 404) throw GisErrorCode.GEOSERVER_REQUEST_FAILED.exception("레이어 그룹 중복 확인", exists.status());

        requireLayersExist(c, in.layers);

        String xml = LayerGroupXml.buildCreate(in.name, in.mode, in.title, in.description, in.layers);
        Resp res = http.call(c, "레이어 그룹 생성", Req.send("POST", rest(c, scope(in.workspace)),
                ANY, XML_UTF8, xml, GeoServerHttp.TIMEOUT_PUBLISH));
        if (!res.is2xx()) {
            if (res.text().toLowerCase(Locale.ROOT).contains("already exists")) {
                throw GisErrorCode.GEOSERVER_LAYERGROUP_EXISTS.exception(wms);
            }
            throw GisErrorCode.GEOSERVER_LAYERGROUP_REJECTED.exception("생성", res.status(), GeoServerHttp.preview(res.body()));
        }
        log.info("[GeoServer] 레이어 그룹 생성 host={} name={} layers={}", c.host(), wms, in.layers.size());

        try {
            return getLayerGroup(c, in.workspace, in.name);
        } catch (CustomException e) {
            if (e.getErrorCode() == GisErrorCode.GEOSERVER_AUTH_REJECTED) throw e;
            log.debug("[GeoServer] 레이어 그룹 생성 뒤 다시 읽기 실패 host={}", c.host());
            return unverified(in);
        }
    }

    /** 만들기는 성공했지만 다시 읽기에 실패했을 때 요청값으로 채운 상세(verified=false, 영역 없음). */
    private static LayerGroupDetail unverified(Create in) {
        List<LayerGroupMember> members = new ArrayList<>();
        for (String l : in.layers) members.add(new LayerGroupMember("layer", l, null));
        String wms = in.workspace == null ? in.name : in.workspace + ":" + in.name;
        return new LayerGroupDetail(in.name, in.workspace, wms, in.title, in.description, in.mode, members, null, false,
                LayerGroupJson.revision(in.mode, in.title, in.description, members), null, null);
    }

    /** 레이어가 실제로 있는지 작업공간별로 한 번씩 확인한다. 없는 것이 있으면 POST를 보내지 않는다(422). */
    private void requireLayersExist(GeoServerConnection c, List<String> layers) {
        Map<String, Set<String>> byWs = new LinkedHashMap<>();
        for (String l : layers) {
            byWs.computeIfAbsent(l.substring(0, l.indexOf(':')), k -> new HashSet<>());
        }
        for (Map.Entry<String, Set<String>> e : byWs.entrySet()) {
            List<String> names = layerNamesOrNull(c, e.getKey());
            if (names != null) e.getValue().addAll(names);
        }
        List<String> missing = new ArrayList<>();
        for (String l : layers) {
            int i = l.indexOf(':');
            if (!byWs.get(l.substring(0, i)).contains(l.substring(i + 1))) missing.add(l);
        }
        if (missing.isEmpty()) return;
        String shown = missing.stream().limit(5).collect(Collectors.joining(", "));
        if (missing.size() > 5) shown += " 외 " + (missing.size() - 5) + "개";
        throw GisErrorCode.GEOSERVER_LAYERGROUP_LAYER_MISSING.exception(shown);
    }

    // ── 삭제 ────────────────────────────────────────────────────

    /** G7·G8: 그룹 삭제(안의 레이어는 지워지지 않는다). 이름에 점이 있으면 GeoServer에 요청하지 않고 400. */
    public void deleteLayerGroup(GeoServerConnection c, String workspace, String name) {
        String seg = GeoServerService.seg("그룹", name);
        requireNoDot(name);
        String wms = workspace == null ? name : workspace + ":" + name;
        Resp res = http.call(c, "레이어 그룹 삭제", Req.send("DELETE", rest(c, scope(workspace) + "/" + seg),
                ANY, null, null, GeoServerHttp.TIMEOUT_NORMAL));
        if (res.status() == 404) throw GisErrorCode.GEOSERVER_LAYERGROUP_NOT_FOUND.exception(wms);
        if (!res.is2xx()) {
            throw GisErrorCode.GEOSERVER_LAYERGROUP_REJECTED.exception("삭제", res.status(), GeoServerHttp.preview(res.body()));
        }
        log.info("[GeoServer] 레이어 그룹 삭제 host={} name={}", c.host(), wms);
    }

    /** 점(.)이 든 이름은 수정·삭제를 막는다 — GeoServer가 점 뒤를 확장자로 읽어 다른 그룹을 건드릴 수 있다(설계 6.4). */
    static void requireNoDot(String name) {
        if (name.indexOf('.') >= 0) throw GisErrorCode.GEOSERVER_INPUT_INVALID.exception(LayerGroupJson.DOT_REASON);
    }

    // ── 수정 ────────────────────────────────────────────────────

    /**
     * G9·G10: 검사(점 이름·형식) → 현재 상태(JSON) 읽기 → 수정 가능·지문 대조 → 바뀐 것 판정 → 새 레이어 확인 →
     * GeoServer XML 받기 → (구성이 바뀌면) 영역 계산 → 필요한 요소만 고쳐 PUT → 다시 읽기.
     */
    public LayerGroupUpdateResult updateLayerGroup(GeoServerConnection c, String workspace, String name, LayerGroupUpdateRequest req) {
        String seg = GeoServerService.seg("그룹", name);
        requireNoDot(name); // GeoServer 요청 0
        String scope = scope(workspace);
        Update in = validateUpdate(req);
        String wms = workspace == null ? name : workspace + ":" + name;

        LayerGroupDetail cur = getLayerGroup(c, workspace, name);
        if (cur.getEditBlockedReason() != null) {
            throw GisErrorCode.GEOSERVER_LAYERGROUP_NOT_EDITABLE.exception(cur.getEditBlockedReason());
        }
        if (!in.revision.equals(cur.getRevision())) throw GisErrorCode.GEOSERVER_LAYERGROUP_CHANGED.exception(wms);

        List<String> newLayers = validateAgainstCurrent(cur, in, workspace);

        boolean layersChanged = !sameMultiset(cur.getMembers(), in.members);
        boolean orderChanged = !sameSequence(cur.getMembers(), in.members);
        boolean metaChanged = !Objects.equals(in.title, cur.getTitle())
                || !Objects.equals(in.description, cur.getDescription())
                || !in.mode.equals(cur.getMode());
        if (!layersChanged && !orderChanged && !metaChanged) {
            return new LayerGroupUpdateResult(cur, false, LayerGroupBoundsCalc.KEPT, false, null);
        }
        if ((layersChanged || orderChanged) && cur.getLayersLockedReason() != null) {
            throw GisErrorCode.GEOSERVER_LAYERGROUP_NOT_EDITABLE.exception(cur.getLayersLockedReason());
        }
        if (!newLayers.isEmpty()) requireLayersExist(c, newLayers);

        Resp xr = http.call(c, "레이어 그룹 XML 조회", Req.get(rest(c, scope + "/" + seg),
                XML, GeoServerHttp.TIMEOUT_NORMAL, GeoServerHttp.MAX_TEXT_BYTES));
        if (xr.status() == 404) throw GisErrorCode.GEOSERVER_LAYERGROUP_NOT_FOUND.exception(wms);
        if (!xr.is2xx()) throw GisErrorCode.GEOSERVER_REQUEST_FAILED.exception("레이어 그룹 조회", xr.status());
        Document doc = LayerGroupXml.parseSecure(xr.body());

        LayerGroupBoundsCalc.Result br = LayerGroupBoundsCalc.kept();
        if (layersChanged) {
            Boxes boxes = collectBoxes(c, workspace, in.members);
            br = LayerGroupBoundsCalc.combine(boxes.list, cur.getBounds() == null ? null : cur.getBounds().getCrs());
            if (boxes.timedOut && LayerGroupBoundsCalc.STALE.equals(br.action)) {
                br = new LayerGroupBoundsCalc.Result(null, br.action, false, br.note + " 영역 조회가 너무 오래 걸려 중단했습니다.");
            }
        }

        LayerGroupXmlEdit.apply(doc, cur, in.mode, in.title, in.description, in.members, br.bounds);
        String xml = LayerGroupXml.serialize(doc);

        Resp res = http.call(c, "레이어 그룹 수정", Req.send("PUT", rest(c, scope + "/" + seg), ANY, XML_UTF8, xml, GeoServerHttp.TIMEOUT_PUBLISH));
        if (res.status() == 404) throw GisErrorCode.GEOSERVER_LAYERGROUP_NOT_FOUND.exception(wms);
        if (!res.is2xx()) {
            throw GisErrorCode.GEOSERVER_LAYERGROUP_REJECTED.exception("수정", res.status(), GeoServerHttp.preview(res.body()));
        }
        log.info("[GeoServer] 레이어 그룹 수정 host={} name={} layers={} bounds={}", c.host(), wms, in.members.size(), br.action);

        LayerGroupDetail after;
        try {
            after = getLayerGroup(c, workspace, name);
        } catch (CustomException e) {
            if (e.getErrorCode() == GisErrorCode.GEOSERVER_AUTH_REJECTED) throw e;
            log.debug("[GeoServer] 레이어 그룹 수정 뒤 다시 읽기 실패 host={}", c.host());
            after = unverified(cur, in, br.bounds != null ? br.bounds : cur.getBounds());
        }
        return new LayerGroupUpdateResult(after, true, br.action, br.crsChanged, br.note);
    }

    /** 수정은 성공했지만 다시 읽기에 실패했을 때 요청값으로 채운 상세(verified=false). 원래 멤버의 스타일은 원래 값을 쓴다. */
    private static LayerGroupDetail unverified(LayerGroupDetail cur, Update in, LayerGroupBounds bounds) {
        boolean[] used = new boolean[cur.getMembers().size()];
        List<LayerGroupMember> members = new ArrayList<>();
        for (LayerGroupMemberRef r : in.members) {
            String style = null;
            for (int i = 0; i < used.length; i++) {
                LayerGroupMember m = cur.getMembers().get(i);
                if (!used[i] && m.getType().equals(r.getType()) && m.getName().equals(r.getName())) {
                    used[i] = true;
                    style = m.getStyle();
                    break;
                }
            }
            members.add(new LayerGroupMember(r.getType(), r.getName(), style));
        }
        return new LayerGroupDetail(cur.getName(), cur.getWorkspace(), cur.getWmsName(), in.title, in.description, in.mode, members,
                bounds, false, LayerGroupJson.revision(in.mode, in.title, in.description, members), null, cur.getLayersLockedReason());
    }

    /** 멤버의 (type, name) 묶음(개수 포함, 순서 무시)이 같은가. */
    static boolean sameMultiset(List<LayerGroupMember> cur, List<LayerGroupMemberRef> req) {
        if (cur.size() != req.size()) return false;
        Map<String, Integer> count = new HashMap<>();
        for (LayerGroupMember m : cur) count.merge(m.getType() + "|" + m.getName(), 1, Integer::sum);
        for (LayerGroupMemberRef r : req) {
            if (count.merge(r.getType() + "|" + r.getName(), -1, Integer::sum) < 0) return false;
        }
        return true;
    }

    /** 멤버의 (type, name)이 순서까지 같은가. */
    static boolean sameSequence(List<LayerGroupMember> cur, List<LayerGroupMemberRef> req) {
        if (cur.size() != req.size()) return false;
        for (int i = 0; i < cur.size(); i++) {
            if (!cur.get(i).getType().equals(req.get(i).getType()) || !cur.get(i).getName().equals(req.get(i).getName())) return false;
        }
        return true;
    }

    /**
     * 현재 상태가 필요한 검사(5.3): 방식·중첩 그룹·중복·새 레이어(형식·소속).
     * @return 원래 그룹에 없던 새 레이어('ws:layer', 중복 없음, 요청 순서)
     */
    static List<String> validateAgainstCurrent(LayerGroupDetail cur, Update in, String workspace) {
        if (!"SINGLE".equals(in.mode) && !"NAMED".equals(in.mode) && !in.mode.equals(cur.getMode())) {
            throw invalid("이 도구에서는 SINGLE·NAMED로만 바꿀 수 있습니다.");
        }
        Map<String, Integer> origCount = new HashMap<>();
        for (LayerGroupMember m : cur.getMembers()) origCount.merge(m.getType() + "|" + m.getName(), 1, Integer::sum);
        Map<String, Integer> seen = new HashMap<>();
        Set<String> newLayers = new LinkedHashSet<>();
        for (LayerGroupMemberRef r : in.members) {
            String key = r.getType() + "|" + r.getName();
            int orig = origCount.getOrDefault(key, 0);
            int n = seen.merge(key, 1, Integer::sum);
            if (orig == 0) {
                if (!"layer".equals(r.getType())) throw invalid("다른 레이어 그룹을 새로 넣는 것은 지원하지 않습니다.");
                requireQualified(r.getName());
                if (workspace != null) requireInWorkspace(workspace, r.getName());
                newLayers.add(r.getName());
            }
            if (n > Math.max(orig, 1)) throw invalid("같은 레이어를 두 번 넣을 수 없습니다.");
        }
        return new ArrayList<>(newLayers);
    }

    // ── 수정 때 영역 조회(레이어마다 GeoServer 요청 2번, 8개 동시) ──

    /** 영역 조회 결과: 멤버별 영역(못 구한 것은 null)과 전체 마감 시간을 넘겨 중단했는지. */
    private static final class Boxes {
        final List<LayerGroupBoundsCalc.MemberBox> list;
        final boolean timedOut;

        Boxes(List<LayerGroupBoundsCalc.MemberBox> list, boolean timedOut) {
            this.list = list;
            this.timedOut = timedOut;
        }
    }

    /**
     * 서로 다른 멤버마다 영역을 구한다. 못 구한 멤버는 null. 계정 거부(428)만 그대로 던진다.
     * 요청 하나(레이어 전부)당 합계 {@link #boundsDeadline}를 넘기면 끝나지 않은 조회는 취소하고 못 구한 것으로 친다(STALE, 저장은 계속).
     */
    private Boxes collectBoxes(GeoServerConnection c, String groupWs, List<LayerGroupMemberRef> members) {
        Map<String, Future<LayerGroupBoundsCalc.MemberBox>> futures = new LinkedHashMap<>();
        for (LayerGroupMemberRef r : members) {
            futures.computeIfAbsent(r.getType() + "|" + r.getName(), k -> boundsPool.submit(() -> fetchBox(c, groupWs, r)));
        }
        long end = System.nanoTime() + boundsDeadline.toNanos();
        boolean timedOut = false;
        List<LayerGroupBoundsCalc.MemberBox> boxes = new ArrayList<>();
        try {
            for (Future<LayerGroupBoundsCalc.MemberBox> f : futures.values()) {
                if (!timedOut && !f.isDone()) {
                    long left = end - System.nanoTime();
                    try {
                        if (left > 0) f.get(left, TimeUnit.NANOSECONDS);
                        else timedOut = true;
                    } catch (TimeoutException e) {
                        timedOut = true;
                    }
                    if (timedOut) futures.values().forEach(x -> x.cancel(true));
                }
                boxes.add(f.isDone() && !f.isCancelled() ? f.get() : null);
            }
        } catch (InterruptedException e) {
            futures.values().forEach(f -> f.cancel(true));
            Thread.currentThread().interrupt();
            throw new CustomException(GisErrorCode.GEOSERVER_TIMEOUT);
        } catch (ExecutionException e) {
            futures.values().forEach(f -> f.cancel(true));
            if (e.getCause() instanceof CustomException ce) throw ce;
            throw new CustomException(GisErrorCode.GEOSERVER_RESPONSE_INVALID);
        }
        if (timedOut) log.info("[GeoServer] 레이어 그룹 영역 조회가 {}초를 넘겨 중단함 host={}", boundsDeadline.toSeconds(), c.host());
        return new Boxes(boxes, timedOut);
    }

    private LayerGroupBoundsCalc.MemberBox fetchBox(GeoServerConnection c, String groupWs, LayerGroupMemberRef r) {
        try {
            return "layerGroup".equals(r.getType()) ? groupBox(c, groupWs, r.getName()) : layerBox(c, groupWs, r.getName());
        } catch (CustomException e) {
            if (e.getErrorCode() == GisErrorCode.GEOSERVER_AUTH_REJECTED) throw e;
            log.debug("[GeoServer] 영역 조회 실패 host={}", c.host());
            return null;
        } catch (RuntimeException e) {
            log.debug("[GeoServer] 영역 조회 실패 host={}", c.host());
            return null;
        }
    }

    /** 중첩 그룹: 접두사가 있으면 그 작업공간, 없으면 전역 → (작업공간 그룹이면) 같은 작업공간 순으로 찾는다. */
    private LayerGroupBoundsCalc.MemberBox groupBox(GeoServerConnection c, String groupWs, String name) {
        int i = name.indexOf(':');
        List<String[]> candidates = new ArrayList<>();
        if (i > 0) {
            candidates.add(new String[]{name.substring(0, i), name.substring(i + 1)});
        } else {
            candidates.add(new String[]{null, name});
            if (groupWs != null) candidates.add(new String[]{groupWs, name});
        }
        for (String[] cand : candidates) {
            try {
                return LayerGroupBoundsCalc.groupBox(getLayerGroup(c, cand[0], cand[1]).getBounds());
            } catch (CustomException e) {
                if (e.getErrorCode() != GisErrorCode.GEOSERVER_LAYERGROUP_NOT_FOUND) throw e;
            }
        }
        return null;
    }

    /** 레이어 → 리소스 → nativeBoundingBox·latLonBoundingBox. 응답 이름이 요청과 다르면(점 든 이름이 확장자로 잘린 경우 등) 못 구함. */
    private LayerGroupBoundsCalc.MemberBox layerBox(GeoServerConnection c, String groupWs, String name) {
        String q = name.indexOf(':') > 0 ? name : (groupWs == null ? null : groupWs + ":" + name);
        if (q == null) return null;
        int i = q.indexOf(':');
        String lws = q.substring(0, i);
        String local = q.substring(i + 1);
        Resp lr = http.call(c, "레이어 영역 조회", Req.get(rest(c, "/layers/" + GeoServerService.seg("레이어", q) + jsonExt(local)),
                JSON, GeoServerHttp.TIMEOUT_NORMAL, GeoServerHttp.MAX_TEXT_BYTES));
        if (!lr.is2xx()) return null;
        LayerGroupBoundsCalc.ResourceRef ref = LayerGroupBoundsCalc.resourceRef(readJson(c, "레이어 영역 조회", lr), q, lws, local);
        if (ref == null) return null;
        String path = "/workspaces/" + GeoServerService.seg("작업공간", ref.workspace) + "/" + ref.path + "/"
                + GeoServerService.seg("리소스", ref.name) + jsonExt(ref.name);
        Resp rr = http.call(c, "리소스 영역 조회", Req.get(rest(c, path), JSON, GeoServerHttp.TIMEOUT_NORMAL, GeoServerHttp.MAX_TEXT_BYTES));
        if (!rr.is2xx()) return null;
        return LayerGroupBoundsCalc.resourceBox(readJson(c, "리소스 영역 조회", rr), ref);
    }

    /** 점이 든 이름은 확장자로 읽히지 않게 .json을 붙여 형식을 못 박는다(읽기 전용 조회에서만 쓴다). */
    private static String jsonExt(String name) {
        return name.indexOf('.') >= 0 ? ".json" : "";
    }

    // ── 요청 검사(5.3) ──────────────────────────────────────────

    /** 검사를 통과한 수정 입력(빈 제목·설명은 null로 정리). */
    static final class Update {
        final String revision;
        final String title;
        final String description;
        final String mode;
        final List<LayerGroupMemberRef> members;

        Update(String revision, String title, String description, String mode, List<LayerGroupMemberRef> members) {
            this.revision = revision;
            this.title = title;
            this.description = description;
            this.mode = mode;
            this.members = members;
        }
    }

    /** GeoServer를 부르기 전에 할 수 있는 검사(현재 상태가 필요한 검사는 validateAgainstCurrent). */
    static Update validateUpdate(LayerGroupUpdateRequest req) {
        if (req == null) throw invalid("요청 내용이 비었습니다.");
        String rev = req.getRevision();
        if (rev == null || !REVISION.matcher(rev).matches()) throw invalid("수정 기준 정보가 없습니다. 그룹을 다시 불러오세요.");
        String title = blankToNull(req.getTitle());
        String description = blankToNull(req.getDescription());
        validateTexts(title, description);
        String mode = req.getMode();
        if (mode == null || mode.isBlank()) throw invalid("지원하지 않는 그리기 방식입니다.");
        List<LayerGroupMemberRef> members = req.getMembers();
        if (members == null || members.isEmpty()) throw invalid("레이어를 1개 이상 넣으세요.");
        if (members.size() > MAX_LAYERS) throw invalid("한 그룹에는 레이어를 100개까지 넣을 수 있습니다.");
        for (LayerGroupMemberRef m : members) {
            if (m == null || !("layer".equals(m.getType()) || "layerGroup".equals(m.getType()))) throw invalid("알 수 없는 멤버 종류입니다.");
            String n = m.getName();
            if (n == null || n.isBlank() || n.length() > 500 || !xmlSafe(n, false)) throw badLayerFormat();
        }
        return new Update(rev, title, description, mode, new ArrayList<>(members));
    }

    /** 검사를 통과한 만들기 입력(빈 제목·설명은 null로 정리). */
    static final class Create {
        final String workspace;
        final String name;
        final String title;
        final String description;
        final String mode;
        final List<String> layers;

        Create(String workspace, String name, String title, String description, String mode, List<String> layers) {
            this.workspace = workspace;
            this.name = name;
            this.title = title;
            this.description = description;
            this.mode = mode;
            this.layers = layers;
        }
    }

    static Create validateCreate(LayerGroupCreateRequest req) {
        if (req == null) throw invalid("요청 내용이 비었습니다.");
        String name = req.getName();
        if (name == null || !GROUP_NAME.matcher(name).matches()) {
            throw invalid("그룹 이름은 영문으로 시작하고 영문·숫자·_·-만 쓸 수 있습니다(최대 100자).");
        }
        String ws = req.getWorkspace();
        if (ws != null) {
            GeoServerService.requireName("작업공간", ws);
            if (!xmlSafe(ws, false)) throw invalid("작업공간 이름이 올바르지 않습니다.");
        }
        String title = blankToNull(req.getTitle());
        String description = blankToNull(req.getDescription());
        validateTexts(title, description);
        String mode = req.getMode();
        if (!"SINGLE".equals(mode) && !"NAMED".equals(mode)) throw invalid("지원하지 않는 그리기 방식입니다.");

        List<String> layers = req.getLayers();
        if (layers == null || layers.isEmpty()) throw invalid("레이어를 1개 이상 넣으세요.");
        if (layers.size() > MAX_LAYERS) throw invalid("한 그룹에는 레이어를 100개까지 넣을 수 있습니다.");
        for (String l : layers) requireQualified(l);
        if (new HashSet<>(layers).size() != layers.size()) throw invalid("같은 레이어를 두 번 넣을 수 없습니다.");
        if (ws != null) {
            for (String l : layers) requireInWorkspace(ws, l);
        }
        return new Create(ws, name, title, description, mode, new ArrayList<>(layers));
    }

    /** 제목 200자·설명 2000자, XML 1.0이 못 담는 문자 금지(설명은 줄바꿈·탭만 허용). */
    static void validateTexts(String title, String description) {
        if (title != null) {
            if (title.codePointCount(0, title.length()) > 200) throw invalid("제목은 200자까지입니다.");
            if (!xmlSafe(title, false)) throw invalid("제목에 사용할 수 없는 문자가 들어 있습니다.");
        }
        if (description != null) {
            if (description.codePointCount(0, description.length()) > 2000) throw invalid("설명은 2000자까지입니다.");
            if (!xmlSafe(description, true)) throw invalid("설명에 사용할 수 없는 문자가 들어 있습니다.");
        }
    }

    /** 'ws:layer' 형식(첫 ':'로 나눠 앞뒤 모두 올바른 이름). */
    static void requireQualified(String qualified) {
        if (qualified == null) throw badLayerFormat();
        int i = qualified.indexOf(':');
        if (i <= 0 || i == qualified.length() - 1) throw badLayerFormat();
        try {
            GeoServerService.requireName("작업공간", qualified.substring(0, i));
            GeoServerService.requireName("레이어", qualified.substring(i + 1));
        } catch (CustomException e) {
            throw badLayerFormat();
        }
        if (!xmlSafe(qualified, false)) throw badLayerFormat();
    }

    /** 작업공간 소속 그룹에는 그 작업공간의 레이어만 넣을 수 있다. */
    static void requireInWorkspace(String ws, String qualified) {
        if (!qualified.startsWith(ws + ":")) throw invalid("작업공간 소속 그룹에는 그 작업공간의 레이어만 넣을 수 있습니다.");
    }

    private static CustomException badLayerFormat() {
        return invalid("레이어 이름 형식이 올바르지 않습니다(작업공간:레이어).");
    }

    private static CustomException invalid(String message) {
        return GisErrorCode.GEOSERVER_INPUT_INVALID.exception(message);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s;
    }

    /** XML 1.0 본문에 쓸 수 있는 문자만 있는가(제어 문자·짝 없는 서로게이트·U+FFFE/FFFF 금지, 필요하면 \n·\t·\r 허용 — GeoServer 설명에 CRLF가 흔하다). */
    static boolean xmlSafe(String s, boolean allowNewlineTab) {
        for (int i = 0; i < s.length(); ) {
            int cp = s.codePointAt(i);
            i += Character.charCount(cp);
            if (cp == '\n' || cp == '\t' || cp == '\r') {
                if (!allowNewlineTab) return false;
                continue;
            }
            if (Character.isISOControl(cp)) return false;
            if (cp >= 0xD800 && cp <= 0xDFFF) return false;
            if (cp == 0xFFFE || cp == 0xFFFF) return false;
        }
        return true;
    }

    // ── 내부 도우미 ─────────────────────────────────────────────

    private String rest(GeoServerConnection c, String pathAndQuery) {
        return c.baseUrl() + "/rest" + pathAndQuery;
    }

    /** 전역이면 /layergroups, 작업공간이면 /workspaces/{ws}/layergroups. */
    private static String scope(String workspace) {
        return workspace == null ? "/layergroups" : "/workspaces/" + GeoServerService.seg("작업공간", workspace) + "/layergroups";
    }

    private JsonNode readJson(GeoServerConnection c, String op, Resp res) {
        try {
            return objectMapper.readTree(res.body());
        } catch (IOException e) {
            log.debug("[GeoServer] {} JSON 해석 실패 host={}", op, c.host());
            throw new CustomException(GisErrorCode.GEOSERVER_RESPONSE_INVALID);
        }
    }
}
