package com.gtp.domain.geoserver.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.gtp.domain.geoserver.dto.LayerGroupBounds;
import com.gtp.domain.geoserver.dto.LayerGroupDetail;
import com.gtp.domain.geoserver.dto.LayerGroupMember;
import com.gtp.domain.geoserver.dto.LayerGroupSummary;
import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.List;

/**
 * GeoServer 레이어 그룹 JSON 읽기(순수 static). GeoServer 2.x 버전별 응답 모양 차이(목록 하나·빈 문자열·스타일 빈 칸 등)를
 * 모두 받아 {@link LayerGroupDetail}로 바꾼다. 멤버 순서는 GeoServer가 준 그대로(뒤집지 않는다).
 */
final class LayerGroupJson {

    static final String DOT_REASON = "이름에 점(.)이 있는 그룹은 GeoServer 관리 화면에서 수정·삭제하세요.";
    static final String EO_REASON = "위성영상(EO) 방식 그룹은 이 도구로 수정할 수 없습니다. GeoServer 관리 화면에서 수정하세요.";
    static final String LEGACY_REASON = "GeoServer 2.2 이하의 옛 형식 그룹이라 이 도구로 수정할 수 없습니다.";
    static final String UNNAMED_REASON = "이름이 없는 항목이 들어 있는 그룹이라 이 도구로 수정할 수 없습니다. GeoServer 관리 화면에서 수정하세요.";
    static final String STYLES_REASON = "그룹 스타일이 지정된 그룹이라 레이어 구성은 바꿀 수 없습니다(제목·설명·방식은 바꿀 수 있습니다).";

    private LayerGroupJson() {
    }

    /** 목록 응답({"layerGroups":{"layerGroup":[…]}} / 객체 하나 / "") → 이름순(대소문자 무시). ws가 null이면 전역. */
    static List<LayerGroupSummary> parseList(JsonNode root, String ws) {
        List<String> names = GeoServerService.names(root.path("layerGroups").path("layerGroup"));
        names.sort(String::compareToIgnoreCase);
        List<LayerGroupSummary> out = new ArrayList<>();
        for (String name : names) out.add(new LayerGroupSummary(name, ws));
        return out;
    }

    /**
     * 상세 응답({"layerGroup":{…}}) → 상세. wsHint는 응답에 소속이 없을 때만 쓰는 요청 경로의 작업공간(전역이면 null).
     * layerGroup 키가 없거나 객체가 아니면 GEOSERVER_RESPONSE_INVALID.
     */
    static LayerGroupDetail parseDetail(JsonNode root, String wsHint) {
        JsonNode lg = root == null ? null : root.path("layerGroup");
        if (lg == null || !lg.isObject()) throw new CustomException(GisErrorCode.GEOSERVER_RESPONSE_INVALID);

        String name = text(lg.path("name"));
        if (name == null) throw new CustomException(GisErrorCode.GEOSERVER_RESPONSE_INVALID);
        String ws = workspaceOf(lg.path("workspace"));
        if (ws == null) ws = wsHint;
        String title = text(lg.path("title"));
        String description = text(lg.path("abstractTxt"));
        String mode = text(lg.path("mode"));
        if (mode == null) mode = "SINGLE";

        boolean legacy = !lg.has("publishables");
        List<JsonNode> items = legacy
                ? GeoServerService.asList(lg.path("layers").path("layer"))
                : GeoServerService.asList(lg.path("publishables").path("published"));
        List<String> styles = styleList(lg.path("styles").path("style"));

        List<LayerGroupMember> members = new ArrayList<>();
        boolean unnamed = false;
        for (int i = 0; i < items.size(); i++) {
            JsonNode n = items.get(i);
            String type = n.isObject() ? firstText(n.path("@type"), n.path("type")) : null;
            String memberName = n.isObject() ? text(n.path("name")) : text(n);
            if (memberName == null) {
                unnamed = true; // 건너뛰면 XML과 항목 수가 달라 수정이 409로만 끝나므로 수정 불가로 알린다
                continue;
            }
            members.add(new LayerGroupMember(type == null ? "layer" : type, memberName, i < styles.size() ? styles.get(i) : null));
        }
        // 이름 없는 항목을 건너뛰면 스타일 짝이 밀리므로 건너뛴 경우는 위에서 인덱스를 i로 읽어 짝을 유지했다.

        LayerGroupBounds bounds = bounds(lg.path("bounds"));

        String blocked = null;
        if (name.indexOf('.') >= 0) blocked = DOT_REASON;
        else if ("EO".equalsIgnoreCase(mode)) blocked = EO_REASON;
        else if (legacy) blocked = LEGACY_REASON;
        else if (unnamed) blocked = UNNAMED_REASON;
        String locked = hasContent(lg.path("layerGroupStyles")) ? STYLES_REASON : null;

        String wmsName = ws != null ? ws + ":" + name : name;
        return new LayerGroupDetail(name, ws, wmsName, title, description, mode, members, bounds, true,
                revision(mode, title, description, members), blocked, locked);
    }

