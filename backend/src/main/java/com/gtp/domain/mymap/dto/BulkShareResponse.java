package com.gtp.domain.mymap.dto;

import java.util.List;

/** 일괄 공유 결과. 바뀐 것이 없어도(이미 공유됨) 성공. failed.reason = NOT_AVAILABLE(없거나 내 것이 아님) | LIMIT_EXCEEDED(대상 100개 초과) */
public record BulkShareResponse(List<Long> succeededIds, List<Failed> failed) {

    public record Failed(Long id, String reason) {
    }
}
