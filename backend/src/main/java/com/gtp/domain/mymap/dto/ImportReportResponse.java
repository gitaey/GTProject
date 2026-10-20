package com.gtp.domain.mymap.dto;

import lombok.Builder;
import lombok.Getter;

import java.util.List;
import java.util.Map;

@Getter
@Builder
public class ImportReportResponse {
    /** 처리한 데이터 행 수 */
    private int total;
    private int matched;
    private int failed;
    /** 사유 코드별 실패 행 수(전체 기준, reason 필터와 무관) */
    private Map<String, Long> byReason;
    private List<Row> rows;
    private int page;
    private int size;
    /** 필터에 맞는 실패 행 전체 수(페이지 계산용) */
    private long totalRows;
    /** 같은 PNU가 여러 행이라 중복으로 올라간 피처 수(행마다 피처를 만들었다 — 안내용, 0이면 없음) */
    private long duplicatePnuCount;

    @Getter
    @Builder
    public static class Row {
        private int rowNo;
        private String reason;
        private String message;
        private String input;
        private List<String> candidates;
    }
}
