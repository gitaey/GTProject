package com.gtp.domain.mymap.util;

import com.gtp.domain.mymap.util.StyleConfigValidator.Column;
import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/** 스타일 스키마 v1 검사 — 허용 키·타입·범위·길이·크기·색 형식·컬럼 존재/종류. 위반은 항목 경로가 적힌 400. */
class StyleConfigValidatorTest {

    static final List<Column> COLS = List.of(new Column("이름", "text"), new Column("구분", "text"), new Column("직원수", "number"),
            new Column("면적", "number"), new Column("종류모름", null));

    static final String FULL = """
            {"v":1,"display":"polygon","fill":"#F26722","fillOpacity":0.2,"stroke":"#F26722","strokeWidth":2,"pointRadius":5,
             "classify":{"type":"graduated","field":"직원수","method":"quantile","breaks":[800,1000,1200,1500],
                         "colors":["#fee5d9","#fcae91","#fb6a4a","#de2d26","#a50f15"],"otherColor":"#9ca3af"},
             "label":{"field":"이름","size":12,"color":"#111827","halo":"#ffffff","minZoom":15},
             "popup":{"fields":["이름","직원수"]}}""";

    private static void ok(String json) {
        assertThatCode(() -> StyleConfigValidator.validate(json, COLS)).as(json).doesNotThrowAnyException();
    }

    /** 400 MYMAP_STYLE_INVALID이고 메시지에 해당 항목 경로가 있어야 한다. */
    private static void bad(String json, String path) {
        bad(json, COLS, path);
    }

    private static void bad(String json, List<Column> cols, String path) {
        try {
            StyleConfigValidator.validate(json, cols);
        } catch (CustomException e) {
            assertThat(e.getErrorCode()).isEqualTo(GisErrorCode.MYMAP_STYLE_INVALID);
            assertThat(e.getErrorCode().getStatus().value()).isEqualTo(400);
            assertThat(e.getMessage()).as(json).contains("스타일 설정이 올바르지 않습니다").contains(path);
            return;
        }
        throw new AssertionError("거절해야 합니다: " + json);
    }

    private static String root(String extra) {
        return "{\"v\":1," + extra + "}";
    }

    // ---------- 통과 ----------

    @Test
    void 설계의_전체_예시와_최소_설정은_통과() {
        ok(FULL);
        ok("{\"v\":1}");
        ok("{ \"v\" : 1 , \"classify\": null, \"label\": null, \"popup\": null }");
    }

    @Test
    void 비어_있으면_기본값으로_통과_호출한_쪽이_지운다() {
        assertThatCode(() -> StyleConfigValidator.validate(null, COLS)).doesNotThrowAnyException();
        assertThatCode(() -> StyleConfigValidator.validate("", COLS)).doesNotThrowAnyException();
        assertThatCode(() -> StyleConfigValidator.validate("   \n", COLS)).doesNotThrowAnyException();
    }

    @Test
    void 경계값은_통과() {
        ok(root("\"fillOpacity\":0,\"strokeWidth\":0,\"pointRadius\":1"));
        ok(root("\"fillOpacity\":1,\"strokeWidth\":20,\"pointRadius\":50"));
        ok(root("\"fill\":\"#aabbccdd\",\"stroke\":\"#AABBCC\""));
        ok(root("\"display\":\"point\""));
        ok(root("\"label\":{\"field\":\"이름\",\"size\":8,\"minZoom\":0}"));
        ok(root("\"label\":{\"field\":\"이름\",\"size\":40,\"minZoom\":28}"));
        ok(root("\"label\":{\"field\":\"이름\"}"));   // 라벨은 컬럼만 있으면 나머지는 기본값
    }

