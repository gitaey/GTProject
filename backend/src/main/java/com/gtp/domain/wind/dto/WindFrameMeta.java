package com.gtp.domain.wind.dto;

import lombok.Getter;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

@Getter
public class WindFrameMeta {
    private final Long id;
    private final int forecastHour;
    /** 유효시각(UTC, 시간대 표시 없음) — 화면에서 KST로 바꿔 보여야 한다 */
    private final LocalDateTime validTime;
    /** 발표(사이클) 날짜 — KST 기준 */
    private final LocalDate cycleDate;
    /** 발표(사이클) 시 — KST 기준(3·9·15·21) */
    private final int cycleHour;
    /**
     * 이 프레임 시각의 스칼라 변수 id(있는 것만, 예 {"temp": 5012, "humi": 5013}). 서버 설정(wind.fields)에서 끈 변수는 나오지 않는다.
     * 컨트롤러가 JPQL 결과에 붙인다 — 바람 프레임 본문과 별개 테이블이라 N+1 없이 한 번 더 조회해 합친다. 없으면 {}
     */
    private final Map<String, Long> fields = new LinkedHashMap<>();

    /** JPQL 생성자 표현식용 — 엔티티(data_json 포함)를 거치지 않고 필요한 컬럼만 읽는다 */
    public WindFrameMeta(Long id, int forecastHour, LocalDateTime validTime, LocalDate cycleDate, int cycleHour) {
        this.id = id;
        this.forecastHour = forecastHour;
        this.validTime = validTime;
        this.cycleDate = cycleDate;
        this.cycleHour = cycleHour;
    }

    /** 스칼라 변수 id 하나를 붙인다(같은 변수가 또 오면 큰 id가 이긴다 — 중복 행 방어) */
    public void putField(String varCode, Long scalarId) {
        fields.merge(varCode, scalarId, Math::max);
    }
}
