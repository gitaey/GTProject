package com.gtp.domain.mymap.util;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;

import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.regex.Pattern;

/**
 * 나만의지도 스타일 설정({@code tbl_user_map.style_config}, JSON 문자열)의 서버 기준 스키마 검사. <b>스키마 v1</b>.
 * 서버가 저장 전에 모양·범위·크기를 막아 두므로, 프론트는 읽을 때 방어만 하면 된다. 위반은 {@link GisErrorCode#MYMAP_STYLE_INVALID}(400)와
 * "어느 항목이 왜"가 적힌 메시지로 돌려준다.
 *
 * <pre>
 * { "v": 1,                                   필수, 정수 1
 *   "display": "polygon" | "point",           선택 — 표시 방식(면/점)
 *   "fill": "#rrggbb[aa]", "fillOpacity": 0~1,
 *   "stroke": "#rrggbb[aa]", "strokeWidth": 0~20, "pointRadius": 1~50,
 *   "pointColor": "#rrggbb[aa]", "pointStroke": "#rrggbb[aa]", "pointStrokeWidth": 0~10,   선택 — 점 색·점 테두리(없으면 점 색 = 선 색, 테두리 = 흰색 1px)
 *   "classify": null
 *     | { "type": "categorical", "field": 컬럼, "classes": [{ "value": 글자, "color": 색 }…(1~12개, 값 중복 없음)], "otherColor": 색(선택) }
 *     | { "type": "graduated",   "field": 숫자 컬럼, "method": "quantile"|"equal"|"manual",
 *         "breaks": [숫자…](colors 개수 - 1개, 오름차순, 각 절댓값 1e15 미만), "colors": [#rrggbb…](3~7개, <b>알파 없는 #rrggbb만</b>), "otherColor": 색(선택) },
 *   "label": null | { "field": 컬럼, "size": 8~40, "color": 색, "halo": 색, "minZoom": 정수 0~28 },
 *   "popup": null | { "fields": [컬럼…](0~30개, 중복 없음) } }   popup 없음/null = 기본(앞 5개 컬럼), fields [] = 이 레이어 팝업 끔
 * </pre>
 * 색은 {@code #rrggbb} 또는 {@code #rrggbbaa}만(이름·rgb()·#rgb 금지). <b>모르는 키는 거절</b>한다(조용히 버리면 저장한 것과 화면이 달라진다)
 * — 키를 늘릴 때는 {@code v}를 올리고 이 검사도 함께 고친다. 중복 키·JSON 뒤에 붙은 글자도 거절. 전체 크기 16KB 이하(UTF-8 바이트).
 * 컬럼을 고르는 항목({@code classify.field}, {@code label.field}, {@code popup.fields})은 레이어 컬럼 목록이 있으면 그 안에 있어야 하고,
 * 구간형은 컬럼 종류가 알려져 있으면 숫자 컬럼이어야 한다.
 * 빈 값(null·공백 문자열)은 "스타일 없음 = 기본값"이라 이 검사를 통과한다(호출하는 쪽이 지움 처리).
 */
public final class StyleConfigValidator {

    public static final int MAX_BYTES = 16 * 1024;
    public static final int SCHEMA_VERSION = 1;

    public static final double STROKE_WIDTH_MAX = 20;
    public static final double POINT_RADIUS_MIN = 1, POINT_RADIUS_MAX = 50;
    public static final double POINT_STROKE_WIDTH_MAX = 10;
    public static final double LABEL_SIZE_MIN = 8, LABEL_SIZE_MAX = 40;
    public static final int MIN_ZOOM_MIN = 0, MIN_ZOOM_MAX = 28;
    public static final int CLASSES_MAX = 12;
    public static final int GRADUATED_COLORS_MIN = 3, GRADUATED_COLORS_MAX = 7;
    public static final int POPUP_FIELDS_MAX = 30;
    /** 컬럼 이름·범주 값의 최대 글자 수(컬럼 이름은 엑셀 머리글이라 길 수 있다) */
    public static final int NAME_MAX = 200;
    /** 구간 경계의 절댓값 상한(미포함) — 숫자 판정({@link NumericText#ABS_LIMIT})과 같다: 숫자로 읽히는 값에서 나온 경계는 항상 통과한다 */
    public static final double BREAK_ABS_LIMIT = NumericText.ABS_LIMIT;

