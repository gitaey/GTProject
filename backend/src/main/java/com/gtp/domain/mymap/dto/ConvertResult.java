package com.gtp.domain.mymap.dto;

import lombok.Builder;
import lombok.Getter;

import java.util.List;

/**
 * 주소 변환 결과. fileBase64는 결과 .xlsx(시트 "결과"·"열설명"), preview는 앞 5행(결과 파일과 같은 열·값, 모두 문자열).
 */
@Getter
@Builder
public class ConvertResult {
    private final int total;
    private final int matched;
    private final int failed;
    private final String fileName;
    private final String fileBase64;
    private final Preview preview;

    @Getter
    @Builder
    public static class Preview {
        private final List<String> columns;
        private final List<List<String>> rows;
    }
}
