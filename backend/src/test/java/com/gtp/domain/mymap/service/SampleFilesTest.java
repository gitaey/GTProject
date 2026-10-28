package com.gtp.domain.mymap.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.gtp.domain.mymap.config.MyMapImportExecutor;
import com.gtp.domain.mymap.config.MyMapProperties;
import com.gtp.domain.mymap.dto.ExcelPreviewResponse.Suggestions;
import com.gtp.domain.mymap.entity.UserMap;
import com.gtp.domain.mymap.infra.FakePnuParcelProvider;
import com.gtp.domain.mymap.infra.InMemoryAddressRefReader;
import com.gtp.domain.mymap.infra.TableAddressResolver;
import com.gtp.domain.mymap.model.ImportMode;
import com.gtp.domain.mymap.repository.UserMapRepository;
import com.gtp.domain.mymap.util.CellData;
import com.gtp.domain.mymap.util.ColumnSuggester;
import com.gtp.domain.mymap.util.ExcelSheet;
import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import org.apache.poi.ss.usermodel.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.io.ByteArrayInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 앱에 포함된 샘플 엑셀 3종: 내려받기, 안내 문구, 그리고 실제로 올려 보면 7건이 전부 매칭되는지(가짜 필지). */
@DataJpaTest
class SampleFilesTest {

    @Autowired
    UserMapRepository repo;
    @Autowired
    JdbcTemplate jdbc;
    @TempDir
    Path dir;

    final SampleService samples = new SampleService();

    @Test
    void 세_종류를_내려받는다_대소문자_무관() {
        for (String kind : List.of("pnu", "address", "coord", "PNU", "Coord")) {
            SampleService.Sample s = samples.load(kind);
            assertThat(s.bytes()).as(kind).hasSizeGreaterThan(1000);
            assertThat(s.bytes()[0]).isEqualTo((byte) 'P');          // xlsx = zip
            assertThat(s.bytes()[1]).isEqualTo((byte) 'K');
            assertThat(s.filename()).startsWith("나만의지도_샘플_").endsWith(".xlsx");
        }
        assertThat(samples.load("pnu").filename()).isEqualTo("나만의지도_샘플_PNU.xlsx");
        assertThat(samples.load("address").filename()).isEqualTo("나만의지도_샘플_주소.xlsx");
        assertThat(samples.load("coord").filename()).isEqualTo("나만의지도_샘플_좌표.xlsx");
    }

    @Test
    void 모르는_종류는_MYMAP_SAMPLE_NOT_FOUND() {
        for (String kind : new String[]{"nope", "", "../application", "pnu.xlsx", null}) {
            assertThatThrownBy(() -> samples.load(kind)).as(String.valueOf(kind))
                    .isInstanceOfSatisfying(CustomException.class, e -> assertThat(e.getErrorCode()).isEqualTo(GisErrorCode.MYMAP_SAMPLE_NOT_FOUND));
        }
    }

    private Path file(String kind) throws Exception {
        return Files.write(dir.resolve(kind + ".xlsx"), samples.load(kind).bytes());
    }

    private Suggestions suggest(Path f) {
        com.gtp.domain.mymap.XlsxTestUtil.Table t = com.gtp.domain.mymap.XlsxTestUtil.read(f);
        List<List<CellData>> rows = new ArrayList<>();
        t.rows().forEach(r -> rows.add(r.cells()));
        return ColumnSuggester.suggest(t.headers(), rows).suggestions();
    }

    @Test
    void PNU_샘플은_PNU로_추천되고_7건이_모두_매칭된다() throws Exception {
        Path f = file("pnu");
        Suggestions s = suggest(f);
        assertThat(s.getMode()).isEqualTo("PNU");
        assertThat(s.getPnuColumn()).isEqualTo("PNU");

        UserMap m = repo.saveAndFlush(UserMap.builder().name("샘플").ownerId("alice").sourceType("EXCEL").sourceSrid("EPSG:4326").progressTotal(7).build());
        job().execute(new UserMapImportJob.Request(m.getId(), "alice", ImportMode.PNU, f, 7, "PNU", null, null, "EPSG:4326"));
        assertThat(jdbc.queryForObject("SELECT matched_count FROM tbl_user_map WHERE id = ?", Integer.class, m.getId())).isEqualTo(7);
        assertThat(jdbc.queryForObject("SELECT failed_count FROM tbl_user_map WHERE id = ?", Integer.class, m.getId())).isZero();
    }

