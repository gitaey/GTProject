package com.gtp.domain.mymap.infra;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gtp.domain.mymap.port.Coverage;
import com.gtp.domain.mymap.port.ParcelPoint;
import com.gtp.domain.mymap.port.ParcelShape;
import com.gtp.domain.mymap.port.PnuParcelProvider;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.*;

/**
 * 시험·로컬 개발용 필지 대역({@code mymap.ref.provider=fake}). 전국 연속지적도 없이 업로드 흐름을 돌려 볼 수 있다.
 * {@code mymap/fixture/parcels.json}의 PNU를 중심점 + 반변 길이의 <b>가짜 사각형</b>으로 돌려준다(실제 지적 경계 아님).
 * 적재된 시도는 현행 시도코드 전체(전국처럼 동작), 기준월은 fixture의 version("FAKE").
 */
public class FakePnuParcelProvider implements PnuParcelProvider {

    static final String FIXTURE = "/mymap/fixture/parcels.json";
    /** 현행 시도 + 개편 전후 코드(12 전남광주통합 신규, 29·46 옛 광주·전남, 42·45 옛 강원·전북) */
    static final List<String> SIDO_CODES = List.of("11", "12", "26", "27", "28", "29", "30", "31", "36", "41", "42",
            "43", "44", "45", "46", "47", "48", "50", "51", "52");

    private final Map<String, ParcelShape> parcels = new HashMap<>();
    /** PNU → [중심 경도, 중심 위도, 반변 도] — 대표점·면적 시험용 */
    private final Map<String, double[]> centers = new HashMap<>();
    private final String version;
    private volatile Set<String> swapping = Set.of();

    public FakePnuParcelProvider(String version) {
        this.version = version;
    }

    public static FakePnuParcelProvider fromClasspath(ObjectMapper om) {
        try (InputStream in = FakePnuParcelProvider.class.getResourceAsStream(FIXTURE)) {
            if (in == null) throw new IllegalStateException("fixture를 찾을 수 없습니다: " + FIXTURE);
            return fromJson(om.readTree(in));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public static FakePnuParcelProvider fromJson(JsonNode root) {
        FakePnuParcelProvider p = new FakePnuParcelProvider(root.path("version").asText("FAKE"));
        for (JsonNode n : root.path("parcels")) {
            p.addSquare(n.path("pnu").asText(), n.path("jibun").asText(null),
                    n.path("lon").asDouble(), n.path("lat").asDouble(), n.path("half").asDouble(0.0002));
        }
        return p;
    }

    /** 중심 (lon, lat)에 한 변이 2*half도인 사각형 필지를 둔다. */
    public FakePnuParcelProvider addSquare(String pnu, String jibun, double lon, double lat, double half) {
        double x0 = lon - half, x1 = lon + half, y0 = lat - half, y1 = lat + half;
        String geom = String.format(Locale.ROOT,
                "{\"type\":\"Polygon\",\"coordinates\":[[[%.7f,%.7f],[%.7f,%.7f],[%.7f,%.7f],[%.7f,%.7f],[%.7f,%.7f]]]}",
                x0, y0, x1, y0, x1, y1, x0, y1, x0, y0);
        parcels.put(pnu, new ParcelShape(pnu, jibun, geom));
        centers.put(pnu, new double[]{lon, lat, half});
        return this;
    }

    /** 시험용: 이 시도들을 "교체 중"으로 표시한다. */
    public void setSwapping(Set<String> sidos) {
        this.swapping = Set.copyOf(sidos);
    }

    public int size() {
        return parcels.size();
    }

    @Override
    public Map<String, ParcelShape> findByPnus(Collection<String> pnus) {
        Map<String, ParcelShape> out = new HashMap<>();
        for (String p : pnus) {
            ParcelShape s = parcels.get(p);
            if (s != null) out.put(p, s);
        }
        return out;
    }

    /** 가짜 사각형의 중심이 대표점, 면적은 변 길이(도 → m)로 근사한다(실제 지적 면적 아님). */
    @Override
    public Map<String, ParcelPoint> findPointsByPnus(Collection<String> pnus, boolean withArea) {
        Map<String, ParcelPoint> out = new HashMap<>();
        for (String p : new LinkedHashSet<>(pnus)) {
            double[] c = centers.get(p);
            if (c == null) continue;
            Double area = null;
            if (withArea) {
                double h = 2 * c[2];
                double w = h * 111_320.0 * Math.cos(Math.toRadians(c[1]));
                area = Math.round(w * (h * 110_574.0) * 10.0) / 10.0;
            }
            out.put(p, new ParcelPoint(p, c[0], c[1], area));
        }
        return out;
    }

    @Override
    public Coverage coverage() {
        Map<String, String> versions = new HashMap<>();
        for (String s : SIDO_CODES) versions.put(s, version);
        return new Coverage(versions, swapping);
    }
}
