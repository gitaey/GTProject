package com.gtp.domain.mymap.service;

import com.gtp.domain.mymap.config.MyMapProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/**
 * 나만의지도 정리 작업. {@code mymap.maintenance.enabled=false}면 전부 건너뛴다 — 로컬 백엔드가 운영 DB를 보는 개발자는
 * 기동 때 남의 PROCESSING 레이어를 FAILED로 바꾸지 않도록 이 값을 꺼 둘 수 있다(환경 변수 MYMAP_MAINTENANCE_ENABLED).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class MyMapMaintenance {

    static final String STALLED_MESSAGE = "서버가 다시 시작되어 처리가 중단되었습니다. 다시 올려 주세요.";

    private final UserMapImportStore store;
    private final PendingUploadRegistry pendingUploads;
    private final MyMapProperties props;

    /** 매일 03:40 — 보관 기간(기본 30일)이 지난 실패 행 삭제(주소 등 개인정보가 있을 수 있다) */
    @Scheduled(cron = "0 40 3 * * *")
    public void purgeOldFailures() {
        purgeOldFailures(LocalDateTime.now());
    }

    public int purgeOldFailures(LocalDateTime now) {
        if (!props.getMaintenance().isEnabled()) return 0;
        try {
            int n = store.deleteFailuresOlderThan(now.minusDays(props.getMaintenance().getFailureRetentionDays()));
            if (n > 0) log.info("[나만의지도] 보관 기간이 지난 실패 행 {}건 삭제", n);
            return n;
        } catch (RuntimeException e) {
            log.error("[나만의지도] 실패 행 정리 실패", e);
            return 0;
        }
    }

    /** 10분마다 — 확정되지 않고 만료된 미리보기 파일 삭제 */
    @Scheduled(fixedDelay = 600_000, initialDelay = 600_000)
    public void sweepPreviews() {
        if (!props.getMaintenance().isEnabled()) return;
        try {
            int expired = pendingUploads.sweepExpired();
            int orphans = pendingUploads.sweepOrphans();
            if (expired + orphans > 0) log.info("[나만의지도] 미리보기 임시 파일 정리: 만료 {}건, 주인 없는 파일 {}건", expired, orphans);
        } catch (RuntimeException e) {
            log.error("[나만의지도] 미리보기 임시 파일 정리 실패", e);
        }
    }

    /** 기동 직후 — 진행 기록이 30분 넘게 멈춘 PROCESSING 레이어를 FAILED로(서버가 죽으면서 작업이 사라진 것) */
    @EventListener(ApplicationReadyEvent.class)
    public void failStalledImports() {
        failStalledImports(LocalDateTime.now());
    }

    public int failStalledImports(LocalDateTime now) {
        if (!props.getMaintenance().isEnabled()) return 0;
        try {
            int n = store.failStalled(now.minusMinutes(props.getUpload().getStalledMinutes()), STALLED_MESSAGE);
            if (n > 0) log.warn("[나만의지도] 멈춘 PROCESSING 레이어 {}건을 FAILED로 정리", n);
            return n;
        } catch (RuntimeException e) {
            log.error("[나만의지도] 멈춘 레이어 정리 실패", e);
            return 0;
        }
    }
}
