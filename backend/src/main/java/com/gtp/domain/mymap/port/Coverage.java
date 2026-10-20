package com.gtp.domain.mymap.port;

import java.util.Collection;
import java.util.Map;
import java.util.Set;

/**
 * 연속지적도가 적재된 범위: 시도코드별 기준월(YYYY-MM)과 교체 중인 시도.
 * 시도별로 기준월이 다를 수 있어서, 레이어의 기준월은 매칭에 쓰인 시도 중 가장 이른 달로 적는다.
 */
public record Coverage(Map<String, String> versionBySido, Set<String> swappingSidos) {

    public Coverage {
        versionBySido = Map.copyOf(versionBySido);
        swappingSidos = Set.copyOf(swappingSidos);
    }

    public static Coverage unavailable() {
        return new Coverage(Map.of(), Set.of());
    }

    /** 적재된 시도가 하나라도 있는가 */
    public boolean available() {
        return !versionBySido.isEmpty();
    }

    public boolean isLoaded(String sido) {
        return versionBySido.containsKey(sido);
    }

    public boolean isSwapping(String sido) {
        return swappingSidos.contains(sido);
    }

    /** 적재된 전체 시도 중 가장 이른 기준월. 없으면 null */
    public String parcelVersion() {
        return versionFor(versionBySido.keySet());
    }

    /** 주어진 시도 가운데 적재된 것들의 가장 이른 기준월. 없으면 null */
    public String versionFor(Collection<String> sidos) {
        String min = null;
        for (String s : sidos) {
            String v = versionBySido.get(s);
            if (v != null && (min == null || v.compareTo(min) < 0)) min = v;
        }
        return min;
    }
}