    @Test
    void 범주형_12개와_구간형_3_7개는_통과() {
        StringBuilder cls = new StringBuilder();
        for (int i = 0; i < StyleConfigValidator.CLASSES_MAX; i++) cls.append(i == 0 ? "" : ",").append("{\"value\":\"v").append(i).append("\",\"color\":\"#2563eb\"}");
        ok(root("\"classify\":{\"type\":\"categorical\",\"field\":\"구분\",\"classes\":[" + cls + "],\"otherColor\":\"#9ca3af\"}"));
        ok(root("\"classify\":{\"type\":\"categorical\",\"field\":\"구분\",\"classes\":[{\"value\":\"\",\"color\":\"#2563eb\"}]}"));   // 빈 값 범주도 가능
        ok(root("\"classify\":{\"type\":\"graduated\",\"field\":\"면적\",\"method\":\"manual\",\"breaks\":[1,2],\"colors\":[\"#111111\",\"#222222\",\"#333333\"]}"));
        ok(root("\"classify\":{\"type\":\"graduated\",\"field\":\"면적\",\"method\":\"equal\",\"breaks\":[1,2,3,4,5,6],"
                + "\"colors\":[\"#111111\",\"#222222\",\"#333333\",\"#444444\",\"#555555\",\"#666666\",\"#777777\"]}"));
        // 같은 경계값(분위수가 겹칠 때)과 소수·음수·지수 표기
        ok(root("\"classify\":{\"type\":\"graduated\",\"field\":\"면적\",\"method\":\"quantile\",\"breaks\":[-1.5,2,2e3],\"colors\":[\"#111111\",\"#222222\",\"#333333\",\"#444444\"]}"));
        ok(root("\"classify\":{\"type\":\"graduated\",\"field\":\"면적\",\"method\":\"quantile\",\"breaks\":[5,5],\"colors\":[\"#111111\",\"#222222\",\"#333333\"]}"));
    }

    @Test
    void 팝업_컬럼_30개는_통과() {
        List<Column> many = new ArrayList<>();
        StringBuilder fields = new StringBuilder();
        for (int i = 0; i < StyleConfigValidator.POPUP_FIELDS_MAX; i++) {
            many.add(new Column("c" + i, "text"));
            fields.append(i == 0 ? "" : ",").append("\"c").append(i).append("\"");
        }
        assertThatCode(() -> StyleConfigValidator.validate(root("\"popup\":{\"fields\":[" + fields + "]}"), many)).doesNotThrowAnyException();
    }

    @Test
    void 컬럼_목록을_모르면_컬럼_이름_종류_검사는_건너뛴다() {
        String style = root("\"label\":{\"field\":\"아무거나\"},\"popup\":{\"fields\":[\"없는컬럼\"]},"
                + "\"classify\":{\"type\":\"graduated\",\"field\":\"글자컬럼\",\"method\":\"manual\",\"breaks\":[1,2],\"colors\":[\"#111111\",\"#222222\",\"#333333\"]}");
        assertThatCode(() -> StyleConfigValidator.validate(style)).doesNotThrowAnyException();
        assertThatCode(() -> StyleConfigValidator.validate(style, null)).doesNotThrowAnyException();
        assertThatCode(() -> StyleConfigValidator.validate(style, List.of())).doesNotThrowAnyException();
        // 컬럼을 몰라도 모양·범위는 본다
        bad(root("\"label\":{\"field\":\"x\",\"size\":99}"), null, "label.size");
    }

    @Test
    void 종류를_모르는_컬럼은_구간형에_쓸_수_있다() {
        ok(root("\"classify\":{\"type\":\"graduated\",\"field\":\"종류모름\",\"method\":\"manual\",\"breaks\":[1,2],\"colors\":[\"#111111\",\"#222222\",\"#333333\"]}"));
    }

    // ---------- 전체 모양 ----------

    @Test
    void JSON_객체가_아니거나_깨졌으면_거절() {
        bad("{깨진", "전체");
        bad("[1,2]", "전체");
        bad("\"문자열\"", "전체");
        bad("123", "전체");
        bad("null", "전체");
        bad("{\"v\":1} 뒤에 붙은 글자", "전체");
        bad("{\"v\":1}{\"v\":1}", "전체");
        bad("{\"v\":1,\"v\":1}", "전체");                     // 중복 키
        bad("{\"v\":1,\"fill\":\"#111111\",\"fill\":\"#222222\"}", "전체");
    }

