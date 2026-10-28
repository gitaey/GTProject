package com.gtp.domain.mymap.util;

import com.gtp.domain.mymap.dto.ExcelPreviewResponse;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * 미리보기용 업로드 방식·컬럼 추천. 머리글 이름과 앞쪽 몇십 행의 값 모양으로 판단하는 순수 함수다.
 * 추천일 뿐이라 틀려도 사용자가 화면에서 고친다. 순서는 PNU → 좌표 → 주소(좌표가 있으면 그것이 더 정확해서 주소보다 앞선다).
 */
public final class ColumnSuggester {

    private ColumnSuggester() {
    }

    /** @param numericPnuCells 숫자 서식으로 깨졌을 가능성이 있는 19자리 숫자 셀이 있는가(NUMERIC_PNU_CELLS 경고) */
    public record Result(ExcelPreviewResponse.Suggestions suggestions, boolean numericPnuCells) {
    }

    private static final Pattern PLAIN_NUMBER = Pattern.compile("^-?\\d+(\\.\\d+)?$");
    private static final double PNU_MIN_MAGNITUDE = 1e18;
    private static final double PNU_MAX_MAGNITUDE = 1e19;

    private record Range(double min, double max) {
        boolean contains(double v) {
            return v >= min && v <= max;
        }
    }

    /** 좌표계별 (경도·X, 위도·Y) 범위. 투영 좌표는 미터라 값이 크다 — 직원수·연도 같은 작은 숫자 열이 좌표로 오인되지 않게 하한을 둔다. */
    private record CoordSystem(String srid, Range x, Range y) {
    }

    private static final List<CoordSystem> SYSTEMS = List.of(
            new CoordSystem("EPSG:4326", new Range(123, 133), new Range(32, 40)),
            new CoordSystem("EPSG:5186", new Range(10_000, 650_000), new Range(40_000, 800_000)),
            new CoordSystem("EPSG:5179", new Range(700_000, 1_500_000), new Range(1_300_000, 2_300_000)),
            new CoordSystem("EPSG:3857", new Range(13_000_000, 15_000_000), new Range(3_800_000, 4_800_000)));

    public static Result suggest(List<String> headers, List<List<CellData>> rows) {
        int cols = headers.size();
        double[] pnuShare = new double[cols];
        double[] addressShare = new double[cols];
        double[] min = new double[cols];
        double[] max = new double[cols];
        boolean[] numericColumn = new boolean[cols];
        boolean numericPnu = false;

        for (int c = 0; c < cols; c++) {
            int nonBlank = 0, pnuLike = 0, numbers = 0, addressLike = 0;
            min[c] = Double.POSITIVE_INFINITY;
            max[c] = Double.NEGATIVE_INFINITY;
            for (List<CellData> row : rows) {
                CellData d = c < row.size() ? row.get(c) : CellData.EMPTY;
                if (d.blank()) continue;
                nonBlank++;
                Double n = numberOf(d);
                if (n != null) {
                    numbers++;
                    min[c] = Math.min(min[c], n);
                    max[c] = Math.max(max[c], n);
                }
                if (d.numeric()) {
                    if (isNumericPnu(d)) {
                        pnuLike++;
                        numericPnu = true;
                    }
                } else if (PnuNormalizer.looksLikePnu(d.text())) {
                    pnuLike++;
                } else if (AddressNormalizer.looksLikeAddress(d.text())) {
                    addressLike++;
                }
            }
            pnuShare[c] = nonBlank == 0 ? 0 : (double) pnuLike / nonBlank;
            addressShare[c] = nonBlank == 0 ? 0 : (double) addressLike / nonBlank;
            numericColumn[c] = nonBlank > 0 && numbers >= Math.ceil(nonBlank * 0.9);
        }

        // PNU: 값이 60% 이상 PNU 모양, 또는 머리글이 PNU 같고 하나라도 PNU 모양
        int pnuCol = -1;
        for (int c = 0; c < cols; c++) {
            boolean hint = headerHasAny(headers.get(c), "pnu", "필지고유", "필지번호");
            boolean ok = pnuShare[c] >= 0.6 || (hint && pnuShare[c] > 0);
            if (ok && (pnuCol < 0 || pnuShare[c] > pnuShare[pnuCol])) pnuCol = c;
        }
        if (pnuCol >= 0) {
            return new Result(ExcelPreviewResponse.Suggestions.builder().mode("PNU").pnuColumn(headers.get(pnuCol)).build(), numericPnu);
        }

        // 좌표: 4326 → 5186 → 5179 → 3857 순으로 두 열이 짝으로 범위에 들면
        for (CoordSystem sys : SYSTEMS) {
            List<Integer> xs = new ArrayList<>(), ys = new ArrayList<>();
            for (int c = 0; c < cols; c++) {
                if (!numericColumn[c]) continue;
                if (sys.x().contains(min[c]) && sys.x().contains(max[c])) xs.add(c);
                if (sys.y().contains(min[c]) && sys.y().contains(max[c])) ys.add(c);
            }
            int[] pair = pickPair(headers, xs, ys);
            if (pair != null) {
                return new Result(ExcelPreviewResponse.Suggestions.builder().mode("COORD")
                        .lonColumn(headers.get(pair[0])).latColumn(headers.get(pair[1])).sourceSrid(sys.srid()).build(), numericPnu);
            }
        }

        // 주소: 값의 60% 이상이 도로명·지번 주소 모양이거나, 머리글이 주소 같고 하나라도 주소 모양인 컬럼(비율이 높은 것 우선)
        int addressCol = -1;
        for (int c = 0; c < cols; c++) {
            boolean hint = headerHasAny(headers.get(c), "주소", "address", "소재지", "지번", "도로명", "addr");
            boolean ok = addressShare[c] >= 0.6 || (hint && addressShare[c] > 0);
            if (!ok) continue;
            if (addressCol < 0 || addressShare[c] > addressShare[addressCol]) addressCol = c;
        }
        if (addressCol >= 0) {
            return new Result(ExcelPreviewResponse.Suggestions.builder().mode("ADDRESS").addressColumn(headers.get(addressCol)).build(), numericPnu);
        }
        return new Result(ExcelPreviewResponse.Suggestions.builder().build(), numericPnu);
    }