    // ── 지문 ────────────────────────────────────────────────────

    static String revision(LayerGroupDetail d) {
        return revision(d.getMode(), d.getTitle(), d.getDescription(), d.getMembers());
    }

    /** 내용 지문: mode·title·description·멤버(type|name|style)의 SHA-256 앞 16자(hex 소문자). bounds는 넣지 않는다. */
    static String revision(String mode, String title, String description, List<LayerGroupMember> members) {
        StringBuilder sb = new StringBuilder();
        sb.append(mode).append('\n').append(nz(title)).append('\n').append(nz(description)).append('\n');
        for (LayerGroupMember m : members) {
            sb.append(m.getType()).append('|').append(m.getName()).append('|').append(nz(m.getStyle())).append('\n');
        }
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(sb.toString().getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (int i = 0; i < 8; i++) hex.append(String.format("%02x", hash[i] & 0xff));
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e); // SHA-256은 모든 JDK에 있다
        }
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }

    // ── 조각 읽기 ───────────────────────────────────────────────

    /** 문자열이면 값(공백뿐이면 null), 아니면 null. */
    private static String text(JsonNode n) {
        if (n == null || !n.isTextual()) return null;
        String s = n.asText();
        return s.isBlank() ? null : s;
    }

    private static String firstText(JsonNode a, JsonNode b) {
        String s = text(a);
        return s != null ? s : text(b);
    }

    /** workspace: {"name":"gtp"} 또는 "gtp". 없으면(전역) null. */
    private static String workspaceOf(JsonNode n) {
        if (n == null) return null;
        if (n.isObject()) return text(n.path("name"));
        return text(n);
    }

    /**
     * styles.style: 배열이면 칸마다, 객체·문자열 하나면 한 칸. 기본 스타일 칸("")·null은 null로 남겨 순서를 유지한다
     * (asList를 쓰면 빈 칸이 사라져 뒤 칸이 앞으로 밀린다). 작업공간 스타일이면 'ws:style'.
     */
    static List<String> styleList(JsonNode node) {
        List<String> out = new ArrayList<>();
        if (node == null || node.isMissingNode() || node.isNull()) return out;
        if (node.isArray()) {
            node.forEach(n -> out.add(oneStyle(n)));
        } else {
            out.add(oneStyle(node));
        }
        return out;
    }

    private static String oneStyle(JsonNode n) {
        if (n == null || n.isNull() || n.isMissingNode()) return null;
        if (n.isTextual()) return text(n);
        if (!n.isObject()) return null;
        String name = text(n.path("name"));
        if (name == null) return null;
        String ws = workspaceOf(n.path("workspace"));
        return ws != null && name.indexOf(':') < 0 ? ws + ":" + name : name;
    }

    /** bounds: 숫자 4개가 모두 있어야 한다(하나라도 빠지면 null). crs는 문자열 또는 객체의 "$". */
    static LayerGroupBounds bounds(JsonNode b) {
        if (b == null || !b.isObject()) return null;
        Double minx = number(b.path("minx"));
        Double miny = number(b.path("miny"));
        Double maxx = number(b.path("maxx"));
        Double maxy = number(b.path("maxy"));
        if (minx == null || miny == null || maxx == null || maxy == null) return null;
        JsonNode crs = b.path("crs");
        String crsText = crs.isObject() ? text(crs.path("$")) : text(crs);
        return new LayerGroupBounds(minx, miny, maxx, maxy, crsText);
    }

    private static Double number(JsonNode n) {
        if (n == null) return null;
        double v;
        if (n.isNumber()) {
            v = n.asDouble();
        } else if (n.isTextual()) {
            try {
                v = Double.parseDouble(n.asText().trim());
            } catch (NumberFormatException e) {
                return null;
            }
        } else {
            return null;
        }
        return Double.isNaN(v) || Double.isInfinite(v) ? null : v;
    }

    /** 비어 있지 않은 내용이 하나라도 있는가(빈 문자열·빈 배열·빈 객체·그 안의 빈 값만이면 false). */
    private static boolean hasContent(JsonNode n) {
        if (n == null || n.isMissingNode() || n.isNull()) return false;
        if (n.isTextual()) return !n.asText().isBlank();
        if (n.isArray() || n.isObject()) {
            for (JsonNode c : n) if (hasContent(c)) return true;
            return false;
        }
        return true;
    }
}
