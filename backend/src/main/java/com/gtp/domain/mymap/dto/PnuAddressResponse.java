package com.gtp.domain.mymap.dto;

import lombok.Builder;
import lombok.Getter;

import java.util.List;

/**
 * PNU 묶음 → 지번·도로명주소(U26) 응답. items는 요청에서 중복을 뺀 처음 나온 순서이고 요청한 PNU가 모두 한 번씩 들어 있다(못 찾아도 빠지지 않는다).
 * 못 만든 값은 null(빈 문자열이 아니다).
 */
@Getter
@Builder
public class PnuAddressResponse {
    /** 건물DB 적재 기준월(ref.load_meta), 기준월 칸이 비어 있으면 "unknown" */
    private String referenceVersion;
    /** false = 지번 색인이 없어 도로명주소를 찾지 않았다(모든 item의 건수 0, roadAddresses []) */
    private boolean roadAvailable;
    /** 관련지번(ti_scco_mvmn)까지 찾았는가(그 색인이 있을 때만 true) */
    private boolean relatedIncluded;
    /** item별 roadAddresses 상한 — 화면이 "외 N건"을 계산한다 */
    private int maxRoadAddresses;
    private List<Item> items;

    @Getter
    @Builder
    public static class Item {
        /** 요청 값 그대로 */
        private String pnu;
        /** 표준 지번주소, 법정동을 어디에서도 못 찾으면 null */
        private String jibunAddress;
        /** 이 필지에 걸린 건물 수(폐지 제외, 대표지번 + 관련지번, 건물당 1번) — 자르기 전 값 */
        private int buildingCount;
        /** 서로 다른 도로명주소 수(자르기 전). 0 = 건물 없음 */
        private int roadAddressCount;
        /** 최대 maxRoadAddresses개. 첫 원소가 대표 도로명주소 */
        private List<RoadAddress> roadAddresses;
    }

    @Getter
    @Builder
    public static class RoadAddress {
        private String roadAddress;
        private String zipCode;
        private String buildingName;
        /** "MAIN"(이 필지가 대표지번인 건물이 있음) 또는 "RELATED"(관련지번으로만 걸림) */
        private String relation;
    }
}
