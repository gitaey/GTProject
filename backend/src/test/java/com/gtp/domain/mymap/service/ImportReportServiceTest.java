package com.gtp.domain.mymap.service;

import com.gtp.domain.mymap.dto.ImportReportResponse;
import com.gtp.domain.mymap.entity.UserMap;
import com.gtp.domain.mymap.entity.UserMapUserAccess;
import com.gtp.domain.mymap.repository.*;
import com.gtp.domain.mymap.service.UserMapImportStore.FailureRow;
import com.gtp.domain.mymap.util.ExcelSheet;
import com.gtp.domain.mymap.util.CellData;
import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
class ImportReportServiceTest {

    @Autowired
    UserMapRepository repo;
    @Autowired
    UserMapImportFailureRepository failureRepo;
    @Autowired
    UserMapFeatureRepository featureRepo;
    @Autowired
    UserMapUserAccessRepository userAccess;
    @Autowired
    UserMapPermissionAccessRepository permAccess;
    @Autowired
    EntityManager em;
    @Autowired
    JdbcTemplate jdbc;
    @TempDir
    Path dir;

    ImportReportService service;
    UserMapImportStore store;
    UserMap map;

    @BeforeEach
    void setUp() {
        service = new ImportReportService(repo, failureRepo, featureRepo, new UserMapPermissionService(userAccess, permAccess, em));
        store = new UserMapImportStore(jdbc);
        map = repo.saveAndFlush(UserMap.builder().name("보고서").ownerId("alice").sourceType("EXCEL").sourceKind("EXCEL_PNU")
                .sourceSrid("EPSG:4326").build());
        jdbc.update("UPDATE tbl_user_map SET matched_count = 95, failed_count = 5, status = 'READY' WHERE id = ?", map.getId());
        store.insertFailures(map.getId(), List.of(
                new FailureRow(30, "PARCEL_NOT_FOUND", "1114010300100999990", null, "{\"PNU\":\"1114010300100999990\",\"이름\":\"a\"}"),
                new FailureRow(12, "PNU_FORMAT", "12345", null, "{\"PNU\":\"12345\",\"이름\":\"b\",\"비고\":\"추가열\"}"),
                new FailureRow(45, "PARCEL_NOT_FOUND", "1114010300100999980", null, "{\"PNU\":\"1114010300100999980\",\"이름\":\"c\"}"),
                new FailureRow(7, "AMBIGUOUS", "세종대로 110", "[\"서울 중구\",\"부산 중구\"]", "{\"PNU\":\"\",\"이름\":\"d\"}"),
                new FailureRow(50, "SOME_OLD_CODE", "x", null, "{\"PNU\":\"=1+1\",\"이름\":\"e\"}")));
        em.clear();
    }

    private static CustomException caught(Runnable r) {
        try {
            r.run();
        } catch (CustomException e) {
            return e;
        }
        throw new AssertionError("CustomException이 나야 합니다");
    }

    @Test
    void 보고서_요약_사유별_집계_행번호순() {
        ImportReportResponse r = service.report(map.getId(), "alice", 0, 100, null);
        assertThat(r.getTotal()).isEqualTo(100);
        assertThat(r.getMatched()).isEqualTo(95);
        assertThat(r.getFailed()).isEqualTo(5);
        assertThat(r.getTotalRows()).isEqualTo(5);
        assertThat(r.getRows()).extracting(ImportReportResponse.Row::getRowNo).containsExactly(7, 12, 30, 45, 50);
        // 사유별 건수는 많은 순
        assertThat(r.getByReason().entrySet().iterator().next()).isEqualTo(java.util.Map.entry("PARCEL_NOT_FOUND", 2L));
        assertThat(r.getByReason()).containsEntry("PNU_FORMAT", 1L).containsEntry("AMBIGUOUS", 1L);
    }

