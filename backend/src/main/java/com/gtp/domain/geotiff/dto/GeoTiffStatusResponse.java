package com.gtp.domain.geotiff.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GeoTiffStatusResponse {
    private Long id;
    private String status;
    private String errorMessage;
    private String tileUrl;
    private Double minLon;
    private Double minLat;
    private Double maxLon;
    private Double maxLat;
}
