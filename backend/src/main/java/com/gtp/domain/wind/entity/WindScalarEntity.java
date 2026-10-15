package com.gtp.domain.wind.entity;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 기상청 LDAPS 스칼라 변수(기온·습도·강수량) 한 장 — (발표 사이클, 예보시간, 변수) 하나당 1행.
 * 바람 프레임({@link WindFrameEntity})과 같은 0.02° 출력 격자이고, 값은 정수로 양자화한 JSON이다:
 * <pre>{"header":{lo1,la1,lo2,la2,nx,ny,dx,dy,refTime,forecastTime,var,unit,scale},"data":[정수|null, ...]}</pre>
 * 실제 값 = data[i] × header.scale, null = 자료 없음(원격자 밖·결측, 0과 다르다).
 *
 * <p><b>이 테이블은 사용자가 SQL(<code>_workspace/wind-panel/v2/ddl.sql</code>)을 먼저 실행한 뒤에 쓴다.</b>
 * ddl-auto가 update라서 이 엔티티가 든 백엔드를 띄우면 테이블이 만들어진다(유니크 인덱스는 만들어 주지 않는다).
 */
@Entity
@Table(name = "tbl_wind_scalar")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class WindScalarEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "cycle_date", nullable = false)
    private LocalDate cycleDate;        // 발표 날짜(KST)

    @Column(name = "cycle_hour", nullable = false)
    private int cycleHour;              // 3, 9, 15, 21 (KST 발표 시각)

    @Column(name = "forecast_hour", nullable = false)
    private int forecastHour;           // 0 ~ wind.forecast-hours-1

    @Column(name = "var_code", nullable = false, length = 16)
    private String varCode;             // temp | humi | rain

    @Column(name = "valid_time", nullable = false)
    private LocalDateTime validTime;    // 발표 + forecastHour (UTC 값, 바람 프레임과 같은 규칙)

    @Column(name = "data_json", columnDefinition = "TEXT", nullable = false)
    private String dataJson;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Builder
    public WindScalarEntity(LocalDate cycleDate, int cycleHour, int forecastHour, String varCode,
                            LocalDateTime validTime, String dataJson) {
        this.cycleDate = cycleDate;
        this.cycleHour = cycleHour;
        this.forecastHour = forecastHour;
        this.varCode = varCode;
        this.validTime = validTime;
        this.dataJson = dataJson;
        this.createdAt = LocalDateTime.now();
    }
}
