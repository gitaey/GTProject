package com.gtp.domain.mymap.port;

/**
 * 표준 주소 한 쌍(주소 변환 엑셀의 "표준_도로명주소"·"표준_지번주소"). 못 만든 칸은 빈 문자열이다(null 없음).
 * 도로명주소는 「도로명주소 활용 가이드(건물DB)」 붙임 2 표기 규칙, 지번주소는 "시도 시군구 법정동 [리] [산 ]본번[-부번]".
 */
public record StandardAddress(String road, String jibun) {

    public static final StandardAddress EMPTY = new StandardAddress("", "");

    public StandardAddress {
        road = road == null ? "" : road;
        jibun = jibun == null ? "" : jibun;
    }
}
