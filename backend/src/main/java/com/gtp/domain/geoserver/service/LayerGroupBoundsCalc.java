package com.gtp.domain.geoserver.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.gtp.domain.geoserver.dto.LayerGroupBounds;

import java.util.List;
import java.util.regex.Pattern;

/**
 * 레이어 그룹 수정 때 영역(bounds) 다시 계산 규칙(순수 static — GeoServer 없이 점검한다).
 * 좌표 변환은 하지 않는다(GeoTools CRS.decode 금지). 레이어의 원래 좌표계가 모두 같으면 그 좌표계로,
 * 아니면 모든 레이어의 경위도 영역(EPSG:4326)으로 합치고, 하나라도 못 구하면 원래 영역을 그대로 둔다(STALE).
 */
final class LayerGroupBoundsCalc {

    static final String KEPT = "KEPT";
    static final String RECALCULATED = "RECALCULATED";
    static final String STALE = "STALE";
    static final String WGS84 = "EPSG:4326";

    private static final Pattern EPSG = Pattern.compile("^EPSG:\\d+$");

    private LayerGroupBoundsCalc() {
    }

    /** 멤버 하나의 영역: 원래 좌표계 영역(crs 포함)과 경위도 영역. 못 구한 쪽은 null. */
    static final class MemberBox {
        final LayerGroupBounds nativeBox;
        final LayerGroupBounds latLonBox;

        MemberBox(LayerGroupBounds nativeBox, LayerGroupBounds latLonBox) {
            this.nativeBox = nativeBox;
            this.latLonBox = latLonBox;
        }
    }

    /** 계산 결과. bounds가 null이면 GeoServer 원래 영역을 그대로 둔다(KEPT·STALE). */
    static final class Result {
        final LayerGroupBounds bounds;
        final String action;
        final boolean crsChanged;
        final String note;

        Result(LayerGroupBounds bounds, String action, boolean crsChanged, String note) {
            this.bounds = bounds;
            this.action = action;
            this.crsChanged = crsChanged;
            this.note = note;
        }
    }

    static Result kept() {
        return new Result(null, KEPT, false, null);
    }

    /**
     * 멤버 영역들을 합친다. boxes의 null 원소 = 그 멤버를 아예 못 구함. originalCrs = 그룹의 원래 영역 좌표계(없으면 null).
     * 레이어 구성이 바뀐 경우에만 부른다.
     */
    static Result combine(List<MemberBox> boxes, String originalCrs) {
        // 1) 모든 멤버의 원래 좌표계가 같은 EPSG 코드면 그 좌표계로 합친다
        if (!boxes.isEmpty()) {
            String common = null;
            boolean same = true;
            for (MemberBox b : boxes) {
                String crs = b == null || b.nativeBox == null ? null : trimOrNull(b.nativeBox.getCrs());
                if (crs == null || !EPSG.matcher(crs).matches() || (common != null && !common.equals(crs))) {
                    same = false;
                    break;
                }
                common = crs;
            }
            if (same) {
                return recalculated(union(boxes, true, common), common, originalCrs);
            }
            // 2) 모든 멤버에 경위도 영역이 있으면 EPSG:4326으로 합친다
            boolean allLatLon = true;
            for (MemberBox b : boxes) {
                if (b == null || b.latLonBox == null) {
                    allLatLon = false;
                    break;
                }
            }
            if (allLatLon) {
                return recalculated(union(boxes, false, WGS84), WGS84, originalCrs);
            }
        }
        int failed = 0;
        for (MemberBox b : boxes) {
            if (b == null || b.latLonBox == null) failed++;
        }
        if (failed == 0) failed = boxes.size();
        return new Result(null, STALE, false, "레이어 " + failed + "개의 영역을 읽지 못해 원래 영역을 그대로 두었습니다. "
                + "GeoServer 관리 화면에서 '영역 생성'을 누르세요.");
    }

    private static Result recalculated(LayerGroupBounds b, String crs, String originalCrs) {
        boolean changed = originalCrs != null && !originalCrs.trim().equals(crs);
        return new Result(b, RECALCULATED, changed, null);
    }