    private static final Pattern COLOR = Pattern.compile("^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$");
    private static final Pattern SOLID_COLOR = Pattern.compile("^#[0-9a-fA-F]{6}$");
    private static final Set<String> ROOT_KEYS = Set.of("v", "display", "fill", "fillOpacity", "stroke", "strokeWidth", "pointRadius",
            "pointColor", "pointStroke", "pointStrokeWidth", "classify", "label", "popup");
    private static final Set<String> DISPLAYS = Set.of("polygon", "point");
    private static final Set<String> METHODS = Set.of("quantile", "equal", "manual");

    private static final ObjectMapper OM = new ObjectMapper()
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);

    static {
        OM.getFactory().enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION);
    }

    /** 레이어의 컬럼 하나. kind는 "number"|"text"이고 모르면 null. */
    public record Column(String name, String kind) {
    }

    private StyleConfigValidator() {
    }

    /** 컬럼 목록 없이(모양·범위·크기만) 검사한다. */
    public static void validate(String json) {
        validate(json, null);
    }

    /**
     * @param columns 레이어 컬럼. null이거나 비어 있으면(아직 모름) 컬럼 이름·종류 검사를 건너뛴다.
     * @throws CustomException MYMAP_STYLE_INVALID(400)
     */
    public static void validate(String json, List<Column> columns) {
        if (json == null || json.isBlank()) return;
        if (json.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) {
            throw fail("전체", "크기가 " + (MAX_BYTES / 1024) + "KB를 넘습니다");
        }
        JsonNode root;
        try {
            root = OM.readTree(json);
        } catch (Exception e) {
            throw fail("전체", "JSON 형식이 아닙니다(중복된 키·뒤에 붙은 글자 포함)");
        }
        if (root == null || !root.isObject()) throw fail("전체", "JSON 객체여야 합니다");

        Map<String, Column> byName = new HashMap<>();
        if (columns != null) for (Column c : columns) byName.put(c.name(), c);
        new Check(byName, !byName.isEmpty()).root(root);
    }

    // ---------- 검사 본체 ----------

    private static CustomException fail(String path, String why) {
        return new CustomException(GisErrorCode.MYMAP_STYLE_INVALID, "스타일 설정이 올바르지 않습니다: " + path + " — " + why);
    }

    private static final class Check {
        private final Map<String, Column> columns;
        private final boolean knowsColumns;

        Check(Map<String, Column> columns, boolean knowsColumns) {
            this.columns = columns;
            this.knowsColumns = knowsColumns;
        }

        void root(JsonNode n) {
            onlyKeys(n, "", ROOT_KEYS);
            JsonNode v = n.get("v");
            if (v == null) throw fail("v", "필수입니다(현재 " + SCHEMA_VERSION + ")");
            if (!v.isIntegralNumber() || !v.canConvertToInt() || v.asInt() != SCHEMA_VERSION) throw fail("v", "버전은 정수 " + SCHEMA_VERSION + "만 지원합니다");

            if (n.has("display")) {
                String d = text(n.get("display"), "display");
                if (!DISPLAYS.contains(d)) throw fail("display", "polygon 또는 point");
            }
            if (n.has("fill")) color(n.get("fill"), "fill");
            if (n.has("stroke")) color(n.get("stroke"), "stroke");
            if (n.has("fillOpacity")) range(n.get("fillOpacity"), "fillOpacity", 0, 1);
            if (n.has("strokeWidth")) range(n.get("strokeWidth"), "strokeWidth", 0, STROKE_WIDTH_MAX);
            if (n.has("pointRadius")) range(n.get("pointRadius"), "pointRadius", POINT_RADIUS_MIN, POINT_RADIUS_MAX);
            if (n.has("pointColor")) color(n.get("pointColor"), "pointColor");
            if (n.has("pointStroke")) color(n.get("pointStroke"), "pointStroke");
            if (n.has("pointStrokeWidth")) range(n.get("pointStrokeWidth"), "pointStrokeWidth", 0, POINT_STROKE_WIDTH_MAX);

            JsonNode classify = n.get("classify");
            if (classify != null && !classify.isNull()) classify(classify);
            JsonNode label = n.get("label");
            if (label != null && !label.isNull()) label(label);
            JsonNode popup = n.get("popup");
            if (popup != null && !popup.isNull()) popup(popup);
        }

        void classify(JsonNode n) {
            if (!n.isObject()) throw fail("classify", "객체 또는 null이어야 합니다");
            String type = text(n.get("type"), "classify.type");
            switch (type) {
                case "categorical" -> categorical(n);
                case "graduated" -> graduated(n);
                default -> throw fail("classify.type", "categorical 또는 graduated");
            }
        }

        void categorical(JsonNode n) {
            onlyKeys(n, "classify.", Set.of("type", "field", "classes", "otherColor"));
            column(n.get("field"), "classify.field", false);
            JsonNode classes = n.get("classes");
            if (classes == null || !classes.isArray()) throw fail("classify.classes", "배열이어야 합니다");
            if (classes.isEmpty() || classes.size() > CLASSES_MAX) throw fail("classify.classes", "1~" + CLASSES_MAX + "개여야 합니다");
            Set<String> seen = new HashSet<>();
            int i = 0;
            for (JsonNode c : classes) {
                String at = "classify.classes[" + i++ + "]";
                if (!c.isObject()) throw fail(at, "객체여야 합니다");
                onlyKeys(c, at + ".", Set.of("value", "color"));
                JsonNode value = c.get("value");
                if (value == null || !value.isTextual()) throw fail(at + ".value", "글자여야 합니다");
                if (value.asText().length() > NAME_MAX) throw fail(at + ".value", NAME_MAX + "자를 넘습니다");
                if (!seen.add(value.asText())) throw fail(at + ".value", "같은 값이 두 번 있습니다");
                color(c.get("color"), at + ".color");
            }
            if (n.has("otherColor")) color(n.get("otherColor"), "classify.otherColor");
        }

        void graduated(JsonNode n) {
            onlyKeys(n, "classify.", Set.of("type", "field", "method", "breaks", "colors", "otherColor"));
            column(n.get("field"), "classify.field", true);
            String method = text(n.get("method"), "classify.method");
            if (!METHODS.contains(method)) throw fail("classify.method", "quantile, equal, manual 중 하나");
            JsonNode colors = n.get("colors");
            if (colors == null || !colors.isArray()) throw fail("classify.colors", "배열이어야 합니다");
            if (colors.size() < GRADUATED_COLORS_MIN || colors.size() > GRADUATED_COLORS_MAX) {
                throw fail("classify.colors", GRADUATED_COLORS_MIN + "~" + GRADUATED_COLORS_MAX + "개여야 합니다");
            }
            // 구간 색은 알파 없는 #rrggbb만 — 지도 패키지가 구간 색을 #rrggbb로만 읽어서, 알파가 붙은 값이 저장되면 구간 색칠이 통째로 무시된다
            for (int i = 0; i < colors.size(); i++) solidColor(colors.get(i), "classify.colors[" + i + "]");
            JsonNode breaks = n.get("breaks");
            if (breaks == null || !breaks.isArray()) throw fail("classify.breaks", "배열이어야 합니다");
            if (breaks.size() != colors.size() - 1) throw fail("classify.breaks", "색 개수보다 하나 적어야 합니다(색 " + colors.size() + "개 → " + (colors.size() - 1) + "개)");
            double prev = Double.NEGATIVE_INFINITY;
            for (int i = 0; i < breaks.size(); i++) {
                JsonNode b = breaks.get(i);
                String at = "classify.breaks[" + i + "]";
                if (!b.isNumber()) throw fail(at, "숫자여야 합니다");
                double x = b.asDouble();
                if (!Double.isFinite(x) || Math.abs(x) >= BREAK_ABS_LIMIT) throw fail(at, "절댓값이 1e15 미만인 숫자여야 합니다");
                if (x < prev) throw fail(at, "오름차순이어야 합니다");
                prev = x;
            }
            if (n.has("otherColor")) color(n.get("otherColor"), "classify.otherColor");
        }

        void label(JsonNode n) {
            if (!n.isObject()) throw fail("label", "객체 또는 null이어야 합니다");
            onlyKeys(n, "label.", Set.of("field", "size", "color", "halo", "minZoom"));
            column(n.get("field"), "label.field", false);
            if (n.has("size")) range(n.get("size"), "label.size", LABEL_SIZE_MIN, LABEL_SIZE_MAX);
            if (n.has("color")) color(n.get("color"), "label.color");
            if (n.has("halo")) color(n.get("halo"), "label.halo");
            if (n.has("minZoom")) {
                JsonNode z = n.get("minZoom");
                if (!z.isIntegralNumber() || !z.canConvertToInt() || z.asInt() < MIN_ZOOM_MIN || z.asInt() > MIN_ZOOM_MAX) {
                    throw fail("label.minZoom", MIN_ZOOM_MIN + "~" + MIN_ZOOM_MAX + " 정수여야 합니다");
                }
            }
        }

        void popup(JsonNode n) {
            if (!n.isObject()) throw fail("popup", "객체 또는 null이어야 합니다");
            onlyKeys(n, "popup.", Set.of("fields"));
            JsonNode fields = n.get("fields");
            if (fields == null || !fields.isArray()) throw fail("popup.fields", "배열이어야 합니다");
            // 빈 배열 = 이 레이어는 팝업 끔(popup이 없거나 null이면 기본 — 앞 5개 컬럼)
            if (fields.size() > POPUP_FIELDS_MAX) throw fail("popup.fields", "최대 " + POPUP_FIELDS_MAX + "개여야 합니다");
            Set<String> seen = new HashSet<>();
            for (int i = 0; i < fields.size(); i++) {
                String at = "popup.fields[" + i + "]";
                String name = column(fields.get(i), at, false);
                if (!seen.add(name)) throw fail(at, "같은 컬럼이 두 번 있습니다");
            }
        }

        // ----- 작은 검사들 -----

        void onlyKeys(JsonNode n, String prefix, Set<String> allowed) {
            for (Iterator<String> it = n.fieldNames(); it.hasNext(); ) {
                String k = it.next();
                if (!allowed.contains(k)) throw fail(prefix + k, "알 수 없는 항목입니다");
            }
        }

        String text(JsonNode n, String path) {
            if (n == null || !n.isTextual()) throw fail(path, "글자여야 합니다");
            return n.asText();
        }

        void color(JsonNode n, String path) {
            if (n == null || !n.isTextual() || !COLOR.matcher(n.asText()).matches()) {
                throw fail(path, "#rrggbb 또는 #rrggbbaa 색이어야 합니다");
            }
        }

        void solidColor(JsonNode n, String path) {
            if (n == null || !n.isTextual() || !SOLID_COLOR.matcher(n.asText()).matches()) {
                throw fail(path, "#rrggbb 색이어야 합니다(알파 없음)");
            }
        }

        void range(JsonNode n, String path, double lo, double hi) {
            if (n == null || !n.isNumber()) throw fail(path, "숫자여야 합니다");
            double x = n.asDouble();
            if (!(x >= lo && x <= hi)) throw fail(path, lo + "~" + hi + " 범위여야 합니다");
        }

        /** 컬럼 이름 하나. 레이어 컬럼을 알면 그 안에 있어야 하고, numberOnly면 숫자 컬럼이어야 한다(종류를 알 때). */
        String column(JsonNode n, String path, boolean numberOnly) {
            if (n == null || !n.isTextual() || n.asText().isEmpty()) throw fail(path, "컬럼 이름(글자)이어야 합니다");
            String name = n.asText();
            if (name.length() > NAME_MAX) throw fail(path, "이름이 " + NAME_MAX + "자를 넘습니다");
            if (knowsColumns) {
                Column c = columns.get(name);
                if (c == null) throw fail(path, "이 레이어에 없는 컬럼입니다: " + name);
                if (numberOnly && c.kind() != null && !"number".equals(c.kind())) throw fail(path, "숫자 컬럼만 쓸 수 있습니다: " + name);
            }
            return name;
        }
    }
}
