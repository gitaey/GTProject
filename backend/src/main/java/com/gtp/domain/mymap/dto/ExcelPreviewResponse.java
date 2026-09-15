package com.gtp.domain.mymap.dto;

import lombok.Builder;
import lombok.Getter;

import java.util.List;

@Getter
@Builder
public class ExcelPreviewResponse {
    private String uploadId;
    private List<String> headers;
    private List<List<String>> sampleRows;
}
