package com.gtp.domain.mymap.port;

import java.util.List;

/**
 * 주소 문자열 → PNU 포트(2단계 주소 엑셀). 기본 구현은 법정동코드·도로명주소 표를 읽는 {@code TableAddressResolver}가 될 예정이고,
 * 1단계에서는 {@code UnsupportedAddressResolver}가 자리를 채운다. 기관 주소 DB·주소 API로 바꿀 때는 이 구현만 교체한다.
 */
public interface AddressResolver {

    /** false면 주소 모드 업로드를 "지원 예정"으로 거절한다. */
    boolean supported();

    /** 입력 순서 그대로 해석 결과를 돌려준다. */
    List<AddressMatch> resolve(List<String> rawAddresses);
}