    @Test
    void 크기는_16KB_이하_UTF8_바이트() {
        String pad = "가".repeat(6000);   // 한글 3바이트 × 6000 = 18,000바이트
        bad("{\"v\":1,\"label\":{\"field\":\"" + pad + "\"}}", "크기");
        String ascii = "a".repeat(StyleConfigValidator.MAX_BYTES);
        bad("{\"v\":1,\"x\":\"" + ascii + "\"}", "크기");
        // 정확히 한도 이하는 모양 검사까지 간다(여기서는 알 수 없는 키로 거절 — 크기 때문이 아님)
        String justUnder = "{\"v\":1,\"x\":\"" + "a".repeat(StyleConfigValidator.MAX_BYTES - 20) + "\"}";
        bad(justUnder, "x");
    }

    @Test
    void v는_필수이고_정수_1만() {
        bad("{}", "v");
        bad("{\"fill\":\"#111111\"}", "v");
        bad("{\"v\":2}", "v");
        bad("{\"v\":0}", "v");
        bad("{\"v\":\"1\"}", "v");
        bad("{\"v\":1.0}", "v");
        bad("{\"v\":null}", "v");
        bad("{\"v\":true}", "v");
    }

    @Test
    void 모르는_키는_거절한다_조용히_버리지_않는다() {
        bad(root("\"zoom\":3"), "zoom");
        bad(root("\"label\":{\"field\":\"이름\",\"bold\":true}"), "label.bold");
        bad(root("\"popup\":{\"fields\":[\"이름\"],\"title\":\"x\"}"), "popup.title");
        bad(root("\"classify\":{\"type\":\"categorical\",\"field\":\"구분\",\"classes\":[{\"value\":\"a\",\"color\":\"#111111\"}],\"method\":\"manual\"}"), "classify.method");
        bad(root("\"classify\":{\"type\":\"graduated\",\"field\":\"면적\",\"method\":\"manual\",\"breaks\":[1,2],\"colors\":[\"#111111\",\"#222222\",\"#333333\"],\"classes\":[]}"), "classify.classes");
        bad(root("\"classify\":{\"type\":\"categorical\",\"field\":\"구분\",\"classes\":[{\"value\":\"a\",\"color\":\"#111111\",\"label\":\"x\"}]}"), "classify.classes[0].label");
    }

    // ---------- 기본 스타일 항목 ----------

    @Test
    void display는_polygon_또는_point() {
        bad(root("\"display\":\"line\""), "display");
        bad(root("\"display\":1"), "display");
        bad(root("\"display\":null"), "display");
        bad(root("\"display\":\"Polygon\""), "display");
    }

    @Test
    void 색은_rrggbb_또는_rrggbbaa만() {
        for (String c : new String[]{"red", "#fff", "#12345", "#1234567", "#gggggg", "rgb(1,2,3)", "F26722", "#F26722 ", "transparent"}) {
            bad(root("\"fill\":\"" + c + "\""), "fill");
            bad(root("\"stroke\":\"" + c + "\""), "stroke");
        }
        bad(root("\"fill\":null"), "fill");
        bad(root("\"fill\":123456"), "fill");
        bad(root("\"stroke\":[\"#111111\"]"), "stroke");
        bad(root("\"label\":{\"field\":\"이름\",\"color\":\"blue\"}"), "label.color");
        bad(root("\"label\":{\"field\":\"이름\",\"halo\":\"#fff\"}"), "label.halo");
        bad(root("\"classify\":{\"type\":\"categorical\",\"field\":\"구분\",\"classes\":[{\"value\":\"a\",\"color\":\"red\"}]}"), "classify.classes[0].color");
        bad(root("\"classify\":{\"type\":\"categorical\",\"field\":\"구분\",\"classes\":[{\"value\":\"a\",\"color\":\"#111111\"}],\"otherColor\":\"#999\"}"), "classify.otherColor");
        bad(root("\"classify\":{\"type\":\"graduated\",\"field\":\"면적\",\"method\":\"manual\",\"breaks\":[1,2],\"colors\":[\"#111111\",\"#222\",\"#333333\"]}"), "classify.colors[1]");
    }

