package com.gtp.domain.mymap.port;

import java.util.List;

/**
 * 주소 문자열 → PNU 포트(주소 엑셀). 기본 구현은 도로명주소 건물DB 표를 읽는 {@code TableAddressResolver}이고,
 * 주소를 쓰지 않는 호스트는 {@code UnsupportedAddressResolver}를 둔다. 기관 주소 DB·주소 API로 바꿀 때는 이 구현만 교체한다.
 */
public interface AddressResolver {

    /** false면 주소 모드 업로드를 "지원 예정"으로 거절한다. */
    boolean supported();

    /** 주소 자료(건물DB 등)가 읽을 수 있게 준비됐는가. false면 업로드를 MYMAP_REF_UNAVAILABLE(503)로 거절한다. */
    default boolean available() {
        return supported();
    }

    /** 입력 순서 그대로 해석 결과를 돌려준다. 같은 주소가 여러 번 와도 조회는 한 번만 한다. */
    List<AddressMatch> resolve(List<String> rawAddresses);
}
