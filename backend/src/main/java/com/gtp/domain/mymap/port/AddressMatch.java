package com.gtp.domain.mymap.port;

import com.gtp.domain.mymap.model.ImportFailureReason;

import java.util.List;

/**
 * 주소 한 건의 해석 결과. MATCHED면 pnu가 있고, AMBIGUOUS면 후보 문장({@code candidates}, 보고서에 그대로 보인다)이 있다.
 * FAILED·AMBIGUOUS의 사유는 {@code reason}(AMBIGUOUS는 항상 {@link ImportFailureReason#AMBIGUOUS}).
 * 도로명 주소로 건물을 찾아 확정한 경우에는 그 건물({@code building})을 함께 돌려준다(표준 도로명주소 만들기용, 지번으로 풀었으면 null).
 */
public record AddressMatch(Status status, String pnu, String normalized, ImportFailureReason reason, List<String> candidates,
                           BuildingRef building) {

    public enum Status { MATCHED, FAILED, AMBIGUOUS }

    /** 도로명주소로 찾은 건물: 도로명코드 + 지하여부(0·1·2·3) + 건물본번 + 건물부번 */
    public record BuildingRef(String roadCd, String udgd, int main, int sub) {
    }

    /** 건물 정보 없이(옛 호출·지번 해석) 만드는 결과 */
    public AddressMatch(Status status, String pnu, String normalized, ImportFailureReason reason, List<String> candidates) {
        this(status, pnu, normalized, reason, candidates, null);
    }

    public static AddressMatch matched(String pnu, String normalized) {
        return new AddressMatch(Status.MATCHED, pnu, normalized, null, List.of(), null);
    }

    public static AddressMatch matched(String pnu, String normalized, BuildingRef building) {
        return new AddressMatch(Status.MATCHED, pnu, normalized, null, List.of(), building);
    }

    public static AddressMatch failed(ImportFailureReason reason) {
        return new AddressMatch(Status.FAILED, null, null, reason, List.of(), null);
    }

    public static AddressMatch failed(ImportFailureReason reason, String normalized) {
        return new AddressMatch(Status.FAILED, null, normalized, reason, List.of(), null);
    }

    public static AddressMatch ambiguous(String normalized, List<String> candidates) {
        return new AddressMatch(Status.AMBIGUOUS, null, normalized, ImportFailureReason.AMBIGUOUS, List.copyOf(candidates), null);
    }
}
