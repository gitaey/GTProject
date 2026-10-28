package com.gtp.domain.mymap.port;

import com.gtp.domain.mymap.model.ImportFailureReason;

import java.util.List;

/**
 * 주소 한 건의 해석 결과. MATCHED면 pnu가 있고, AMBIGUOUS면 후보 문장({@code candidates}, 보고서에 그대로 보인다)이 있다.
 * FAILED·AMBIGUOUS의 사유는 {@code reason}(AMBIGUOUS는 항상 {@link ImportFailureReason#AMBIGUOUS}).
 */
public record AddressMatch(Status status, String pnu, String normalized, ImportFailureReason reason, List<String> candidates) {

    public enum Status { MATCHED, FAILED, AMBIGUOUS }

    public static AddressMatch matched(String pnu, String normalized) {
        return new AddressMatch(Status.MATCHED, pnu, normalized, null, List.of());
    }

    public static AddressMatch failed(ImportFailureReason reason) {
        return new AddressMatch(Status.FAILED, null, null, reason, List.of());
    }

    public static AddressMatch failed(ImportFailureReason reason, String normalized) {
        return new AddressMatch(Status.FAILED, null, normalized, reason, List.of());
    }

    public static AddressMatch ambiguous(String normalized, List<String> candidates) {
        return new AddressMatch(Status.AMBIGUOUS, null, normalized, ImportFailureReason.AMBIGUOUS, List.copyOf(candidates));
    }
}
