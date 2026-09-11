package com.gtp.domain.wind.repository;

import com.gtp.domain.wind.entity.WindFrameEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface WindFrameRepository extends JpaRepository<WindFrameEntity, Long> {

    List<WindFrameEntity> findAllByOrderByForecastHourAsc();

    /* 현재 시각(UTC)에 가장 가까운 과거/현재 프레임 = 유효시각이 now 이하인 것 중 가장 최근 */
    @Query("""
        SELECT w FROM WindFrameEntity w
        WHERE w.validTime <= :now
        ORDER BY w.validTime DESC
        """)
    List<WindFrameEntity> findCurrentCandidates(@Param("now") LocalDateTime now);

    Optional<WindFrameEntity> findFirstByOrderByValidTimeAsc();

    boolean existsByCycleDateAndCycleHour(LocalDate cycleDate, int cycleHour);

    @Modifying
    @Query("DELETE FROM WindFrameEntity w WHERE w.cycleDate <> :cycleDate OR w.cycleHour <> :cycleHour")
    void deleteAllExceptCycle(@Param("cycleDate") LocalDate cycleDate, @Param("cycleHour") int cycleHour);
}
