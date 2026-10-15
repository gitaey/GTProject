package com.gtp.domain.wind.repository;

import com.gtp.domain.wind.entity.WindScalarEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

/**
 * 스칼라 변수 한 장도 수백 KB라서 목록·존재 확인에서는 data_json을 읽지 않는다.
 * 바람 프레임 리포지토리와 같은 규칙(완전 사이클 기준으로 "더 오래된 것만" 삭제).
 */
public interface WindScalarRepository extends JpaRepository<WindScalarEntity, Long> {

    /** 한 사이클에 이미 있는 (예보시간, 변수, id) — 본문 없이. 메타 목록의 fields와 "빠진 것만 받기"에 쓴다 */
    @Query("""
        SELECT s.forecastHour, s.varCode, s.id FROM WindScalarEntity s
        WHERE s.cycleDate = :cycleDate AND s.cycleHour = :cycleHour
        ORDER BY s.forecastHour ASC, s.id ASC
        """)
    List<Object[]> findKeysByCycle(@Param("cycleDate") LocalDate cycleDate, @Param("cycleHour") int cycleHour);

    /** 한 장의 본문(JSON 문자열)만 */
    @Query("SELECT s.dataJson FROM WindScalarEntity s WHERE s.id = :id")
    Optional<String> findDataJsonById(@Param("id") Long id);

    boolean existsByCycleDateAndCycleHourAndForecastHourAndVarCode(LocalDate cycleDate, int cycleHour, int forecastHour, String varCode);

    /** 같은 (사이클, 예보시간, 변수)가 여러 행이면 id가 가장 큰 것만 남긴다(유니크 인덱스가 없을 때의 방어, 트랜잭션 안에서 호출) */
    @Modifying
    @Query("""
        DELETE FROM WindScalarEntity s
        WHERE s.cycleDate = :cycleDate AND s.cycleHour = :cycleHour
          AND s.id < (SELECT MAX(x.id) FROM WindScalarEntity x
                      WHERE x.cycleDate = :cycleDate AND x.cycleHour = :cycleHour
                        AND x.forecastHour = s.forecastHour AND x.varCode = s.varCode)
        """)
    int deleteDuplicatesInCycle(@Param("cycleDate") LocalDate cycleDate, @Param("cycleHour") int cycleHour);

    /** 지정한 사이클보다 오래된 사이클의 스칼라를 지운다(바람 프레임 정리와 같은 기준 사이클) */
    @Modifying
    @Query("DELETE FROM WindScalarEntity s WHERE s.cycleDate < :cycleDate OR (s.cycleDate = :cycleDate AND s.cycleHour < :cycleHour)")
    int deleteCyclesOlderThan(@Param("cycleDate") LocalDate cycleDate, @Param("cycleHour") int cycleHour);
}
