package com.gtp.domain.mymap.port;

import java.util.List;
import java.util.function.Function;

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

    /**
     * 해석된 결과(MATCHED)의 표준 주소를 입력 순서 그대로 만든다. MATCHED가 아니면 {@link StandardAddress#EMPTY}.
     * 구현하지 않으면 전부 빈 값이다. 변환 전용 흐름(주소 변환 엑셀)이 쓴다.
     *
     * @param wantRoad  false면 도로명주소는 만들지 않는다(건물 조회를 건너뛴다)
     * @param wantJibun false면 지번주소는 만들지 않는다
     */
    default List<StandardAddress> standardize(List<AddressMatch> matches, boolean wantRoad, boolean wantJibun) {
        List<StandardAddress> out = new java.util.ArrayList<>(matches.size());
        for (int i = 0; i < matches.size(); i++) out.add(StandardAddress.EMPTY);
        return out;
    }

    /** PNU → 표준 지번주소(레이어 내보내기용). 구현은 호출 때 한 번 준비하고 건마다 DB를 부르지 않는다. 모르면 빈 문자열 */
    default Function<String, String> jibunAddressFormatter() {
        return pnu -> "";
    }

    /** 이 주소 자료의 기준월(예 "2026-09"). 모르면 null */
    default String referenceVersion() {
        return null;
    }
}
