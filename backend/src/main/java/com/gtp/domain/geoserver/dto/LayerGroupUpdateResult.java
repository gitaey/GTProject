package com.gtp.domain.geoserver.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

/** 수정 결과. boundsAction은 KEPT·RECALCULATED·STALE 중 하나. changed=false면 바뀐 게 없어 GeoServer에 PUT을 보내지 않았다. */
@Getter
@AllArgsConstructor
public class LayerGroupUpdateResult {
    private final LayerGroupDetail group;
    private final boolean changed;
    private final String boundsAction;
    private final boolean boundsCrsChanged;
    private final String boundsNote;
}