    @Test
    void 숫자_범위() {
        bad(root("\"fillOpacity\":1.1"), "fillOpacity");
        bad(root("\"fillOpacity\":-0.1"), "fillOpacity");
        bad(root("\"fillOpacity\":\"0.5\""), "fillOpacity");
        bad(root("\"fillOpacity\":null"), "fillOpacity");
        bad(root("\"strokeWidth\":21"), "strokeWidth");
        bad(root("\"strokeWidth\":-1"), "strokeWidth");
        bad(root("\"strokeWidth\":\"2\""), "strokeWidth");
        bad(root("\"pointRadius\":0.5"), "pointRadius");
        bad(root("\"pointRadius\":51"), "pointRadius");
        bad(root("\"pointRadius\":true"), "pointRadius");
    }

    // ---------- 값별 색 ----------

    @Test
    void classify는_객체_또는_null이고_type이_있어야() {
        bad(root("\"classify\":\"x\""), "classify");
        bad(root("\"classify\":[]"), "classify");
        bad(root("\"classify\":{}"), "classify.type");
        bad(root("\"classify\":{\"type\":\"heatmap\"}"), "classify.type");
        bad(root("\"classify\":{\"type\":1}"), "classify.type");
    }

    private static String cat(String body) {
        return root("\"classify\":{\"type\":\"categorical\"," + body + "}");
    }

    private static final String ONE_CLASS = "\"classes\":[{\"value\":\"a\",\"color\":\"#111111\"}]";

    @Test
    void 범주형_규칙() {
        bad(cat(ONE_CLASS), "classify.field");                                                     // field 없음
        bad(cat("\"field\":\"\"," + ONE_CLASS), "classify.field");
        bad(cat("\"field\":5," + ONE_CLASS), "classify.field");
        bad(cat("\"field\":\"없는컬럼\"," + ONE_CLASS), "없는컬럼");                                 // 레이어에 없는 컬럼
        bad(cat("\"field\":\"구분\""), "classify.classes");
        bad(cat("\"field\":\"구분\",\"classes\":{}"), "classify.classes");
        bad(cat("\"field\":\"구분\",\"classes\":[]"), "classify.classes");
        StringBuilder thirteen = new StringBuilder();
        for (int i = 0; i < 13; i++) thirteen.append(i == 0 ? "" : ",").append("{\"value\":\"v").append(i).append("\",\"color\":\"#111111\"}");
        bad(cat("\"field\":\"구분\",\"classes\":[" + thirteen + "]"), "classify.classes");
        bad(cat("\"field\":\"구분\",\"classes\":[{\"value\":\"a\",\"color\":\"#111111\"},{\"value\":\"a\",\"color\":\"#222222\"}]"), "classify.classes[1].value");
        bad(cat("\"field\":\"구분\",\"classes\":[1]"), "classify.classes[0]");
        bad(cat("\"field\":\"구분\",\"classes\":[{\"color\":\"#111111\"}]"), "classify.classes[0].value");
        bad(cat("\"field\":\"구분\",\"classes\":[{\"value\":3,\"color\":\"#111111\"}]"), "classify.classes[0].value");
        bad(cat("\"field\":\"구분\",\"classes\":[{\"value\":\"a\"}]"), "classify.classes[0].color");
        bad(cat("\"field\":\"구분\",\"classes\":[{\"value\":\"" + "가".repeat(201) + "\",\"color\":\"#111111\"}]"), "classify.classes[0].value");
        ok(cat("\"field\":\"구분\",\"classes\":[{\"value\":\"" + "가".repeat(200) + "\",\"color\":\"#111111\"}]"));
        ok(cat("\"field\":\"직원수\"," + ONE_CLASS));   // 숫자 컬럼으로 범주(값별) 칠하기도 가능
    }

    private static String grad(String body) {
        return root("\"classify\":{\"type\":\"graduated\"," + body + "}");
    }

    private static final String THREE = "\"colors\":[\"#111111\",\"#222222\",\"#333333\"]";

