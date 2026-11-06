package com.gtp.domain.geoserver.dto;

import lombok.Getter;

import java.util.List;

/** 레이어 그룹 수정 요청. revision은 편집을 시작할 때 받은 상세의 revision, members는 저장 후 최종 목록(그리는 순서). */
@Getter
public class LayerGroupUpdateRequest {
    private String revision;
    private String title;
    private String description;
    private String mode;
    private List<LayerGroupMemberRef> members;
}
