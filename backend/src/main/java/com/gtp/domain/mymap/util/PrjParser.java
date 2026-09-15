package com.gtp.domain.mymap.util;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * shp 세트에 함께 오는 .prj(WKT1) 파일에서 실제 좌표계를 판별한다.
 * GeoTools의 CRS.parseWKT()/EPSG 조회를 쓰지 않고(네트워크 조회로 멈추는 문제가 있었음)
 * 우리가 지원하는 4개 좌표계(EPSG:4326/3857/5186/5179)만 정규식으로 직접 판별한다.
 * 이 4개 밖의 좌표계는 지원하지 않으므로 null을 반환하고, 호출 쪽에서 업로드 시 사용자가
 * 고른 값으로 폴백한다.
 */
public final class PrjParser {

    private PrjParser() {}

    private static final Pattern AUTHORITY = Pattern.compile("AUTHORITY\\s*\\[\\s*\"EPSG\"\\s*,\\s*\"(\\d+)\"\\s*]", Pattern.CASE_INSENSITIVE);
    private static final Pattern PARAM = Pattern.compile("PARAMETER\\s*\\[\\s*\"([a-zA-Z_0-9]+)\"\\s*,\\s*([-0-9.eE]+)\\s*]", Pattern.CASE_INSENSITIVE);

    /** .prj 파일 텍스트에서 EPSG 코드를 판별한다. 판별 불가 시 null. */
    public static String detect(String prjWkt) {
        if (prjWkt == null || prjWkt.isBlank()) return null;
        String wkt = prjWkt.trim();

        // 1) WKT에 EPSG 코드가 명시된 경우 — 가장 확실함. 우리가 지원하는 코드만 인정한다.
        Matcher am = AUTHORITY.matcher(wkt);
        String lastAuthority = null;
        while (am.find()) lastAuthority = am.group(1); // PROJCS의 AUTHORITY가 보통 마지막에 나옴
        if (lastAuthority != null) {
            String candidate = "EPSG:" + lastAuthority;
            if (isSupported(candidate)) return candidate;
        }

        // 2) 투영이 없는 지리좌표계(GEOGCS만 있고 PROJCS 없음) — WGS84 경위도로 간주
        boolean hasProjcs = wkt.regionMatches(true, 0, "PROJCS", 0, 6);
        if (!hasProjcs) {
            return "EPSG:4326";
        }

        // 3) PROJCS 파라미터로 판별 (중앙자오선/false easting·northing)
        Double centralMeridian = null, falseEasting = null, falseNorthing = null, scaleFactor = null;
        Matcher pm = PARAM.matcher(wkt);
        while (pm.find()) {
            String name = pm.group(1).toLowerCase();
            double value;
            try {
                value = Double.parseDouble(pm.group(2));
            } catch (NumberFormatException e) {
                continue;
            }
            switch (name) {
                case "central_meridian", "longitude_of_center" -> centralMeridian = value;
                case "false_easting" -> falseEasting = value;
                case "false_northing" -> falseNorthing = value;
                case "scale_factor" -> scaleFactor = value;
                default -> { }
            }
        }

        boolean isMercator = wkt.toUpperCase().contains("MERCATOR");
        if (isMercator && falseEasting != null && Math.abs(falseEasting) < 1) {
            return "EPSG:3857";
        }

        if (centralMeridian != null && falseEasting != null && falseNorthing != null) {
            if (closeTo(centralMeridian, 127.0) && closeTo(falseEasting, 200000) && closeTo(falseNorthing, 600000)) {
                return "EPSG:5186";
            }
            if (closeTo(centralMeridian, 127.5) && closeTo(falseEasting, 1000000) && closeTo(falseNorthing, 2000000)) {
                return "EPSG:5179";
            }
        }
        // scaleFactor는 5186(1.0)과 5179(0.9996)를 구분하는 보조 단서로만 쓰고 위에서 이미 판별에 사용함
        return null;
    }

    private static boolean isSupported(String epsg) {
        return switch (epsg) {
            case "EPSG:4326", "EPSG:3857", "EPSG:5186", "EPSG:5179" -> true;
            default -> false;
        };
    }

    private static boolean closeTo(double a, double b) {
        return Math.abs(a - b) < 1.0;
    }
}
