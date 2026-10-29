package com.gtp.domain.mymap.util;

import com.gtp.domain.mymap.util.CoordinateTransformUtil.FromWgs84;
import com.gtp.domain.mymap.util.CoordinateTransformUtil.ToWgs84;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

/** 순변환(4326 → 대상 좌표계): 기준점 값과 역변환 왕복으로 확인한다. */
class CoordinateForwardTransformTest {

    @Test
    void 투영_원점은_가짜_좌표값이_된다() {
        double[] a = CoordinateTransformUtil.buildFromWgs84("EPSG:5186").toXy(127.0, 38.0);
        assertThat(a[0]).isCloseTo(200_000, within(0.001));
        assertThat(a[1]).isCloseTo(600_000, within(0.001));
        double[] b = CoordinateTransformUtil.buildFromWgs84("5179").toXy(127.5, 38.0);
        assertThat(b[0]).isCloseTo(1_000_000, within(0.001));
        assertThat(b[1]).isCloseTo(2_000_000, within(0.001));
    }

    @Test
    void 웹메르카토르_기준값() {
        double[] m = CoordinateTransformUtil.buildFromWgs84("EPSG:3857").toXy(127.0, 37.5);
        assertThat(m[0]).isCloseTo(14_137_575.3, within(1.0));
        assertThat(m[1]).isCloseTo(4_509_031.4, within(0.1));   // R * asinh(tan(37.5°))
        assertThat(CoordinateTransformUtil.buildFromWgs84("EPSG:4326").toXy(127.1, 37.2)).containsExactly(127.1, 37.2);
    }

    @Test
    void 서울시청_5186은_원점에서_서쪽_2km_남쪽_48km쯤() {
        double[] xy = CoordinateTransformUtil.buildFromWgs84("EPSG:5186").toXy(126.97794, 37.56651);
        assertThat(xy[0]).isBetween(197_000.0, 199_000.0);
        assertThat(xy[1]).isBetween(551_000.0, 553_000.0);
    }

    @Test
    void 네_좌표계_모두_역변환과_왕복이_정확하다() {
        double[][] points = {{126.97794, 37.56651}, {129.07, 35.18}, {126.52, 33.5}, {128.0, 38.2}, {127.28, 36.48}};
        for (String srid : new String[]{"EPSG:4326", "EPSG:3857", "EPSG:5179", "EPSG:5186"}) {
            FromWgs84 fwd = CoordinateTransformUtil.buildFromWgs84(srid);
            ToWgs84 inv = CoordinateTransformUtil.buildTransform(srid);
            for (double[] p : points) {
                double[] xy = fwd.toXy(p[0], p[1]);
                double[] back = inv.toLonLat(xy[0], xy[1]);
                assertThat(back[0]).as(srid + " lon").isCloseTo(p[0], within(1e-8));
                assertThat(back[1]).as(srid + " lat").isCloseTo(p[1], within(1e-8));
            }
        }
    }

    @Test
    void 허용하지_않는_좌표계는_거절() {
        assertThatThrownBy(() -> CoordinateTransformUtil.buildFromWgs84("EPSG:5185")).isInstanceOf(IllegalArgumentException.class);
        assertThat(CoordinateTransformUtil.OUTPUT_SRIDS).containsExactly(4326, 5186, 5179, 3857);
    }
}
