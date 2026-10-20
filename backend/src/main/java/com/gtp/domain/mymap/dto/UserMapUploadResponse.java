package com.gtp.domain.mymap.dto;

import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class UserMapUploadResponse {
    private Long id;
    private String name;
    private String status;
    /** PNU 가져오기에서만: 지금 적재된 연속지적도의 기준월(예정값). 처리가 끝나면 상태·목록의 parcelVersion이 확정값 */
    private String parcelVersion;
}