    @Test
    void 구간형_규칙() {
        bad(grad("\"method\":\"manual\",\"breaks\":[1,2]," + THREE), "classify.field");
        bad(grad("\"field\":\"구분\",\"method\":\"manual\",\"breaks\":[1,2]," + THREE), "숫자 컬럼");   // 글자 컬럼
        bad(grad("\"field\":\"없는컬럼\",\"method\":\"manual\",\"breaks\":[1,2]," + THREE), "없는컬럼");
        bad(grad("\"field\":\"면적\",\"breaks\":[1,2]," + THREE), "classify.method");
        bad(grad("\"field\":\"면적\",\"method\":\"jenks\",\"breaks\":[1,2]," + THREE), "classify.method");
        bad(grad("\"field\":\"면적\",\"method\":\"manual\",\"breaks\":[1]," + "\"colors\":[\"#111111\",\"#222222\"]"), "classify.colors");   // 색 2개
        bad(grad("\"field\":\"면적\",\"method\":\"manual\",\"breaks\":[1,2,3,4,5,6,7],"
                + "\"colors\":[\"#111111\",\"#222222\",\"#333333\",\"#444444\",\"#555555\",\"#666666\",\"#777777\",\"#888888\"]"), "classify.colors");   // 색 8개
        bad(grad("\"field\":\"면적\",\"method\":\"manual\",\"breaks\":[1,2]"), "classify.colors");
        bad(grad("\"field\":\"면적\",\"method\":\"manual\"," + THREE), "classify.breaks");
        bad(grad("\"field\":\"면적\",\"method\":\"manual\",\"breaks\":[1]," + THREE), "classify.breaks");        // 색 3개면 경계 2개
        bad(grad("\"field\":\"면적\",\"method\":\"manual\",\"breaks\":[1,2,3]," + THREE), "classify.breaks");
        bad(grad("\"field\":\"면적\",\"method\":\"manual\",\"breaks\":[\"1\",2]," + THREE), "classify.breaks[0]");
        bad(grad("\"field\":\"면적\",\"method\":\"manual\",\"breaks\":[1,null]," + THREE), "classify.breaks[1]");
        bad(grad("\"field\":\"면적\",\"method\":\"manual\",\"breaks\":[5,4]," + THREE), "classify.breaks[1]");     // 내림차순
        bad(grad("\"field\":\"면적\",\"method\":\"manual\",\"breaks\":[1,1e16]," + THREE), "classify.breaks[1]");
        bad(grad("\"field\":\"면적\",\"method\":\"manual\",\"breaks\":[-1e16,1]," + THREE), "classify.breaks[0]");
    }

    @Test
    void 구간_경계는_절댓값_1e15_미만이고_숫자_판정과_같은_상한() {
        String t = "\"field\":\"면적\",\"method\":\"manual\"";
        ok(grad(t + ",\"breaks\":[-999999999999999,999999999999999]," + THREE));
        ok(grad(t + ",\"breaks\":[-9.99e14,9.99e14]," + THREE));
        bad(grad(t + ",\"breaks\":[1,1e15]," + THREE), "classify.breaks[1]");        // 1e15 자체도 거절(숫자 판정과 같다)
        bad(grad(t + ",\"breaks\":[-1e15,1]," + THREE), "classify.breaks[0]");
        bad(grad(t + ",\"breaks\":[1,9e15]," + THREE), "classify.breaks[1]");
        bad(grad(t + ",\"breaks\":[1,1000000000000000]," + THREE), "classify.breaks[1]");
        bad(grad(t + ",\"breaks\":[1,1e400]," + THREE), "classify.breaks[1]");
        assertThat(StyleConfigValidator.BREAK_ABS_LIMIT).isEqualTo(NumericText.ABS_LIMIT).isEqualTo(1e15);
        // 숫자로 읽히는 값에서 나온 경계(최솟값·최댓값)는 항상 통과해야 한다
        assertThat(Math.abs(NumericText.parse("999999999999999.5"))).isLessThan(StyleConfigValidator.BREAK_ABS_LIMIT);
    }

