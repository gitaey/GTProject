package com.gtp.domain.mymap.dto;

import lombok.Builder;
import lombok.Getter;

import java.util.List;

@Getter
@Builder
public class MyMapQuotaResponse {
    private int ownedLayers;
    private int maxLayers;
    private MaxRows maxRows;
    private int maxShpFeatures;
    private int maxExcelMb;
    private int maxShpMb;
    private Coverage coverage;

    @Getter
    @Builder
    public static class MaxRows {
        private int pnu;
        private int address;
        private int coord;
    }

    /**
     * 지금 PNU 매칭에 실제로 쓸 수 있는 범위(적재 기록 ref.load_meta 기준).
     * sidoCodes: 적재된(READY·SWAPPING) 시도코드, 지역 제한 설정(allowed-sido-codes)이 있으면 그 교집합, 오름차순. 아무것도 없으면 [].
     * parcelVersion: sidoCodes 중 가장 이른 기준월(YYYY-MM), 없으면 null.
     * loaded: sidoCodes와 같은 순서의 [{sido, version}] — 시도별 기준월.
     * nationwide: 전국 기준(expected-sido-codes)이 전부 적재되어 있고 지역 제한이 없을 때만 true.
     * restrictedSidoCodes: 지역 제한 설정값(비어 있으면 제한 없음).
     */
    @Getter
    @Builder
    public static class Coverage {
        private List<String> sidoCodes;
        private String parcelVersion;
        private List<LoadedSido> loaded;
        private boolean nationwide;
        private List<String> restrictedSidoCodes;
    }

    @Getter
    @Builder
    public static class LoadedSido {
        private String sido;
        private String version;
    }
}
