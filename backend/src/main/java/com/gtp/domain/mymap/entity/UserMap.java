package com.gtp.domain.mymap.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * 나만의지도 — 사용자가 업로드한 shp/엑셀 데이터를 담는 지도 한 장.
 * 다른 도메인(Layer, User)을 참조하지 않는 독립 엔티티 — ownerId는 JWT의 principal 문자열을 그대로 저장한다.
 */
@Entity
@Table(name = "tbl_user_map")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class UserMap {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(length = 300)
    private String description;

    @Column(name = "owner_id", nullable = false, length = 50)
    private String ownerId;

    @Column(name = "source_type", nullable = false, length = 20)
    private String sourceType; // SHP, EXCEL

    @Column(name = "geom_type", length = 20)
    private String geomType; // POINT, LINESTRING, POLYGON, MULTI*

    @Column(name = "source_srid", nullable = false, length = 20)
    private String sourceSrid; // 업로드 시 지정한 원본 좌표계 (EPSG:5186 등)

    @Builder.Default
    @Column(nullable = false, length = 20)
    private String status = "PROCESSING"; // PROCESSING, READY, FAILED

    @Column(name = "error_message", length = 500)
    private String errorMessage;

    @Column(name = "column_schema", columnDefinition = "TEXT")
    private String columnSchema; // 속성 컬럼명 목록 (JSON 배열 문자열)

    @Column(name = "style_config", columnDefinition = "TEXT")
    private String styleConfig; // 색상 등 표시 스타일 (JSON 문자열)

    @Builder.Default
    @Column(nullable = false)
    private boolean visible = true;

    @Builder.Default
    @Column(name = "feature_count", nullable = false)
    private int featureCount = 0;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    public void markReady(String geomType, int featureCount) {
        this.status = "READY";
        this.geomType = geomType;
        this.featureCount = featureCount;
        this.errorMessage = null;
    }

    public void markFailed(String errorMessage) {
        this.status = "FAILED";
        this.errorMessage = errorMessage;
    }

    public void updateMeta(String name, String description, String styleConfig, boolean visible) {
        this.name = name;
        this.description = description;
        this.styleConfig = styleConfig;
        this.visible = visible;
    }

    public boolean isOwnedBy(String userId) {
        return ownerId != null && ownerId.equals(userId);
    }
}
