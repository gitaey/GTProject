package com.gtp.domain.mymap.util;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ColumnStatsCollectorTest {

    static final ObjectMapper OM = new ObjectMapper();

    private static JsonNode json(ColumnStatsCollector c, boolean truncated) throws Exception {
        return OM.readTree(c.toJson(truncated));
    }

    private static JsonNode col(JsonNode root, String name) {
        for (JsonNode c : root.get("columns")) if (c.get("name").asText().equals(name)) return c;
        throw new AssertionError("컬럼 없음: " + name);
    }

    @Test
    void 기본_모양_버전_행수_컬럼_순서() throws Exception {
        ColumnStatsCollector c = new ColumnStatsCollector(List.of("이름", "직원수", "구분"));
        c.addRow(List.of("서울", "1,100", "청사"));
        c.addRow(List.of("세종", "900", "청사"));
        c.addRow(List.of("부산", "1500", "시설"));
        JsonNode r = json(c, false);
        assertThat(r.get("v").asInt()).isEqualTo(ColumnStatsCollector.SCHEMA_VERSION).isEqualTo(1);
        assertThat(r.get("rowCount").asLong()).isEqualTo(3);
        assertThat(r.get("truncated").asBoolean()).isFalse();
        assertThat(r.get("columns")).extracting(n -> n.get("name").asText()).containsExactly("이름", "직원수", "구분");
        assertThat(json(c, true).get("truncated").asBoolean()).isTrue();
        assertThat(c.rows()).isEqualTo(3);
    }

    @Test
    void 숫자_컬럼은_kind_number와_min_max_분위수를_갖고_글자_컬럼은_갖지_않는다() throws Exception {
        ColumnStatsCollector c = new ColumnStatsCollector(List.of("직원수", "구분", "면적"));
        c.addRow(List.of("1,100", "청사", "37.5"));
        c.addRow(List.of("900", "청사", "12.25"));
        c.addRow(List.of("1500", "시설", "-3"));
        JsonNode r = json(c, false);

        JsonNode staff = col(r, "직원수");
        assertThat(staff.get("kind").asText()).isEqualTo("number");
        assertThat(staff.get("min").isIntegralNumber()).isTrue();     // 정수는 정수로
        assertThat(staff.get("min").asLong()).isEqualTo(900);
        assertThat(staff.get("max").asLong()).isEqualTo(1500);
        assertThat(staff.get("quantiles")).hasSize(ColumnStatsCollector.QUANTILE_POINTS).hasSize(21);
        assertThat(staff.get("quantiles").get(0).asLong()).isEqualTo(900);
        assertThat(staff.get("quantiles").get(20).asLong()).isEqualTo(1500);
        assertThat(staff.get("quantiles").get(10).asDouble()).isEqualTo(1100.0);   // 중앙값
        assertThat(staff.get("numericCount").asLong()).isEqualTo(3);

        JsonNode area = col(r, "면적");
        assertThat(area.get("min").asDouble()).isEqualTo(-3.0);
        assertThat(area.get("max").asDouble()).isEqualTo(37.5);

        JsonNode kind = col(r, "구분");
        assertThat(kind.get("kind").asText()).isEqualTo("text");
        assertThat(kind.has("min")).isFalse();
        assertThat(kind.has("max")).isFalse();
        assertThat(kind.has("quantiles")).isFalse();
        assertThat(kind.get("numericCount").asLong()).isZero();
    }

    @Test
    void 숫자_판정은_채워진_칸의_90퍼센트_이상() throws Exception {
        ColumnStatsCollector nine = new ColumnStatsCollector(List.of("a"));
        for (int i = 0; i < 9; i++) nine.addRow(List.of(String.valueOf(i + 1)));
        nine.addRow(List.of("-"));                       // 10칸 중 숫자 9칸 = 90%
        assertThat(col(json(nine, false), "a").get("kind").asText()).isEqualTo("number");
        assertThat(col(json(nine, false), "a").get("max").asLong()).isEqualTo(9);   // 숫자로 읽히는 값만으로 계산

        ColumnStatsCollector eight = new ColumnStatsCollector(List.of("a"));
        for (int i = 0; i < 8; i++) eight.addRow(List.of(String.valueOf(i + 1)));
        eight.addRow(List.of("-"));
        eight.addRow(List.of("없음"));                   // 10칸 중 8칸 = 80%
        assertThat(col(json(eight, false), "a").get("kind").asText()).isEqualTo("text");
    }

    @Test
    void 빈_값은_채워진_칸으로_세지_않는다() throws Exception {
        ColumnStatsCollector c = new ColumnStatsCollector(List.of("a", "b"));
        c.addRow(List.of("1", ""));
        c.addRow(List.of("2", "  "));
        c.addRow(java.util.Arrays.asList("3", null));
        c.addRow(List.of("4"));                          // 짧은 행: 모자란 칸은 빈 값
        JsonNode r = json(c, false);
        assertThat(col(r, "a").get("filled").asLong()).isEqualTo(4);
        assertThat(col(r, "b").get("filled").asLong()).isZero();
        assertThat(col(r, "b").get("kind").asText()).isEqualTo("text");   // 값이 하나도 없으면 text
        assertThat(col(r, "b").get("distinct").asLong()).isZero();
        assertThat(col(r, "b").get("top")).isEmpty();
        assertThat(c.rows()).isEqualTo(4);
    }

    @Test
    void 값의_앞뒤_공백은_프론트_trim_기준으로_떼고_센다() throws Exception {
        ColumnStatsCollector c = new ColumnStatsCollector(List.of("구분"));
        c.addRow(List.of(" 청사"));
        c.addRow(List.of("청사 "));
        c.addRow(List.of(" 청사 "));        // NBSP — Java strip()은 안 떼지만 JS trim은 뗀다
        c.addRow(List.of("﻿청사"));              // BOM
        c.addRow(List.of("　시설　"));
        c.addRow(List.of(" ﻿  "));   // JS 기준 공백뿐 → 빈 값
        c.addRow(List.of(""));                 // 제어문자 U+001C는 JS trim이 안 뗀다 → 값이 있는 것
        JsonNode col = col(json(c, false), "구분");
        assertThat(col.get("filled").asLong()).isEqualTo(6);
        assertThat(col.get("top").get(0).get("value").asText()).isEqualTo("청사");
        assertThat(col.get("top").get(0).get("count").asLong()).isEqualTo(4);
        assertThat(col.get("top")).extracting(n -> n.get("value").asText()).containsExactlyInAnyOrder("청사", "시설", "");   // 같은 개수는 값 순
        assertThat(col.get("distinct").asLong()).isEqualTo(3);
    }

    @Test
    void 앞자리_0_코드_컬럼과_PNU_컬럼은_글자로_본다() throws Exception {
        ColumnStatsCollector c = new ColumnStatsCollector(List.of("관리번호", "PNU"));
        for (int i = 0; i < 5; i++) c.addRow(List.of("00" + i + "7", "111401030010031000" + i));
        JsonNode r = json(c, false);
        assertThat(col(r, "관리번호").get("kind").asText()).isEqualTo("text");
        assertThat(col(r, "PNU").get("kind").asText()).isEqualTo("text");
    }

    @Test
    void 고유값_수와_많은_순_상위_값() throws Exception {
        ColumnStatsCollector c = new ColumnStatsCollector(List.of("구분"));
        for (int i = 0; i < 5; i++) c.addRow(List.of("청사"));
        for (int i = 0; i < 3; i++) c.addRow(List.of("시설"));
        for (int i = 0; i < 3; i++) c.addRow(List.of("가시설"));   // 개수가 같으면 값 순
        c.addRow(List.of("기타"));
        JsonNode col = col(json(c, false), "구분");
        assertThat(col.get("distinct").asLong()).isEqualTo(4);
        assertThat(col.get("distinctCapped").asBoolean()).isFalse();
        List<String> values = new ArrayList<>();
        List<Long> counts = new ArrayList<>();
        col.get("top").forEach(t -> {
            values.add(t.get("value").asText());
            counts.add(t.get("count").asLong());
        });
        assertThat(values).containsExactly("청사", "가시설", "시설", "기타");
        assertThat(counts).containsExactly(5L, 3L, 3L, 1L);
    }

    @Test
    void 상위_값은_20개까지_긴_값은_100자까지() throws Exception {
        ColumnStatsCollector c = new ColumnStatsCollector(List.of("v"));
        for (int i = 0; i < 50; i++) c.addRow(List.of("값" + String.format("%02d", i)));
        c.addRow(List.of("가".repeat(300)));
        JsonNode col = col(json(c, false), "v");
        assertThat(col.get("top")).hasSize(ColumnStatsCollector.TOP_N).hasSize(20);
        assertThat(col.get("distinct").asLong()).isEqualTo(51);
        // 긴 값은 100자로 잘려 들어간다(상위에 안 들어가도 고유값 수에는 센다)
        ColumnStatsCollector only = new ColumnStatsCollector(List.of("v"));
        only.addRow(List.of("가".repeat(300)));
        assertThat(col(json(only, false), "v").get("top").get(0).get("value").asText()).hasSize(ColumnStatsCollector.MAX_TOP_VALUE_CHARS);
    }

    @Test
    void 고유값이_1만을_넘으면_세기를_멈추고_distinctCapped() throws Exception {
        ColumnStatsCollector c = new ColumnStatsCollector(List.of("v"));
        for (int i = 0; i < ColumnStatsCollector.MAX_DISTINCT + 50; i++) c.addRow(List.of("값" + i));
        JsonNode col = col(json(c, false), "v");
        assertThat(col.get("distinct").asLong()).isEqualTo(ColumnStatsCollector.MAX_DISTINCT);
        assertThat(col.get("distinctCapped").asBoolean()).isTrue();
        assertThat(col.get("filled").asLong()).isEqualTo(ColumnStatsCollector.MAX_DISTINCT + 50);   // 채운 칸 수는 끝까지 센다
    }

    @Test
    void 분위수는_21개_5퍼센트_간격_값은_보간한다() throws Exception {
        ColumnStatsCollector c = new ColumnStatsCollector(List.of("n"));
        for (int i = 1; i <= 101; i++) c.addRow(List.of(String.valueOf(i)));   // 1..101
        JsonNode q = col(json(c, false), "n").get("quantiles");
        for (int k = 0; k <= 20; k++) assertThat(q.get(k).asDouble()).as("분위 " + k * 5 + "%").isEqualTo(1.0 + 5 * k);

        ColumnStatsCollector two = new ColumnStatsCollector(List.of("n"));
        two.addRow(List.of("0"));
        two.addRow(List.of("10"));
        JsonNode q2 = col(json(two, false), "n").get("quantiles");
        assertThat(q2.get(10).asDouble()).isEqualTo(5.0);   // 두 값 사이 보간
        assertThat(q2.get(5).asDouble()).isEqualTo(2.5);

        ColumnStatsCollector one = new ColumnStatsCollector(List.of("n"));
        one.addRow(List.of("7"));
        JsonNode q1 = col(json(one, false), "n").get("quantiles");
        assertThat(q1).hasSize(21);
        assertThat(q1.get(0).asLong()).isEqualTo(7);
        assertThat(q1.get(20).asLong()).isEqualTo(7);
    }

    @Test
    void 행이_아주_많아도_표본으로_근사하고_최소_최대는_정확하다() throws Exception {
        ColumnStatsCollector c = new ColumnStatsCollector(List.of("n"));
        int n = 40_000;
        for (int i = 1; i <= n; i++) c.addRow(List.of(String.valueOf(i)));
        JsonNode col = col(json(c, false), "n");
        assertThat(col.get("min").asLong()).isEqualTo(1);
        assertThat(col.get("max").asLong()).isEqualTo(n);
        assertThat(col.get("numericCount").asLong()).isEqualTo(n);
        double median = col.get("quantiles").get(10).asDouble();
        assertThat(median).as("저수지 표본(5,000개)으로 구한 중앙값").isBetween(n * 0.45, n * 0.55);
        assertThat(col.get("quantiles").get(0).asLong()).isEqualTo(1);
        assertThat(col.get("quantiles").get(20).asLong()).isEqualTo(n);
        // 같은 입력이면 같은 결과(고정 시드)
        ColumnStatsCollector again = new ColumnStatsCollector(List.of("n"));
        for (int i = 1; i <= n; i++) again.addRow(List.of(String.valueOf(i)));
        assertThat(again.toJson(false)).isEqualTo(c.toJson(false));
    }

    @Test
    void 컬럼_이름으로_채우는_행() throws Exception {
        ColumnStatsCollector c = new ColumnStatsCollector(List.of("a", "b"));
        c.addRow(Map.of("b", "2", "a", "1"));
        c.addRow(Map.of("a", "3"));                       // b가 없는 행
        JsonNode r = json(c, false);
        assertThat(col(r, "a").get("max").asLong()).isEqualTo(3);
        assertThat(col(r, "b").get("filled").asLong()).isEqualTo(1);
    }

    @Test
    void 컬럼이_없어도_죽지_않는다() throws Exception {
        ColumnStatsCollector c = new ColumnStatsCollector(List.of());
        c.addRow(List.of("x"));
        JsonNode r = json(c, false);
        assertThat(r.get("columns")).isEmpty();
        assertThat(r.get("rowCount").asLong()).isEqualTo(1);
    }

    @Test
    void 값이_전부_숫자_아님이면_숫자_컬럼이_아니다() throws Exception {
        ColumnStatsCollector c = new ColumnStatsCollector(List.of("a"));
        c.addRow(List.of("-"));
        c.addRow(List.of("n/a"));
        JsonNode col = col(json(c, false), "a");
        assertThat(col.get("kind").asText()).isEqualTo("text");
        assertThat(col.get("numericCount").asLong()).isZero();
    }
}