    @Test
    void 정수_넘침_버전과_최소_줌은_int로_줄여_비교하지_않고_거절() {
        bad("{\"v\":4294967297}", "v");           // 2^32 + 1: int로 줄이면 1
        bad("{\"v\":-4294967295}", "v");
        bad("{\"v\":4294967296}", "v");           // int로 줄이면 0
        bad("{\"v\":99999999999999999999}", "v");  // BigInteger
        bad(root("\"label\":{\"field\":\"이름\",\"minZoom\":4294967297}"), "label.minZoom");   // int로 줄이면 1
        bad(root("\"label\":{\"field\":\"이름\",\"minZoom\":4294967311}"), "label.minZoom");   // 2^32 + 15 → 15
        bad(root("\"label\":{\"field\":\"이름\",\"minZoom\":99999999999999999999}"), "label.minZoom");
        ok(root("\"label\":{\"field\":\"이름\",\"minZoom\":15}"));
    }

    @Test
    void 점_색과_테두리_키는_허용_범위와_색_형식을_지킨다() {
        ok(root("\"pointColor\":\"#2563eb\",\"pointStroke\":\"#ffffff\",\"pointStrokeWidth\":1"));
        ok(root("\"pointColor\":\"#2563ebcc\",\"pointStroke\":\"#00000080\",\"pointStrokeWidth\":0"));
        ok(root("\"pointStrokeWidth\":10"));
        ok(root("\"pointColor\":\"#2563eb\""));     // 하나만 보내도 된다(나머지는 기본)
        ok(root("\"pointStroke\":\"#FFFFFF\""));
        for (String c : new String[]{"red", "#fff", "#12345", "#gggggg", "rgb(1,2,3)", "2563eb"}) {
            bad(root("\"pointColor\":\"" + c + "\""), "pointColor");
            bad(root("\"pointStroke\":\"" + c + "\""), "pointStroke");
        }
        bad(root("\"pointColor\":null"), "pointColor");        // 선 색을 따르려면 키를 빼는 것이 규칙(null은 거절)
        bad(root("\"pointStroke\":null"), "pointStroke");
        bad(root("\"pointColor\":123456"), "pointColor");
        bad(root("\"pointStrokeWidth\":-0.1"), "pointStrokeWidth");
        bad(root("\"pointStrokeWidth\":10.1"), "pointStrokeWidth");
        bad(root("\"pointStrokeWidth\":11"), "pointStrokeWidth");
        bad(root("\"pointStrokeWidth\":\"1\""), "pointStrokeWidth");
        bad(root("\"pointStrokeWidth\":null"), "pointStrokeWidth");
        // 오타·옛 이름은 여전히 거절
        bad(root("\"pointFill\":\"#111111\""), "pointFill");
        bad(root("\"pointStrokeColor\":\"#111111\""), "pointStrokeColor");
    }

    @Test
    void 팝업_빈_배열은_허용하지만_null_배열이_아닌_값과_중복은_거절() {
        ok(root("\"popup\":{\"fields\":[]}"));
        ok(root("\"popup\":null"));
        ok(root("\"popup\":{\"fields\":[\"이름\"]}"));
        bad(root("\"popup\":{\"fields\":null}"), "popup.fields");
        bad(root("\"popup\":{\"fields\":{}}"), "popup.fields");
        bad(root("\"popup\":{\"fields\":[\"이름\",\"이름\"]}"), "popup.fields[1]");
        bad(root("\"popup\":{\"fields\":[\"없는컬럼\"]}"), "popup.fields[0]");
    }

    @Test
    void 구간_색은_알파_없는_rrggbb만_다른_색은_알파_허용() {
        String base = "\"field\":\"면적\",\"method\":\"manual\",\"breaks\":[1,2]";
        ok(grad(base + ",\"colors\":[\"#111111\",\"#222222\",\"#333333\"]"));
        bad(grad(base + ",\"colors\":[\"#111111\",\"#22222280\",\"#333333\"]"), "classify.colors[1]");
        bad(grad(base + ",\"colors\":[\"#111111\",\"#222222\",\"#33333380\"]"), "classify.colors[2]");
        // 범주 색·기타 색·채우기 색은 알파를 허용한다(프론트가 알파를 버리고 읽는다)
        ok(cat("\"field\":\"구분\",\"classes\":[{\"value\":\"a\",\"color\":\"#11111180\"}],\"otherColor\":\"#22222280\""));
        ok(grad(base + ",\"colors\":[\"#111111\",\"#222222\",\"#333333\"],\"otherColor\":\"#99999980\""));
    }

