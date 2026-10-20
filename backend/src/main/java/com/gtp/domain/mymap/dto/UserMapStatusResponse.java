package com.gtp.domain.mymap.dto;

import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class UserMapStatusResponse {
    private Long id;
    private String status;
    private String errorMessage;
    private int featureCount;
    private int progressTotal;
    private int progressDone;
    private int matchedCount;
    private int failedCount;
    /** 매칭에 쓴 연속지적도 기준월(PNU 레이어, 끝난 뒤에 채워짐) */
    private String parcelVersion;
    private String geomType;
}
