package com.gtp.domain.geotiff.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "geo_tiff_files")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class GeoTiffFile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String originalName;

    @Column(nullable = false)
    private String storedName;

    @Column(nullable = false)
    private String filePath;

    @CreationTimestamp
    private LocalDateTime uploadedAt;

    private String uploadedBy;

    private Long fileSize;

    private Double minLon;
    private Double minLat;
    private Double maxLon;
    private Double maxLat;

    @Builder.Default
    @Column(nullable = false)
    private String status = "PROCESSING";

    private String errorMessage;

    public void updateReady(Double minLon, Double minLat, Double maxLon, Double maxLat) {
        this.minLon = minLon;
        this.minLat = minLat;
        this.maxLon = maxLon;
        this.maxLat = maxLat;
        this.status = "READY";
    }

    public void updateFailed(String errorMessage) {
        this.status = "FAILED";
        this.errorMessage = errorMessage;
    }
}