    @Test
    void 구간형_기타_색도_색_형식을_지켜야_한다() {
        String base = "\"field\":\"면적\",\"method\":\"manual\",\"breaks\":[1,2],\"colors\":[\"#111111\",\"#222222\",\"#333333\"]";
        ok(grad(base + ",\"otherColor\":\"#9ca3af\""));
        bad(grad(base + ",\"otherColor\":\"gray\""), "classify.otherColor");
        bad(grad(base + ",\"otherColor\":null"), "classify.otherColor");
    }

    @Test
    void 컬럼_목록을_몰라도_빈_컬럼_이름은_거절() {
        bad(root("\"label\":{\"field\":\"\"}"), null, "label.field");
        bad(root("\"popup\":{\"fields\":[\"\"]}"), List.of(), "popup.fields[0]");
        bad(cat("\"field\":\"\"," + ONE_CLASS), null, "classify.field");
    }

    // ---------- 라벨·팝업 ----------

    @Test
    void 라벨_규칙() {
        bad(root("\"label\":\"x\""), "label");
        bad(root("\"label\":{}"), "label.field");
        bad(root("\"label\":{\"field\":\"없는컬럼\"}"), "없는컬럼");
        bad(root("\"label\":{\"field\":\"\"}"), "label.field");
        bad(root("\"label\":{\"field\":7}"), "label.field");
        bad(root("\"label\":{\"field\":\"이름\",\"size\":7}"), "label.size");
        bad(root("\"label\":{\"field\":\"이름\",\"size\":41}"), "label.size");
        bad(root("\"label\":{\"field\":\"이름\",\"size\":\"12\"}"), "label.size");
        bad(root("\"label\":{\"field\":\"이름\",\"minZoom\":-1}"), "label.minZoom");
        bad(root("\"label\":{\"field\":\"이름\",\"minZoom\":29}"), "label.minZoom");
        bad(root("\"label\":{\"field\":\"이름\",\"minZoom\":15.5}"), "label.minZoom");
        bad(root("\"label\":{\"field\":\"이름\",\"minZoom\":\"15\"}"), "label.minZoom");
        bad(root("\"label\":{\"field\":\"" + "가".repeat(201) + "\"}"), null, "label.field");
    }

    @Test
    void 팝업_규칙() {
        bad(root("\"popup\":[]"), "popup");
        bad(root("\"popup\":{}"), "popup.fields");
        bad(root("\"popup\":{\"fields\":\"이름\"}"), "popup.fields");
        ok(root("\"popup\":{\"fields\":[]}"));   // 빈 배열 = 이 레이어는 팝업 끔(허용)
        bad(root("\"popup\":{\"fields\":[\"이름\",\"없는컬럼\"]}"), "popup.fields[1]");
        bad(root("\"popup\":{\"fields\":[\"이름\",\"이름\"]}"), "popup.fields[1]");
        bad(root("\"popup\":{\"fields\":[\"이름\",3]}"), "popup.fields[1]");
        bad(root("\"popup\":{\"fields\":[\"\"]}"), "popup.fields[0]");
        List<Column> many = new ArrayList<>();
        StringBuilder fields = new StringBuilder();
        for (int i = 0; i < 31; i++) {
            many.add(new Column("c" + i, "text"));
            fields.append(i == 0 ? "" : ",").append("\"c").append(i).append("\"");
        }
        bad(root("\"popup\":{\"fields\":[" + fields + "]}"), many, "popup.fields");
    }

    @Test
    void 위반은_GisErrorCode의_400이고_메시지에_이유가_있다() {
        try {
            StyleConfigValidator.validate(root("\"fillOpacity\":3"), COLS);
            throw new AssertionError("거절해야 함");
        } catch (CustomException e) {
            assertThat(e.getErrorCode()).isSameAs(GisErrorCode.MYMAP_STYLE_INVALID);
            assertThat(e.getMessage()).isEqualTo("스타일 설정이 올바르지 않습니다: fillOpacity — 0.0~1.0 범위여야 합니다");
        }
    }
}
