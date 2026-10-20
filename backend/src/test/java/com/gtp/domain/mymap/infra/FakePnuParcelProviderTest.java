package com.gtp.domain.mymap.infra;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gtp.domain.mymap.port.Coverage;
import com.gtp.domain.mymap.port.ParcelShape;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class FakePnuParcelProviderTest {

    static final List<String> SAMPLE_PNUS = List.of("1114010300100310000", "3611010300107180000", "2647010200110000000",
            "2711010100100020001", "3017011200114200000", "2820010100111380000", "3114010400106460004");

    @Test
    void fixture에_샘플_엑셀_7곳과_시험용_필지가_있다() {
        FakePnuParcelProvider p = FakePnuParcelProvider.fromClasspath(new ObjectMapper());
        assertThat(p.size()).isGreaterThanOrEqualTo(30);
        Map<String, ParcelShape> found = p.findByPnus(SAMPLE_PNUS);
        assertThat(found).containsOnlyKeys(SAMPLE_PNUS);
    }

    @Test
    void 모양은_닫힌_사각형_Polygon_GeoJSON() throws Exception {
        FakePnuParcelProvider p = FakePnuParcelProvider.fromClasspath(new ObjectMapper());
        ParcelShape s = p.findByPnus(List.of("3611010300107180000")).get("3611010300107180000");
        JsonNode g = new ObjectMapper().readTree(s.geometryJson());
        assertThat(g.get("type").asText()).isEqualTo("Polygon");
        JsonNode ring = g.get("coordinates").get(0);
        assertThat(ring).hasSize(5);
        assertThat(ring.get(0)).isEqualTo(ring.get(4));
        // 세종시청 부근(127.289, 36.480) 안쪽
        double lon = ring.get(0).get(0).asDouble(), lat = ring.get(0).get(1).asDouble();
        assertThat(lon).isBetween(127.28, 127.30);
        assertThat(lat).isBetween(36.47, 36.49);
        assertThat(s.jibun()).isEqualTo("718대");
    }

    @Test
    void 없는_PNU는_결과에_없다() {
        FakePnuParcelProvider p = FakePnuParcelProvider.fromClasspath(new ObjectMapper());
        assertThat(p.findByPnus(List.of("9999999999999999999"))).isEmpty();
    }

    @Test
    void 적재_범위는_전국_코드와_FAKE_기준월() {
        Coverage c = FakePnuParcelProvider.fromClasspath(new ObjectMapper()).coverage();
        assertThat(c.available()).isTrue();
        assertThat(c.isLoaded("11")).isTrue();
        assertThat(c.isLoaded("12")).isTrue();   // 전남광주통합(신규 코드)
        assertThat(c.isLoaded("36")).isTrue();
        assertThat(c.parcelVersion()).isEqualTo("FAKE");
    }

    @Test
    void 교체중_표시를_시험에서_켤_수_있다() {
        FakePnuParcelProvider p = new FakePnuParcelProvider("FAKE");
        assertThat(p.coverage().isSwapping("36")).isFalse();
        p.setSwapping(Set.of("36"));
        assertThat(p.coverage().isSwapping("36")).isTrue();
        assertThat(p.coverage().isSwapping("11")).isFalse();
    }
}