    @Test
    void 중복_PNU_건수를_알려_준다() {
        assertThat(service.report(map.getId(), "alice", 0, 10, null).getDuplicatePnuCount()).isZero();   // 피처가 아직 없다
        for (String[] f : new String[][]{{"1114010300100310000", "2"}, {"1114010300100310000", "10"}, {"1114010300100310000", "20"},
                {"3611010300107180000", "3"}, {"3611010300107180000", "4"}, {"2647010200110000000", "5"}}) {
            jdbc.update("INSERT INTO tbl_user_map_feature (user_map_id, geometry_json, properties_json, pnu, row_no) VALUES (?, '{}', '{}', ?, ?)",
                    map.getId(), f[0], Integer.parseInt(f[1]));
        }
        jdbc.update("INSERT INTO tbl_user_map_feature (user_map_id, geometry_json, properties_json) VALUES (?, '{}', '{}')", map.getId());   // PNU 없는 피처(좌표 레이어 등)는 세지 않는다
        em.clear();
        // 서로 다른 PNU 3개에 피처 6개 → 중복 3건(서울 2 + 세종 1)
        assertThat(service.report(map.getId(), "alice", 0, 10, null).getDuplicatePnuCount()).isEqualTo(3);
        // 다른 레이어의 피처는 세지 않는다
        UserMap other = repo.saveAndFlush(UserMap.builder().name("다른").ownerId("alice").sourceType("EXCEL").sourceSrid("EPSG:4326").build());
        assertThat(service.report(other.getId(), "alice", 0, 10, null).getDuplicatePnuCount()).isZero();
    }

    @Test
    void 행의_사유_문구_입력값_후보() {
        ImportReportResponse r = service.report(map.getId(), "alice", 0, 100, null);
        ImportReportResponse.Row ambiguous = r.getRows().get(0);
        assertThat(ambiguous.getReason()).isEqualTo("AMBIGUOUS");
        assertThat(ambiguous.getMessage()).contains("후보가 여러 개");
        assertThat(ambiguous.getInput()).isEqualTo("세종대로 110");
        assertThat(ambiguous.getCandidates()).containsExactly("서울 중구", "부산 중구");

        ImportReportResponse.Row format = r.getRows().get(1);
        assertThat(format.getMessage()).contains("19자리");
        assertThat(format.getCandidates()).isNull();                 // 후보가 없으면 null

        assertThat(r.getRows().get(4).getMessage()).isEqualTo("SOME_OLD_CODE");   // 지워진 옛 코드여도 보고서가 죽지 않는다
    }

    @Test
    void 페이지와_크기와_사유_필터() {
        ImportReportResponse p0 = service.report(map.getId(), "alice", 0, 2, null);
        assertThat(p0.getRows()).extracting(ImportReportResponse.Row::getRowNo).containsExactly(7, 12);
        assertThat(p0.getTotalRows()).isEqualTo(5);
        assertThat(p0.getPage()).isZero();
        assertThat(p0.getSize()).isEqualTo(2);
        assertThat(service.report(map.getId(), "alice", 1, 2, null).getRows()).extracting(ImportReportResponse.Row::getRowNo).containsExactly(30, 45);
        assertThat(service.report(map.getId(), "alice", 2, 2, null).getRows()).extracting(ImportReportResponse.Row::getRowNo).containsExactly(50);

        ImportReportResponse f = service.report(map.getId(), "alice", 0, 100, "PARCEL_NOT_FOUND");
        assertThat(f.getRows()).extracting(ImportReportResponse.Row::getRowNo).containsExactly(30, 45);
        assertThat(f.getTotalRows()).isEqualTo(2);
        assertThat(f.getByReason()).hasSize(4).containsEntry("PARCEL_NOT_FOUND", 2L);   // 요약은 필터와 무관
        assertThat(service.report(map.getId(), "alice", 0, 100, "").getTotalRows()).isEqualTo(5);
    }

    @Test
    void 크기_범위를_바로잡는다() {
        assertThat(service.report(map.getId(), "alice", -3, 0, null).getSize()).isEqualTo(1);
        assertThat(service.report(map.getId(), "alice", -3, 0, null).getPage()).isZero();
        assertThat(service.report(map.getId(), "alice", 0, 100000, null).getSize()).isEqualTo(ImportReportService.MAX_PAGE_SIZE);
    }

