package com.gtp.domain.mymap.infra;

import com.gtp.domain.mymap.config.MyMapProperties;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

/**
 * 건물DB 읽기 구현: SQL 모양(표 이름 설정·폐지 제외·인덱스 키 JOIN)은 문자열로, 적재 기록 읽기와 법정동 사전 원천은 H2로 확인한다.
 * 배열 바인딩(ANY·unnest)이 든 두 조회는 PostgreSQL 전용이라 H2에서 돌리지 않는다 — 실DB 확인은 구현 기록(07)에 있다.
 */
class JdbcAddressRefReaderTest {

    private static JdbcTemplate h2() {
        JdbcTemplate jdbc = new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:addr_" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1"));
        jdbc.execute("CREATE SCHEMA ref");
        jdbc.execute("CREATE TABLE ref.load_meta (dataset varchar(40), sido varchar(2), version varchar(7), status varchar(10))");
        jdbc.execute("CREATE TABLE ref.ti_spbd_buld (adm_cd varchar(10), ctp_kor_nm varchar(40), sig_kor_nm varchar(40), emd_kor_nm varchar(40), li_kor_nm varchar(40))");
        return jdbc;
    }

    private static void meta(JdbcTemplate jdbc, String dataset, String version, String status) {
        jdbc.update("INSERT INTO ref.load_meta VALUES (?, '00', ?, ?)", dataset, version, status);
    }

    @Test
    void 기본_설정의_SQL_모양() {
        JdbcAddressRefReader r = new JdbcAddressRefReader(mock(org.springframework.jdbc.core.JdbcOperations.class), new MyMapProperties.Ref());
        assertThat(r.legalDongSql()).isEqualTo("SELECT DISTINCT adm_cd, ctp_kor_nm, sig_kor_nm, emd_kor_nm, li_kor_nm FROM ref.ti_spbd_buld");
        assertThat(r.roadCodeSql()).contains("FROM ref.ti_sprd_stret").contains("rn = ANY(?::varchar[])")
                .contains("coalesce(use_yn, '0') = '0'").contains("coalesce(ersr_de, '') = ''").contains("GROUP BY road_cd");
        assertThat(r.buildingSql()).contains("JOIN ref.ti_spbd_buld b ON b.road_cd = k.road_cd AND b.udgd_yn = k.udgd_yn")
                .contains("b.buld_mnnm = k.buld_mnnm AND b.buld_slno = k.buld_slno")
                .contains("NOT IN ('63', '72')");   // 폐지 건물 제외
        assertThat(r.readySql()).contains("FROM ref.load_meta").contains("dataset IN (?, ?)");
    }

    @Test
    void 표_이름은_설정을_따르고_식별자_모양만_허용한다() {
        MyMapProperties.Ref ref = new MyMapProperties.Ref();
        ref.getAddress().setBuildingTable("juso.bld");
        ref.getAddress().setRoadCodeTable("juso.road");
        JdbcAddressRefReader r = new JdbcAddressRefReader(mock(org.springframework.jdbc.core.JdbcOperations.class), ref);
        assertThat(r.legalDongSql()).endsWith("FROM juso.bld");
        assertThat(r.roadCodeSql()).contains("FROM juso.road");
        assertThat(r.buildingSql()).contains("JOIN juso.bld b");

        for (String bad : List.of("ref.ti; DROP TABLE x", "a b", "", "ref.a.b", "1abc")) {
            MyMapProperties.Ref evil = new MyMapProperties.Ref();
            evil.getAddress().setBuildingTable(bad);
            assertThatThrownBy(() -> new JdbcAddressRefReader(mock(org.springframework.jdbc.core.JdbcOperations.class), evil))
                    .as(bad).isInstanceOf(IllegalArgumentException.class);
            MyMapProperties.Ref evil2 = new MyMapProperties.Ref();
            evil2.getAddress().setRoadCodeTable(bad);
            assertThatThrownBy(() -> new JdbcAddressRefReader(mock(org.springframework.jdbc.core.JdbcOperations.class), evil2))
                    .as(bad).isInstanceOf(IllegalArgumentException.class);
        }
        assertThat(JdbcAddressRefReader.datasetOf("ref.ti_spbd_buld")).isEqualTo("ti_spbd_buld");
        assertThat(JdbcAddressRefReader.datasetOf("ti_sprd_stret")).isEqualTo("ti_sprd_stret");
    }

    @Test
    void 적재_기록이_둘_다_READY일_때만_준비됨_기준월은_건물정보() {
        JdbcTemplate jdbc = h2();
        JdbcAddressRefReader r = new JdbcAddressRefReader(jdbc, new MyMapProperties.Ref());
        assertThat(r.readyVersion()).isNull();                                 // 기록 없음

        meta(jdbc, "ti_spbd_buld", "2026-09", "READY");
        assertThat(r.readyVersion()).isNull();                                 // 도로명코드 기록이 없다

        meta(jdbc, "ti_sprd_stret", "2026-08", "READY");
        meta(jdbc, "parcel", "2026-10", "READY");                              // 지적도 기록은 상관없다
        assertThat(r.readyVersion()).isEqualTo("2026-09");

        jdbc.update("UPDATE ref.load_meta SET status = 'SWAPPING' WHERE dataset = 'ti_sprd_stret'");
        assertThat(r.readyVersion()).isNull();                                 // 교체 중
    }

    @Test
    void 적재_기록_표가_없으면_준비_안_됨() {
        JdbcTemplate jdbc = new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:addr_" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1"));
        assertThat(new JdbcAddressRefReader(jdbc, new MyMapProperties.Ref()).readyVersion()).isNull();
    }

    @Test
    void 법정동_사전_원천은_중복_없이_읽고_빈_값은_빈_글자로() {
        JdbcTemplate jdbc = h2();
        jdbc.update("INSERT INTO ref.ti_spbd_buld VALUES ('3611010300', '세종특별자치시', NULL, '보람동', NULL)");
        jdbc.update("INSERT INTO ref.ti_spbd_buld VALUES ('3611010300', '세종특별자치시', NULL, '보람동', NULL)");
        jdbc.update("INSERT INTO ref.ti_spbd_buld VALUES ('4136025023', '경기도', '남양주시', '와부읍', '팔당리')");
        List<AddressRefReader.LegalDong> all = new JdbcAddressRefReader(jdbc, new MyMapProperties.Ref()).legalDongs();
        assertThat(all).containsExactlyInAnyOrder(
                new AddressRefReader.LegalDong("3611010300", "세종특별자치시", "", "보람동", ""),
                new AddressRefReader.LegalDong("4136025023", "경기도", "남양주시", "와부읍", "팔당리"));
    }
}