    /** 숫자 서식으로 저장된 19자리 PNU처럼 보이는 셀(값이 1e18~1e19)인가 — 뒤쪽 자리가 이미 바뀌었을 수 있다 */
    static boolean isNumericPnu(CellData d) {
        return d.numeric() && d.number() != null && Math.abs(d.number()) >= PNU_MIN_MAGNITUDE && Math.abs(d.number()) < PNU_MAX_MAGNITUDE;
    }

    /** 한 행에 숫자 서식 PNU 모양 셀이 있는가(미리보기 경고용 — 앞 50행이 아니라 모든 행에서 쓴다) */
    public static boolean hasNumericPnuCell(List<CellData> cells) {
        for (CellData d : cells) {
            if (isNumericPnu(d)) return true;
        }
        return false;
    }

    /** x(경도)·y(위도) 후보에서 서로 다른 두 열을 고른다. 범위가 겹치는 투영 좌표는 머리글 힌트 → 열 순서(x가 앞) 순. */
    private static int[] pickPair(List<String> headers, List<Integer> xs, List<Integer> ys) {
        if (xs.isEmpty() || ys.isEmpty()) return null;
        Integer x = firstWithHint(headers, xs, "lon", "lng", "경도", "easting", "x좌표", "x");
        Integer y = firstWithHint(headers, ys, "lat", "위도", "northing", "y좌표", "y");
        if (x == null) x = firstOther(xs, y);
        if (y == null) y = firstOther(ys, x);
        if (x == null || y == null || x.equals(y)) return null;
        return new int[]{x, y};
    }

    private static Integer firstOther(List<Integer> candidates, Integer exclude) {
        for (Integer c : candidates) {
            if (!c.equals(exclude)) return c;
        }
        return null;
    }

    private static Integer firstWithHint(List<String> headers, List<Integer> candidates, String... words) {
        for (Integer c : candidates) {
            if (headerHasAny(headers.get(c), words)) return c;
        }
        return null;
    }

    private static boolean headerHasAny(String header, String... words) {
        String h = header.toLowerCase(Locale.ROOT).strip();
        for (String w : words) {
            // 한 글자 힌트(x, y)는 머리글 전체가 그 글자일 때만 — "year"의 y 같은 오인을 막는다
            if (w.length() == 1 ? h.equals(w) : h.contains(w)) return true;
        }
        return false;
    }

    private static Double numberOf(CellData d) {
        if (d.numeric()) return d.number();
        String t = d.text().replace(",", "");
        return PLAIN_NUMBER.matcher(t).matches() ? Double.valueOf(t) : null;
    }
}
