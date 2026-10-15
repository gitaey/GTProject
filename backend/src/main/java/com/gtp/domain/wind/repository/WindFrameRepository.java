package com.gtp.domain.wind.repository;

import com.gtp.domain.wind.dto.WindFrameMeta;
import com.gtp.domain.wind.entity.WindFrameEntity;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * 바람 프레임 한 줄의 data_json은 수 MB라서, 목록·선택 조회에서는 절대 엔티티 전체를 읽지 않는다.
 * id/메타만 먼저 고르고, 필요한 한 프레임의 data_json만 {@link #findDataJsonById}로 읽는다.
 */
public interface WindFrameRepository extends JpaRepository<WindFrameEntity, Long> {

    /** 최신 사이클 키 [cycleDate, cycleHour] — Pageable(0, 1)로 한 건만 받는다. data_json은 읽지 않는다 */
    @Query("""
        SELECT w.cycleDate, w.cycleHour FROM WindFrameEntity w
        ORDER BY w.cycleDate DESC, w.cycleHour DESC, w.forecastHour DESC
        """)
    List<Object[]> findCycleKeysDesc(Pageable pageable);

    /**
     * 예보시간이 서로 다른 프레임이 minFrames개 이상 모인 "완전한" 사이클 키 [cycleDate, cycleHour, 프레임 수] — 가장 늦은 순.
     * 중복 프레임(같은 예보시간)은 한 번만 센다. 모자란 사이클(다운로드 중·일부 실패)은 나오지 않는다. data_json은 읽지 않는다
     */
    @Query("""
        SELECT w.cycleDate, w.cycleHour, COUNT(DISTINCT w.forecastHour) FROM WindFrameEntity w
        GROUP BY w.cycleDate, w.cycleHour
        HAVING COUNT(DISTINCT w.forecastHour) >= :minFrames
        ORDER BY w.cycleDate DESC, w.cycleHour DESC
        """)
    List<Object[]> findCompleteCycleKeysDesc(@Param("minFrames") long minFrames, Pageable pageable);

    /** 한 사이클에 들어 있는 서로 다른 예보시간 수(중복은 한 번만) */
    @Query("SELECT COUNT(DISTINCT w.forecastHour) FROM WindFrameEntity w WHERE w.cycleDate = :cycleDate AND w.cycleHour = :cycleHour")
    long countDistinctForecastHours(@Param("cycleDate") LocalDate cycleDate, @Param("cycleHour") int cycleHour);

    /** 한 사이클의 프레임 메타(id·예보시간·유효시각·발표 날짜/시) — data_json은 읽지 않는다 */
    @Query("""
        SELECT new com.gtp.domain.wind.dto.WindFrameMeta(w.id, w.forecastHour, w.validTime, w.cycleDate, w.cycleHour)
        FROM WindFrameEntity w
        WHERE w.cycleDate = :cycleDate AND w.cycleHour = :cycleHour
        ORDER BY w.forecastHour ASC, w.id ASC
        """)
    List<WindFrameMeta> findMetaByCycle(@Param("cycleDate") LocalDate cycleDate, @Param("cycleHour") int cycleHour);

    /* 현재 시각(UTC)에 가장 가까운 과거/현재 프레임 id = 유효시각이 now 이하인 것 중 가장 최근(같으면 더 새 사이클) */
    @Query("""
        SELECT w.id FROM WindFrameEntity w
        WHERE w.validTime <= :now
        ORDER BY w.validTime DESC, w.cycleDate DESC, w.cycleHour DESC, w.id DESC
        """)
    List<Long> findCurrentFrameIds(@Param("now") LocalDateTime now, Pageable pageable);

    /** now 이전 프레임이 하나도 없을 때의 대체: 가장 이른 프레임 id */
    @Query("SELECT w.id FROM WindFrameEntity w ORDER BY w.validTime ASC, w.id DESC")
    List<Long> findOldestFrameIds(Pageable pageable);

    /** 한 프레임의 바람 데이터(grib2json 문자열)만 읽는다 */
    @Query("SELECT w.dataJson FROM WindFrameEntity w WHERE w.id = :id")
    Optional<String> findDataJsonById(@Param("id") Long id);

    boolean existsByCycleDateAndCycleHour(LocalDate cycleDate, int cycleHour);

    boolean existsByCycleDateAndCycleHourAndForecastHour(LocalDate cycleDate, int cycleHour, int forecastHour);

    /** 한 사이클 안에서 같은 예보시간(forecastHour) 프레임이 여러 개면 id가 가장 큰 것만 남긴다(트랜잭션 안에서 호출) */
    @Modifying
    @Query("""
        DELETE FROM WindFrameEntity w
        WHERE w.cycleDate = :cycleDate AND w.cycleHour = :cycleHour
          AND w.id < (SELECT MAX(x.id) FROM WindFrameEntity x
                      WHERE x.cycleDate = :cycleDate AND x.cycleHour = :cycleHour AND x.forecastHour = w.forecastHour)
        """)
    int deleteDuplicateFramesInCycle(@Param("cycleDate") LocalDate cycleDate, @Param("cycleHour") int cycleHour);

    /**
     * 지정한 사이클보다 **오래된** 사이클의 프레임을 지운다(트랜잭션 안에서 호출). 지운 행 수를 돌려준다.
     * "다른 사이클 전부"(<>)가 아니라 "더 오래된 것만"이라, 키를 읽은 뒤 다른 서버가 방금 저장한 더 새 사이클은 지우지 않는다
     */
    @Modifying
    @Query("DELETE FROM WindFrameEntity w WHERE w.cycleDate < :cycleDate OR (w.cycleDate = :cycleDate AND w.cycleHour < :cycleHour)")
    int deleteCyclesOlderThan(@Param("cycleDate") LocalDate cycleDate, @Param("cycleHour") int cycleHour);
}