    private static LayerGroupBounds union(List<MemberBox> boxes, boolean useNative, String crs) {
        double minx = Double.POSITIVE_INFINITY, miny = Double.POSITIVE_INFINITY;
        double maxx = Double.NEGATIVE_INFINITY, maxy = Double.NEGATIVE_INFINITY;
        for (MemberBox m : boxes) {
            LayerGroupBounds b = useNative ? m.nativeBox : m.latLonBox;
            minx = Math.min(minx, Math.min(b.getMinx(), b.getMaxx()));
            maxx = Math.max(maxx, Math.max(b.getMinx(), b.getMaxx()));
            miny = Math.min(miny, Math.min(b.getMiny(), b.getMaxy()));
            maxy = Math.max(maxy, Math.max(b.getMiny(), b.getMaxy()));
        }
        return new LayerGroupBounds(minx, miny, maxx, maxy, crs);
    }

    private static String trimOrNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    // ── 레이어 → 리소스 영역 JSON 읽기 ──────────────────────────

    /** 레이어가 가리키는 리소스(featureType·coverage·wmsLayer·wmtsLayer). path = REST 경로 조각, root = 응답 뿌리 키. */
    static final class ResourceRef {
        final String path;
        final String root;
        final String workspace;
        final String name;

        ResourceRef(String path, String root, String workspace, String name) {
            this.path = path;
            this.root = root;
            this.workspace = workspace;
            this.name = name;
        }
    }

    /**
     * GET /rest/layers/{ws:name} 응답 → 리소스 위치. 응답의 레이어 이름이 요청과 다르면(점 이름 등) null.
     * qualified는 'ws:layer', layerWs는 그 작업공간. resource.name에 접두사가 없으면 layerWs를 쓴다.
     */
    static ResourceRef resourceRef(JsonNode root, String qualified, String layerWs, String layerLocal) {
        JsonNode layer = root == null ? null : root.path("layer");
        if (layer == null || !layer.isObject()) return null;
        String name = textOf(layer.path("name"));
        if (name == null || !(name.equals(layerLocal) || name.equals(qualified))) return null;
        JsonNode res = layer.path("resource");
        if (!res.isObject()) return null;
        String cls = textOf(res.path("@class"));
        String path;
        String rootKey;
        if ("featureType".equals(cls)) {
            path = "featuretypes";
            rootKey = "featureType";
        } else if ("coverage".equals(cls)) {
            path = "coverages";
            rootKey = "coverage";
        } else if ("wmsLayer".equals(cls)) {
            path = "wmslayers";
            rootKey = "wmsLayer";
        } else if ("wmtsLayer".equals(cls)) {
            path = "wmtslayers";
            rootKey = "wmtsLayer";
        } else {
            return null;
        }
        String resName = textOf(res.path("name"));
        if (resName == null) return null;
        int i = resName.indexOf(':');
        String ws = i > 0 ? resName.substring(0, i) : layerWs;
        String local = i > 0 ? resName.substring(i + 1) : resName;
        if (local.isEmpty()) return null;
        return new ResourceRef(path, rootKey, ws, local);
    }

    /** 리소스 응답 → 영역. 뿌리 키·이름이 기대와 다르면 null(못 구함). 두 영역 모두 없어도 null. */
    static MemberBox resourceBox(JsonNode root, ResourceRef ref) {
        JsonNode r = root == null ? null : root.path(ref.root);
        if (r == null || !r.isObject()) return null;
        String name = textOf(r.path("name"));
        if (name == null || !(name.equals(ref.name) || name.equals(ref.workspace + ":" + ref.name))) return null;
        LayerGroupBounds nat = LayerGroupJson.bounds(r.path("nativeBoundingBox"));
        LayerGroupBounds ll = latLon(LayerGroupJson.bounds(r.path("latLonBoundingBox")));
        if (nat == null && ll == null) return null;
        return new MemberBox(nat, ll);
    }

    /** 중첩 그룹의 영역(그룹 자신의 좌표계). 경위도 영역은 좌표계가 EPSG:4326일 때만. */
    static MemberBox groupBox(LayerGroupBounds b) {
        if (b == null) return null;
        return new MemberBox(b, WGS84.equals(trimOrNull(b.getCrs())) ? b : null);
    }

    /** latLonBoundingBox의 좌표계는 정의상 경위도 — 없으면 EPSG:4326으로 보고, 다른 값이면 못 쓴다. */
    private static LayerGroupBounds latLon(LayerGroupBounds b) {
        if (b == null) return null;
        String crs = trimOrNull(b.getCrs());
        if (crs == null) return new LayerGroupBounds(b.getMinx(), b.getMiny(), b.getMaxx(), b.getMaxy(), WGS84);
        return WGS84.equals(crs) ? b : null;
    }

    private static String textOf(JsonNode n) {
        if (n == null || !n.isTextual()) return null;
        String s = n.asText();
        return s.isBlank() ? null : s;
    }
}
