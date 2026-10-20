package com.gtp.domain.mymap.port;

import com.gtp.domain.mymap.model.ImportFailureReason;

import java.util.List;

/** 주소 한 건의 해석 결과(2단계). */
public record AddressMatch(Status status, String pnu, String normalized, ImportFailureReason reason, List<String> candidates) {

    public enum Status { MATCHED, FAILED, AMBIGUOUS }

    public static AddressMatch matched(String pnu, String normalized) {
        return new AddressMatch(Status.MATCHED, pnu, normalized, null, List.of());
    }

    public static AddressMatch failed(ImportFailureReason reason) {
        return new AddressMatch(Status.FAILED, null, null, reason, List.of());
    }
}
