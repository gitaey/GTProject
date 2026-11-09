package com.gtp.domain.mymap.port;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 참조 자료 적재 기록(ref.load_meta)을 읽는 포트 — "이 지도의 건물·지적 자료가 언제 기준인가"(GET /api/mymap/ref/status)의 원천.
 * 읽기 전용. 구현 교체는 이 인터페이스 하나(JdbcRefLoadMetaReader / FakeRefLoadMetaReader).
 */
public interface RefLoadMetaReader {

    /** parcel 데이터셋 이름(적재 기록의 dataset 값) */
    String PARCEL = "parcel";

    /**
     * 적재 기록 한 줄. dataset은 표 이름에서 스키마를 뺀 값(ti_spbd_buld…) 또는 parcel, sido는 시도코드(전국 단위는 "00").
     * status는 적재 기록 그대로(READY | SWAPPING), baseDate는 원본 기준일(없을 수 있음), loadedAt은 적재 시각(시간대 없음).
     */
    record LoadRecord(String dataset, String sido, String version, String status, Long rowCount,
                      LocalDate baseDate, LocalDateTime loadedAt) {
    }

    /**
     * 요청 대상 데이터셋의 적재 기록 전부. 기록이 없으면 빈 목록, <b>읽지 못하면 예외</b>를 던진다(서비스가 둘을 구분한다 —
     * 빈 목록은 MISSING, 예외는 UNAVAILABLE).
     */
    List<LoadRecord> records();

    /** 표 이름("ref.ti_spbd_buld")에서 스키마를 뺀 적재 기록의 dataset 값("ti_spbd_buld") */
    static String datasetOf(String table) {
        int dot = table.lastIndexOf('.');
        return dot < 0 ? table : table.substring(dot + 1);
    }
}
