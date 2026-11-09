package com.gtp.domain.mymap.infra;

import com.gtp.domain.mymap.config.MyMapProperties;
import com.gtp.domain.mymap.port.RefLoadMetaReader;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 메모리 적재 기록. {@code mymap.ref.provider=fake}(DB 없는 시험·로컬 개발)일 때 쓴다.
 * {@link #samples}는 "오늘 기준으로 막 적재한" 건물DB 3종과 전국 지적도 한 벌이라 화면에서는 모두 정상으로 보인다.
 */
public class FakeRefLoadMetaReader implements RefLoadMetaReader {

    private final List<LoadRecord> records;
    private final RuntimeException failure;

    public FakeRefLoadMetaReader(List<LoadRecord> records) {
        this(records, null);
    }

    /** failure가 있으면 records() 호출이 그 예외를 던진다(읽기 실패 시험용) */
    public FakeRefLoadMetaReader(List<LoadRecord> records, RuntimeException failure) {
        this.records = List.copyOf(records);
        this.failure = failure;
    }

    public static FakeRefLoadMetaReader samples(MyMapProperties.Ref ref, LocalDate today) {
        List<LoadRecord> all = new ArrayList<>();
        String month = today.getYear() + "-" + String.format("%02d", today.getMonthValue());
        LocalDateTime loaded = today.atTime(3, 0);
        MyMapProperties.Address a = ref.getAddress();
        for (String table : List.of(a.getBuildingTable(), a.getRoadCodeTable(), a.getRelatedJibunTable())) {
            all.add(new LoadRecord(RefLoadMetaReader.datasetOf(table), "00", month, "READY", 1000L, today, loaded));
        }
        for (String sido : ref.getExpectedSidoCodes()) {
            all.add(new LoadRecord(PARCEL, sido, month, "READY", 100L, today, loaded));
        }
        return new FakeRefLoadMetaReader(all);
    }

    @Override
    public List<LoadRecord> records() {
        if (failure != null) throw failure;
        return records;
    }
}