    @Test
    void 소유자만_본다_공유받은_사람과_남은_403_없는_레이어는_404() {
        userAccess.saveAndFlush(UserMapUserAccess.builder().userId("bob").userMap(map).build());
        assertThat(caught(() -> service.report(map.getId(), "bob", 0, 10, null)).getErrorCode()).isEqualTo(GisErrorCode.USER_MAP_FORBIDDEN);
        assertThat(caught(() -> service.failuresXlsx(map.getId(), "bob")).getErrorCode()).isEqualTo(GisErrorCode.USER_MAP_FORBIDDEN);
        assertThat(caught(() -> service.report(map.getId(), "mallory", 0, 10, null)).getErrorCode()).isEqualTo(GisErrorCode.USER_MAP_FORBIDDEN);
        assertThat(caught(() -> service.report(map.getId(), null, 0, 10, null)).getErrorCode()).isEqualTo(GisErrorCode.USER_MAP_FORBIDDEN);
        assertThat(caught(() -> service.report(99999L, "alice", 0, 10, null)).getErrorCode()).isEqualTo(GisErrorCode.USER_MAP_NOT_FOUND);
        assertThat(caught(() -> service.failuresXlsx(99999L, "alice")).getErrorCode()).isEqualTo(GisErrorCode.USER_MAP_NOT_FOUND);
    }

    // ---------- 실패 행 엑셀 ----------

    private List<List<String>> readXlsx(byte[] bytes) throws Exception {
        Path f = Files.write(dir.resolve("out.xlsx"), bytes);
        com.gtp.domain.mymap.XlsxTestUtil.Table t = com.gtp.domain.mymap.XlsxTestUtil.read(f);
        List<List<String>> rows = new ArrayList<>();
        rows.add(t.headers());
        t.rows().forEach(r -> rows.add(r.cells().stream().map(CellData::text).toList()));
        return rows;
    }

    @Test
    void 실패_행_엑셀은_원본_컬럼_그대로_실패사유와_후보를_덧붙인다() throws Exception {
        List<List<String>> rows = readXlsx(service.failuresXlsx(map.getId(), "alice"));

        // 열 순서: 처음 나온 순서의 원본 컬럼 합집합 + 실패사유 + 후보 (행 번호 같은 덧붙임 열은 없다)
        assertThat(rows.get(0)).containsExactly("PNU", "이름", "비고", "실패사유", "후보");
        assertThat(rows).hasSize(6);
        // 행 번호순: 7(AMBIGUOUS) 12 30 45 50
        assertThat(rows.get(1)).containsExactly("", "d", "", "후보가 여러 개입니다(시도·시군구를 붙여 주세요)", "서울 중구 | 부산 중구");
        assertThat(rows.get(2)).containsExactly("12345", "b", "추가열", "PNU가 19자리 숫자가 아닙니다", "");
        assertThat(rows.get(3).get(0)).isEqualTo("1114010300100999990");
        assertThat(rows.get(3).get(3)).contains("지적도에 없는 필지");
        // '='로 시작하는 값도 수식이 아니라 글자로 들어간다
        assertThat(rows.get(5).get(0)).isEqualTo("=1+1");
        assertThat(rows.get(5).get(3)).isEqualTo("SOME_OLD_CODE");
    }

    @Test
    void 실패_행이_없어도_머리글만_있는_엑셀() throws Exception {
        UserMap clean = repo.saveAndFlush(UserMap.builder().name("깨끗").ownerId("alice").sourceType("EXCEL").sourceSrid("EPSG:4326").build());
        List<List<String>> rows = readXlsx(service.failuresXlsx(clean.getId(), "alice"));
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0)).containsExactly("실패사유", "후보");
    }

    @Test
    void 실패_행이_2000개여도_모두_담는다_페이지_경계() throws Exception {
        List<FailureRow> many = new ArrayList<>();
        for (int i = 0; i < 2050; i++) many.add(new FailureRow(1000 + i, "EMPTY", "", null, "{\"PNU\":\"\"}"));
        UserMap big = repo.saveAndFlush(UserMap.builder().name("큰 보고서").ownerId("alice").sourceType("EXCEL").sourceSrid("EPSG:4326").build());
        store.insertFailures(big.getId(), many);
        em.clear();
        List<List<String>> rows = readXlsx(service.failuresXlsx(big.getId(), "alice"));
        assertThat(rows).hasSize(2051);
    }
}
