package com.gtp.domain.geoserver.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.util.List;

/**
 * 레이어 그룹 상세. members는 그리는 순서(0 = 가장 먼저 그림 = 지도에서 맨 아래)이며 뒤집지 않는다.
 * verified=false는 만들기·수정은 성공했지만 다시 읽기에 실패해 요청값으로 채웠다는 뜻이다.
 * revision은 내용 지문(수정 요청에 그대로 돌려보낸다), editBlockedReason·layersLockedReason은 한국어 이유(없으면 null).
 */
@Getter
@AllArgsConstructor
public class LayerGroupDetail {
    private final String name;
    private final String workspace;
    private final String wmsName;
    private final String title;
    /** GeoServer abstractTxt */
    private final String description;
    private final String mode;
    private final List<LayerGroupMember> members;
    private final LayerGroupBounds bounds;
    private final boolean verified;
    private final String revision;
    private final String editBlockedReason;
    private final String layersLockedReason;
}
