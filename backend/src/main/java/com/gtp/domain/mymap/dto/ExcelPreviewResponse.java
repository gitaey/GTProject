package com.gtp.domain.mymap.dto;

import lombok.Builder;
import lombok.Getter;

import java.util.List;

@Getter
@Builder
public class ExcelPreviewResponse {
    /** 30분 유효, 올린 사람에게만 유효 */
    private String uploadId;
    private List<String> headers;
    /** 앞 10행(보이는 값) */
    private List<List<String>> sampleRows;
    /** 머리글 제외, 값이 있는 데이터 행 수 */
    private int totalRows;
    private Suggestions suggestions;
    private Limits limits;
    private List<Warning> warnings;

    /** 값의 모양으로 추천한 업로드 방식·컬럼(PNU → 좌표 → 주소 순으로 먼저 맞는 것). */
    @Getter
    @Builder
    public static class Suggestions {
        /** PNU | ADDRESS | COORD | null */
        private String mode;
        private String pnuColumn;
        private String addressColumn;
        private String latColumn;
        private String lonColumn;
        private String sourceSrid;
    }

    @Getter
    @Builder
    public static class Limits {
        private int pnu;
        private int address;
        private int coord;
    }

    @Getter
    @Builder
    public static class Warning {
        /** NUMERIC_PNU_CELLS | DUPLICATE_FILE | OVER_LIMIT */
        private String code;
        private String message;
    }
}
