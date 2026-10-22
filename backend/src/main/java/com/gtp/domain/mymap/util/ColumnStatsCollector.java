package com.gtp.domain.mymap.util;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.*;

/**
 * 레이어의 속성 컬럼별 통계 — 스타일 대화상자(구간·범주 색칠, 라벨·팝업 컬럼 고르기)가 쓴다. 업로드가 끝날 때
 * {@code tbl_user_map.column_schema}에 JSON으로 저장하고, {@code GET /api/mymap/{id}/columns}가 그대로 내려준다.
 *
 * 메모리는 컬럼 수에 비례할 뿐 행 수에는 비례하지 않는다: 고유값은 컬럼당 최대 {@value #MAX_DISTINCT}개까지만 세고(넘으면
 * distinctCapped), 분위수용 표본은 컬럼당 {@value #RESERVOIR}개 저수지 표집(5,000행 이하는 정확하다).
 *
 * 저장 형식(v1):
 * <pre>{"v":1,"rowCount":N,"truncated":false,"columns":[
 *   {"name":"직원수","kind":"number","filled":120,"numericCount":120,"distinct":45,"distinctCapped":false,
 *    "min":800,"max":1500,"quantiles":[800,…,1500],"top":[{"value":"900","count":7},…]},
 *   {"name":"구분","kind":"text","filled":120,"numericCount":0,"distinct":3,"distinctCapped":false,"top":[…]}]}</pre>
 * kind는 값이 있는 칸의 90% 이상이 숫자({@link NumericText})면 "number", 아니면 "text". min·max·quantiles는 number 컬럼에만 있고
 * 숫자로 읽히는 값만으로 계산한다(quantiles = 0%·5%·…·100%의 21개 값). top = 가장 많은 값 {@value #TOP_N}개(많은 순, 같으면 값 순, 값은 100자까지).
 */
public final class ColumnStatsCollector {

    public static final int SCHEMA_VERSION = 1;
    public static final int MAX_DISTINCT = 10_000;
    public static final int TOP_N = 20;
    public static final int RESERVOIR = 5_000;
    public static final int QUANTILE_POINTS = 21;
    public static final int MAX_TOP_VALUE_CHARS = 100;
    static final double NUMBER_SHARE = 0.9;

    private static final ObjectMapper OM = new ObjectMapper();

    private final List<String> names;
    private final long[] filled;
    private final long[] numericCount;
    private final double[] min;
    private final double[] max;
    private final Map<String, long[]>[] counts;
    private final boolean[] capped;
    private final double[][] reservoir;
    private final Random[] random;
    private long rows;

    @SuppressWarnings("unchecked")
    public ColumnStatsCollector(List<String> names) {
        this.names = List.copyOf(names);
        int n = names.size();
        filled = new long[n];
        numericCount = new long[n];
        min = new double[n];
        max = new double[n];
        Arrays.fill(min, Double.POSITIVE_INFINITY);
        Arrays.fill(max, Double.NEGATIVE_INFINITY);
        counts = new Map[n];
        capped = new boolean[n];
        reservoir = new double[n][];
        random = new Random[n];
        for (int i = 0; i < n; i++) {
            counts[i] = new HashMap<>();
            random[i] = new Random(42L + i);   // 같은 입력이면 같은 표본(시험·재현)
        }
    }

    /** 한 행의 값들(컬럼 순서). 짧으면 모자란 칸은 빈 값. */
    public void addRow(List<String> values) {
        rows++;
        for (int i = 0; i < names.size(); i++) {
            add(i, i < values.size() ? values.get(i) : null);
        }
    }

    /** 컬럼 이름으로 채우는 행(shp처럼 칸 순서가 피처마다 다를 수 있을 때). 없는 컬럼은 빈 값. */
    public void addRow(Map<String, String> byName) {
        rows++;
        for (int i = 0; i < names.size(); i++) add(i, byName.get(names.get(i)));
    }

    public long rows() {
        return rows;
    }

