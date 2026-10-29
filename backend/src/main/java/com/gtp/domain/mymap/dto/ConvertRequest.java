package com.gtp.domain.mymap.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * 주소 변환(엑셀로만 받기) 요청. 미리보기가 돌려준 uploadId의 파일을 읽어 주소 칸을 풀고 결과 엑셀을 만든다(지도에 레이어를 만들지 않는다).
 * include가 없으면 {pnu, roadAddress, jibunAddress, lonLat = true, area = false}, srid가 없으면 4326.
 */
@Getter
@Setter
@NoArgsConstructor
public class ConvertRequest {
    private String uploadId;
    private String addressColumn;
    private Include include;
    /** 4326 | 5186 | 5179 | 3857 (경도·위도 또는 X·Y 좌표 열의 좌표계) */
    private Integer srid;

    @Getter
    @Setter
    @NoArgsConstructor
    public static class Include {
        private boolean pnu;
        private boolean roadAddress;
        private boolean jibunAddress;
        private boolean lonLat;
        /** 필지 면적(㎡) — 선택, 기본 꺼짐 */
        private boolean area;
    }
}
