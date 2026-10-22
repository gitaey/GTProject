package com.gtp.domain.mymap.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.DynamicUpdate;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * 나만의지도 — 사용자가 업로드한 shp/엑셀 데이터를 담는 지도 한 장.
 * 다른 도메인(Layer, User)을 참조하지 않는 독립 엔티티 — ownerId는 JWT의 principal 문자열을 그대로 저장한다.
 *
 * {@code @DynamicUpdate}: 바뀐 칸만 UPDATE한다. 가져오기 작업·컬럼 통계 계산이 JDBC로 직접 쓰는 칸(status·진행률·matched/failed·column_schema 등)을
 * 같은 트랜잭션의 옛 엔티티 값이 전체 칸 UPDATE로 덮어쓰는 일(lost update)을 막는다. DDL에는 영향이 없다(INSERT는 그대로).
 */
@Entity
@DynamicUpdate
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
    private String columnSchema; // 속성 컬럼 통계(JSON, ColumnStatsCollector v1). 옛 레이어는 비었거나 컬럼명 배열 — 요청 때 다시 계산

    @Column(name = "style_config", columnDefinition = "TEXT")
    private String styleConfig; // 색상 등 표시 스타일 (JSON 문자열)

    @Builder.Default
    @Column(nullable = false)
    private boolean visible = true;

    @Builder.Default
    @Column(name = "feature_count", nullable = false)
    private int featureCount = 0;

    // ---- 엑셀 가져오기(PNU·좌표) — 설계 6.2 1단계 SQL(S1)이 먼저 실행돼 있어야 한다 ----

    @Column(name = "source_kind", length = 20)
    private String sourceKind; // SHP, EXCEL_COORD, EXCEL_PNU, EXCEL_ADDRESS

    @Builder.Default
    @Column(name = "progress_total", nullable = false)
    private int progressTotal = 0;

    @Builder.Default
    @Column(name = "progress_done", nullable = false)
    private int progressDone = 0;

    @Builder.Default
    @Column(name = "matched_count", nullable = false)
    private int matchedCount = 0;

    @Builder.Default
    @Column(name = "failed_count", nullable = false)
    private int failedCount = 0;

    @Column(name = "file_hash", length = 64)
    private String fileHash; // sha256 — 같은 사람이 같은 파일을 다시 올리면 미리보기에서 경고

    @Column(name = "parcel_version", length = 7)
    private String parcelVersion; // 매칭에 쓴 연속지적도 기준월 YYYY-MM

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

    public void applyColumnSchema(String json) {
        this.columnSchema = json;
    }

    public void markFailed(String errorMessage) {
        this.status = "FAILED";
        this.errorMessage = clip(errorMessage, ERROR_MESSAGE_MAX);
    }

    /** 부분 수정: null인 값은 그대로 둔다. 이름은 비어 있으면 무시하고 길이는 칸 크기에 맞춘다. styleConfig는 빈 문자열이면 지운다. */
    public void applyPatch(String name, String description, String styleConfig, Boolean visible) {
        if (name != null && !name.isBlank()) this.name = clip(name.strip(), 100);
        if (description != null) this.description = clip(description, 300);
        if (styleConfig != null) this.styleConfig = styleConfig.isBlank() ? null : styleConfig;
        if (visible != null) this.visible = visible;
    }

    public static final int ERROR_MESSAGE_MAX = 500;

    public static String clip(String s, int max) {
        if (s == null) return null;
        return s.length() > max ? s.substring(0, max) : s;
    }

    public boolean isOwnedBy(String userId) {
        return ownerId != null && ownerId.equals(userId);
    }
}
