package com.gtp.domain.wind.entity;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * GFS 바람 데이터 한 프레임(특정 유효시각의 U/V 격자 값, grib2json 포맷 JSON).
 * 사이클(cycleDate + cycleHour)마다 forecastHour(0~5) 개수만큼 저장되고,
 * 새 사이클이 들어오면 이전 사이클은 전부 삭제된다(최신 사이클만 유지).
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
    private java.time.LocalDate cycleDate;

    @Column(name = "cycle_hour", nullable = false)
    private int cycleHour;          // 0, 6, 12, 18 (UTC)

    @Column(name = "forecast_hour", nullable = false)
    private int forecastHour;       // 0~5

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