    @Test
    void 좌표_샘플은_위경도로_추천되고_7건이_모두_올라간다() throws Exception {
        Path f = file("coord");
        Suggestions s = suggest(f);
        assertThat(s.getMode()).isEqualTo("COORD");
        assertThat(s.getLatColumn()).isEqualTo("위도");
        assertThat(s.getLonColumn()).isEqualTo("경도");
        assertThat(s.getSourceSrid()).isEqualTo("EPSG:4326");

        UserMap m = repo.saveAndFlush(UserMap.builder().name("샘플").ownerId("alice").sourceType("EXCEL").sourceSrid("EPSG:4326").progressTotal(7).build());
        job().execute(new UserMapImportJob.Request(m.getId(), "alice", ImportMode.COORD, f, 7, null, "위도", "경도", "EPSG:4326"));
        assertThat(jdbc.queryForObject("SELECT matched_count FROM tbl_user_map WHERE id = ?", Integer.class, m.getId())).isEqualTo(7);
        assertThat(jdbc.queryForObject("SELECT failed_count FROM tbl_user_map WHERE id = ?", Integer.class, m.getId())).isZero();
    }

    @Test
    void 주소_샘플은_주소_컬럼으로_추천되고_7곳이_모두_필지가_된다() throws Exception {
        Path f = file("address");
        var s = suggest(f);
        assertThat(s.getMode()).isEqualTo("ADDRESS");
        assertThat(s.getAddressColumn()).isEqualTo("주소");

        UserMap m = repo.saveAndFlush(UserMap.builder().name("주소 샘플").ownerId("alice").sourceType("EXCEL").sourceKind("EXCEL_ADDRESS").sourceSrid("EPSG:4326").progressTotal(7).build());
        job().execute(new UserMapImportJob.Request(m.getId(), "alice", ImportMode.ADDRESS, f, 7, null, null, null, "EPSG:4326", "주소"));
        assertThat(jdbc.queryForObject("SELECT status FROM tbl_user_map WHERE id = ?", String.class, m.getId())).isEqualTo("READY");
        assertThat(jdbc.queryForObject("SELECT matched_count FROM tbl_user_map WHERE id = ?", Integer.class, m.getId())).isEqualTo(7);
        assertThat(jdbc.queryForObject("SELECT failed_count FROM tbl_user_map WHERE id = ?", Integer.class, m.getId())).isZero();
    }

    @Test
    void 안내_시트는_최대_5000행이고_옛_문구가_없다() throws Exception {
        for (String kind : List.of("pnu", "address", "coord")) {
            try (Workbook wb = WorkbookFactory.create(new ByteArrayInputStream(samples.load(kind).bytes()))) {
                assertThat(wb.getNumberOfSheets()).isEqualTo(2);
                Sheet guide = wb.getSheet("작성 안내");
                assertThat(guide).as(kind).isNotNull();
                StringBuilder all = new StringBuilder();
                for (Row r : guide) for (Cell c : r) all.append(c.getStringCellValue()).append('\n');
                String text = all.toString();
                assertThat(text).as(kind).contains("최대 5,000행");
                assertThat(text).as(kind).doesNotContain("1,000행").doesNotContain("오래 걸립니다").doesNotContain("확정되면");
                if (kind.equals("address")) {
                    // 현재 동작과 맞는 안내: 시도만 적어도 대부분 되고, 같은 이름이 여러 곳이면 후보가 보고서에 나옴, 법정동·도로명 기준(행정동 X)
                    assertThat(text).contains("시도만 적어도 대부분").contains("후보가 나오니 시도·시군구를 붙여").contains("행정동").contains("법정동");
                    assertThat(text).doesNotContain("틀리게 찾아질 수 있습니다");
                }
            }
        }
    }

    @Test
    void 샘플_PNU_열은_텍스트_서식이라_19자리가_보존된다() throws Exception {
        com.gtp.domain.mymap.XlsxTestUtil.Table t = com.gtp.domain.mymap.XlsxTestUtil.read(file("pnu"));
        assertThat(t.rows()).hasSize(7);
        for (ExcelSheet.Row row : t.rows()) {
            CellData d = row.cells().get(0);
            assertThat(d.numeric()).isFalse();
            assertThat(d.text()).hasSize(19);
        }
    }

    private UserMapImportJob job() {
        return new UserMapImportJob(FakePnuParcelProvider.fromClasspath(new ObjectMapper()), new TableAddressResolver(InMemoryAddressRefReader.samples(), 5), new UserMapImportStore(jdbc), jdbc,
                new MyMapProperties(), new MyMapImportExecutor(1, 1), new ImportGuard());
    }
}
