package com.gtp.domain.mymap.dto;

import lombok.Builder;
import lombok.Getter;

import java.util.List;

/**
 * 필지 정보 카드의 건물 목록(U25). 빈 문자열은 모두 null로 내보낸다. 건물 0건이면 buildingCount 0, addresses [].
 */
@Getter
@Builder
public class ParcelBuildingsResponse {
    /** 요청한 PNU 그대로 */
    private String pnu;
    /** 건물DB 적재 기준월(ref.load_meta), 모르면 null */
    private String referenceVersion;
    /** 이 필지에 걸린 건물 수(폐지 제외) — limit과 무관한 전체 */
    private int buildingCount;
    /** 돌려준 건물 수가 buildingCount보다 적다 */
    private boolean truncated;
    /** 관련지번(ti_scco_mvmn)으로도 찾았는가(그 색인이 있을 때만 true) */
    private boolean relatedIncluded;
    private List<AddressGroup> addresses;

    /** 도로명주소(도로명코드·지하여부·건물본번·건물부번)별 묶음 */
    @Getter
    @Builder
    public static class AddressGroup {
        private String roadAddress;
        private boolean underground;
        private String zipCode;
        private String name;
        private boolean apartment;
        /** "MAIN"(대표지번이 이 필지) 또는 "RELATED"(관련지번으로만 찾음) */
        private String relation;
        private List<BuildingItem> buildings;
    }

    @Getter
    @Builder
    public static class BuildingItem {
        /** 건물관리번호(bd_mgt_sn) */
        private String id;
        private String name;
        private String detailName;
        private String sggName;
    }
}
