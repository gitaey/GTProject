package com.gtp.domain.geotiff.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GeoTiffListItem {
    private Long id;
    private String originalName;
    private String tileUrl;
    private LocalDateTime uploadedAt;
    private Long fileSize;
    private Double minLon;
    private Double minLat;
    private Double maxLon;
    private Double maxLat;
}
