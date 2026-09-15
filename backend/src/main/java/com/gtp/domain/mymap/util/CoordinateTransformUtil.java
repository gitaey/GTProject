package com.gtp.domain.mymap.util;

import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.CoordinateFilter;
import org.locationtech.jts.geom.Geometry;

/**
 * 나만의지도 전용 좌표계 변환 유틸. 업로드 원본 좌표계(EPSG:5186/4326/5179/3857)를
 * 저장용 공통 좌표계(EPSG:4326)로 변환한다.
 *
 * GeoTools의 CRS.decode()/EPSG 데이터베이스를 쓰지 않고, 표준 투영 공식을 직접 구현한다 —
 * (1) 샌드박스/폐쇄망 환경에서 GeoTools의 CRS 조회가 외부 네트워크를 타려다 응답 없이
 *     멈추는 문제를 원천적으로 피하고, (2) 다른 프로젝트로 이 모듈을 옮길 때 GeoTools
 *     referencing/EPSG 의존성 없이 그대로 재사용할 수 있도록 하기 위함.
 */
public final class CoordinateTransformUtil {

    private CoordinateTransformUtil() {}

    public interface ToWgs84 {
        /** (x, y) -> [lon, lat] (EPSG:4326) */
        double[] toLonLat(double x, double y);
    }

    public static ToWgs84 buildTransform(String sourceSrid) {
        String srid = normalize(sourceSrid);
        return switch (srid) {
            case "EPSG:4326" -> (x, y) -> new double[]{x, y};
            case "EPSG:3857" -> CoordinateTransformUtil::webMercatorToLonLat;
            case "EPSG:5179" -> new TransverseMercator(
                    6378137.0, 1 / 298.257222101,
                    Math.toRadians(38), Math.toRadians(127.5), 0.9996, 1_000_000, 2_000_000);
            case "EPSG:5186" -> new TransverseMercator(
                    6378137.0, 1 / 298.257222101,
                    Math.toRadians(38), Math.toRadians(127), 1.0, 200_000, 600_000);
            default -> throw new IllegalArgumentException("지원하지 않는 좌표계입니다: " + sourceSrid);
        };
    }

    public static Geometry transform(Geometry geometry, ToWgs84 transform) {
        Geometry copy = geometry.copy();
        copy.apply((CoordinateFilter) coord -> {
            double[] lonLat = transform.toLonLat(coord.x, coord.y);
            coord.x = lonLat[0];
            coord.y = lonLat[1];
        });
        copy.geometryChanged();
        return copy;
    }

    public static Coordinate transformPoint(double x, double y, ToWgs84 transform) {
        double[] lonLat = transform.toLonLat(x, y);
        return new Coordinate(lonLat[0], lonLat[1]);
    }

    private static double[] webMercatorToLonLat(double x, double y) {
        double r = 6378137.0;
        double lon = Math.toDegrees(x / r);
        double lat = Math.toDegrees(2 * Math.atan(Math.exp(y / r)) - Math.PI / 2);
        return new double[]{lon, lat};
    }

    private static String normalize(String srid) {
        if (srid == null || srid.isBlank()) return "EPSG:5186";
        String trimmed = srid.trim().toUpperCase();
        return trimmed.startsWith("EPSG:") ? trimmed : "EPSG:" + trimmed;
    }

    /**
     * 표준 횡축 메르카토르(Transverse Mercator) 역변환 (Snyder, "Map Projections: A Working
     * Manual" 공식). 5186/5179 모두 GRS80 타원체를 쓰는 TM 계열 좌표계라 파라미터만 바꿔 재사용한다.
     */
    private record TransverseMercator(double a, double f, double lat0, double lon0, double k0,
                                       double falseEasting, double falseNorthing) implements ToWgs84 {

        @Override
        public double[] toLonLat(double x, double y) {
            double e2 = f * (2 - f);
            double ePrime2 = e2 / (1 - e2);
            double e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));

            double m0 = meridionalArc(a, e2, lat0);
            double xPrime = x - falseEasting;
            double m = (y - falseNorthing) / k0 + m0;
            double mu = m / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256));

            double phi1 = mu
                    + (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu)
                    + (21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu)
                    + (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu)
                    + (1097 * Math.pow(e1, 4) / 512) * Math.sin(8 * mu);

            double sinPhi1 = Math.sin(phi1);
            double cosPhi1 = Math.cos(phi1);
            double tanPhi1 = Math.tan(phi1);

            double c1 = ePrime2 * cosPhi1 * cosPhi1;
            double t1 = tanPhi1 * tanPhi1;
            double n1 = a / Math.sqrt(1 - e2 * sinPhi1 * sinPhi1);
            double r1 = a * (1 - e2) / Math.pow(1 - e2 * sinPhi1 * sinPhi1, 1.5);
            double d = xPrime / (n1 * k0);

            double phi = phi1 - (n1 * tanPhi1 / r1) * (
                    d * d / 2
                            - (5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * ePrime2) * Math.pow(d, 4) / 24
                            + (61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * ePrime2 - 3 * c1 * c1) * Math.pow(d, 6) / 720
            );

            double lambda = lon0 + (
                    d
                            - (1 + 2 * t1 + c1) * Math.pow(d, 3) / 6
                            + (5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * ePrime2 + 24 * t1 * t1) * Math.pow(d, 5) / 120
            ) / cosPhi1;

            return new double[]{Math.toDegrees(lambda), Math.toDegrees(phi)};
        }

        private static double meridionalArc(double a, double e2, double phi) {
            return a * (
                    (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256) * phi
                            - (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * e2 * e2 * e2 / 1024) * Math.sin(2 * phi)
                            + (15 * e2 * e2 / 256 + 45 * e2 * e2 * e2 / 1024) * Math.sin(4 * phi)
                            - (35 * e2 * e2 * e2 / 3072) * Math.sin(6 * phi)
            );
        }
    }
}
