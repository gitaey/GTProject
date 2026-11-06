package com.gtp.domain.geoserver.dto;

import lombok.Getter;

/** 수정 요청의 멤버. 기존 멤버면 상세의 name 그대로, 새 레이어면 'ws:layer'. 스타일은 보내지 않는다(서버가 원래 것을 유지). */
@Getter
public class LayerGroupMemberRef {
    private String type;
    private String name;
}
