package com.gtp.domain.mymap.dto;

import com.fasterxml.jackson.annotation.JsonFormat;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * U27 참조 자료 적재 상태. 시각은 ISO-8601 + 시간대(Asia/Seoul), 날짜는 YYYY-MM-DD. 표 이름·DB 주소는 넣지 않는다.
 *
 * @param checkedAt 이 응답을 만든 시각
 * @param datasets  항상 4개, 순서 고정: building · road-code · related-jibun · parcel
 */
public record RefStatusResponse(
        @JsonFormat(shape = JsonFormat.Shape.STRING) OffsetDateTime checkedAt,
        List<RefDataset> datasets) {

    /**
     * @param status         READY | SWAPPING(교체 중) | PARTIAL(parcel만: 기대 시도 일부만) | MISSING(기록 없음) | UNAVAILABLE(기록을 읽지 못함)
     * @param version        기준월 YYYY-MM(parcel은 적재된 시도 중 가장 이른 값). MISSING·UNAVAILABLE이면 null
     * @param latestVersion  parcel만 가장 늦은 기준월, 나머지는 version과 같음
     * @param baseDate       원본 기준일(parcel은 가장 이른 값)
     * @param loadedAt       적재 시각(parcel은 가장 늦은 값)
     * @param rowCount       행 수(parcel은 시도 합계)
     * @param stale          오래됨 판정. MISSING·UNAVAILABLE이면 false
     * @param staleAfterDays 판정 기준 일수
     * @param coverage       parcel만(나머지·UNAVAILABLE은 null)
     */
    public record RefDataset(
            String id,
            String label,
            String source,
            String updateCycle,
            String status,
            String version,
            String latestVersion,
            @JsonFormat(shape = JsonFormat.Shape.STRING) LocalDate baseDate,
            @JsonFormat(shape = JsonFormat.Shape.STRING) OffsetDateTime loadedAt,
            Long rowCount,
            boolean stale,
            int staleAfterDays,
            Coverage coverage) {
    }

    /** loadedSidoCount: 기대 시도 중 적재된 수, expectedSidoCount: 기대 시도 수, nationwide: 전국 기준을 다 채웠고 지역 제한이 없음 */
    public record Coverage(int loadedSidoCount, int expectedSidoCount, boolean nationwide) {
    }
}
