package com.gtp.domain.mymap.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class ExcelConfirmRequest {
    private String uploadId;
    private String name;
    private String description;
    private String latColumn;
    private String lonColumn;
    private String titleColumn; // 팝업 등에 쓸 대표 컬럼 (선택)
    private String sourceSrid;  // EPSG:5186(기본)/4326/5179/3857
}
