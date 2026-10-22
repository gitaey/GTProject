package com.gtp.domain.mymap.util;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.io.InputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/**
 * 서버 {@link NumericText}와 프론트 {@code readNumber}(packages/gis-map core/lib/mymapStyleConfig.ts)가 같은 규칙인지 표로 고정한다.
 * 같은 표(src/test/resources/mymap/numeric-cases.json — [입력, 기대 숫자|null])를 프론트도 읽어 검사했다(프론트 쪽은 esbuild로 번들해
 * Node에서 같은 표를 돌렸다. 기록: _workspace/mymap/03_impl_backend.md 3단계). 표를 고치면 양쪽을 다시 맞춘다.
 */
class NumericTextTableTest {

    @Test
    void 공유_표의_모든_사례가_서버_규칙과_같다() throws Exception {
        try (InputStream in = getClass().getResourceAsStream("/mymap/numeric-cases.json")) {
            assertThat(in).isNotNull();
            JsonNode cases = new ObjectMapper().readTree(in);
            assertThat(cases.size()).isGreaterThan(90);
            for (JsonNode c : cases) {
                String raw = c.get(0).asText();
                JsonNode expected = c.get(1);
                Double got = NumericText.parse(raw);
                String shown = "입력 [" + raw.replace("\u00A0", "\u00A0").replace("\uFEFF", "\uFEFF") + "]";
                if (expected.isNull()) {
                    assertThat(got).as(shown + " → 숫자가 아니어야 함").isNull();
                } else {
                    assertThat(got).as(shown + " → " + expected.asText()).isNotNull();
                    assertThat(got).as(shown).isCloseTo(expected.asDouble(), within(1e-9 * Math.max(1, Math.abs(expected.asDouble()))));
                }
            }
        }
    }
}