    private void add(int i, String value) {
        if (value == null) return;
        String trimmed = NumericText.jsTrim(value);   // 프론트 categoryKey(trim)와 같은 기준 — 범주 값이 앞뒤 공백 때문에 안 맞는 일을 막는다
        if (trimmed.isEmpty()) return;
        filled[i]++;

        String key = trimmed.length() > MAX_TOP_VALUE_CHARS ? trimmed.substring(0, MAX_TOP_VALUE_CHARS) : trimmed;
        long[] c = counts[i].get(key);
        if (c != null) c[0]++;
        else if (counts[i].size() < MAX_DISTINCT) counts[i].put(key, new long[]{1});
        else capped[i] = true;

        Double v = NumericText.parse(value);
        if (v == null) return;
        long n = ++numericCount[i];
        if (v < min[i]) min[i] = v;
        if (v > max[i]) max[i] = v;
        if (reservoir[i] == null) reservoir[i] = new double[Math.min(RESERVOIR, 64)];
        if (n <= RESERVOIR) {
            if (n > reservoir[i].length) reservoir[i] = Arrays.copyOf(reservoir[i], (int) Math.min(RESERVOIR, Math.max(n, reservoir[i].length * 2L)));
            reservoir[i][(int) n - 1] = v;
        } else {
            long j = (long) (random[i].nextDouble() * n);
            if (j < RESERVOIR) reservoir[i][(int) j] = v;
        }
    }

    /** 컬럼 이름 순서 그대로의 통계 JSON(저장 형식 v1). */
    public String toJson(boolean truncated) {
        ObjectNode root = OM.createObjectNode();
        root.put("v", SCHEMA_VERSION);
        root.put("rowCount", rows);
        root.put("truncated", truncated);
        ArrayNode cols = root.putArray("columns");
        for (int i = 0; i < names.size(); i++) cols.add(columnNode(i));
        return root.toString();
    }

    private ObjectNode columnNode(int i) {
        boolean number = filled[i] > 0 && numericCount[i] >= Math.ceil(filled[i] * NUMBER_SHARE);
        ObjectNode c = OM.createObjectNode();
        c.put("name", names.get(i));
        c.put("kind", number ? "number" : "text");
        c.put("filled", filled[i]);
        c.put("numericCount", numericCount[i]);
        c.put("distinct", counts[i].size());
        c.put("distinctCapped", capped[i]);
        if (number) {
            putNumber(c, "min", min[i]);
            putNumber(c, "max", max[i]);
            ArrayNode q = c.putArray("quantiles");
            for (double x : quantiles(i)) {
                if (x == Math.rint(x) && Math.abs(x) < 1e15) q.add((long) x);
                else q.add(x);
            }
        }
        ArrayNode top = c.putArray("top");
        counts[i].entrySet().stream()
                .sorted((a, b) -> {
                    int byCount = Long.compare(b.getValue()[0], a.getValue()[0]);
                    return byCount != 0 ? byCount : a.getKey().compareTo(b.getKey());
                })
                .limit(TOP_N)
                .forEach(e -> top.addObject().put("value", e.getKey()).put("count", e.getValue()[0]));
        return c;
    }

    private static void putNumber(ObjectNode node, String name, double v) {
        if (v == Math.rint(v) && Math.abs(v) < 1e15) node.put(name, (long) v);
        else node.put(name, v);
    }

    /** 0%, 5%, …, 100% 지점의 값(표본을 정렬해 선형 보간). */
    private double[] quantiles(int i) {
        int m = (int) Math.min(numericCount[i], RESERVOIR);
        double[] sorted = Arrays.copyOf(reservoir[i], m);
        Arrays.sort(sorted);
        double[] out = new double[QUANTILE_POINTS];
        for (int k = 0; k < QUANTILE_POINTS; k++) {
            if (m == 1) {
                out[k] = sorted[0];
                continue;
            }
            double pos = (double) ((long) (m - 1) * k) / (QUANTILE_POINTS - 1);   // 곱한 뒤 나눠 부동소수 오차를 줄인다
            int lo = (int) Math.floor(pos);
            int hi = Math.min(lo + 1, m - 1);
            out[k] = sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
        }
        // 표본이 아니라 전체의 최솟값·최댓값을 양 끝에 둔다(표본 추출로 양 끝이 빠졌을 때도 min·max와 맞는다)
        out[0] = min[i];
        out[QUANTILE_POINTS - 1] = max[i];
        return out;
    }
}
