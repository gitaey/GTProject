package com.gtp.domain.mymap.dto;

import com.gtp.domain.mymap.entity.UserMap;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
public class UserMapListItem {
    private final Long id;
    private final String name;
    private final String description;
    private final String sourceType;
    private final String geomType;
    private final String status;
    private final boolean visible;
    private final int featureCount;
    private final boolean owner;
    private final String styleConfig;
    private final LocalDateTime createdAt;

    // 1단계(엑셀 PNU·좌표 가져오기) 추가 필드
    private final String ownerId;
    /** SHP | EXCEL_COORD | EXCEL_PNU | EXCEL_ADDRESS (옛 행은 sourceType으로 채움) */
    private final String sourceKind;
    private final int matchedCount;
    private final int failedCount;
    private final int progressTotal;
    private final int progressDone;
    /** 매칭에 쓴 연속지적도 기준월(YYYY-MM). PNU 레이어만 */
    private final String parcelVersion;
    /** FAILED 레이어의 이유(그 밖에는 null) — 새로고침 뒤에도 사유를 보여 주려고 목록에도 싣는다 */
    private final String errorMessage;

    /** 공유받은 항목만 채움(내 항목은 null) — 보낸 사람 이름. 이름을 못 찾으면 null */
    private final String ownerName;
    /** 내 항목만: 사용자 + 그룹 공유 수. 공유받은 항목은 null */
    private final Integer shareCount;

    public UserMapListItem(UserMap m, boolean owner) {
        this(m, owner, null, null);
    }

    public UserMapListItem(UserMap m, boolean owner, String ownerName, Integer shareCount) {
        this.ownerName = ownerName;
        this.shareCount = shareCount;
        this.id = m.getId();
        this.name = m.getName();
        this.description = m.getDescription();
        this.sourceType = m.getSourceType();
        this.geomType = m.getGeomType();
        this.status = m.getStatus();
        this.visible = m.isVisible();
        this.featureCount = m.getFeatureCount();
        this.owner = owner;
        this.styleConfig = m.getStyleConfig();
        this.createdAt = m.getCreatedAt();
        this.ownerId = m.getOwnerId();
        this.sourceKind = m.getSourceKind() != null ? m.getSourceKind()
                : ("SHP".equals(m.getSourceType()) ? "SHP" : "EXCEL_COORD");
        this.matchedCount = m.getMatchedCount();
        this.failedCount = m.getFailedCount();
        this.progressTotal = m.getProgressTotal();
        this.progressDone = m.getProgressDone();
        this.parcelVersion = m.getParcelVersion();
        this.errorMessage = m.getErrorMessage();
    }
}
