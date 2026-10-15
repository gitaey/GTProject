package com.gtp.domain.wind.entity;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 기상청 LDAPS 바람 데이터 한 프레임(특정 유효시각의 U/V 격자 값, grib2json 포맷 JSON).
 * 사이클(cycleDate + cycleHour, **KST** 03·09·15·21시 발표)마다 forecastHour(0 ~ wind.forecast-hours-1) 개수만큼 저장되고,
 * 새 사이클이 모두 모이면 그보다 오래된 사이클은 삭제된다(최신 "완전한" 사이클만 유지).
 */
@Entity
@Table(name = "tbl_wind_frame")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class WindFrameEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "cycle_date", nullable = false)
    private java.time.LocalDate cycleDate; // 발표 날짜(KST)

    @Column(name = "cycle_hour", nullable = false)
    private int cycleHour;          // 3, 9, 15, 21 (KST 발표 시각)

    @Column(name = "forecast_hour", nullable = false)
    private int forecastHour;       // 0 ~ wind.forecast-hours-1 (발표 + N시간)

    @Column(name = "valid_time", nullable = false)
    private LocalDateTime validTime; // cycle + forecastHour (UTC)

    @Column(name = "data_json", columnDefinition = "TEXT", nullable = false)
    private String dataJson;         // grib2json 포맷 (U/V 성분 header+data 배열)

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Builder
    public WindFrameEntity(java.time.LocalDate cycleDate, int cycleHour, int forecastHour,
                            LocalDateTime validTime, String dataJson) {
        this.cycleDate = cycleDate;
        this.cycleHour = cycleHour;
        this.forecastHour = forecastHour;
        this.validTime = validTime;
        this.dataJson = dataJson;
        this.createdAt = LocalDateTime.now();
    }
}
