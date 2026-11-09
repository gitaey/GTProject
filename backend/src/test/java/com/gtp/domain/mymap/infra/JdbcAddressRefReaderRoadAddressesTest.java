package com.gtp.domain.mymap.infra;

import com.gtp.domain.mymap.config.MyMapProperties;
import com.gtp.domain.mymap.infra.AddressRefReader.JibunAddresses;
import com.gtp.domain.mymap.infra.AddressRefReader.JibunKey;
import com.gtp.domain.mymap.infra.AddressRefReader.RoadAddressRow;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementSetter;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.lang.reflect.Proxy;
import java.sql.Array;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * U26 도로명주소 묶음 조회 — SQL 모양은 문자열로, 500개 묶음·n → 키 되짚기·바인딩·결과 매핑은 가짜 JDBC로 확인한다.
 * 적재 기록·색인 확인은 H2로 읽는다. 실제 SQL 실행(unnest … WITH ORDINALITY·DISTINCT ON·윈도 함수)은 PostgreSQL 전용이라
 * H2에서도 돌리지 않고, 운영 DB라 이 PC에서 실행하지도 않았다(사용자가 확인).
 */
class JdbcAddressRefReaderRoadAddressesTest {

    /** 한 번의 U26 쿼리 호출 기록 */
    record Call(String sql, List<String[]> varchars, List<Integer[]> ints, int perKey) {
    }

    JdbcTemplate h2;
    List<Call> calls;
    /** 호출마다 돌려줄 행(열 이름 → 값) 만들기 */
    java.util.function.Function<Call, List<Map<String, Object>>> rowsFor;
    JdbcAddressRefReader reader;

    @BeforeEach
    void setUp() {
        H2Functions.INDEXES.clear();
        h2 = new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:road_" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1"));
        h2.execute("CREATE ALIAS TO_REGCLASS FOR \"com.gtp.domain.mymap.infra.H2Functions.toRegclass\"");
        h2.execute("CREATE SCHEMA ref");
        h2.execute("CREATE TABLE ref.load_meta (dataset varchar(40), sido varchar(2), version varchar(7), status varchar(10))");
        h2.update("INSERT INTO ref.load_meta VALUES ('ti_spbd_buld', '00', '2026-09', 'READY')");
        h2.update("INSERT INTO ref.load_meta VALUES ('ti_sprd_stret', '00', '2026-09', 'READY')");
        H2Functions.INDEXES.add("ref.ix_ti_spbd_buld_jibun");
        calls = new ArrayList<>();
        rowsFor = c -> List.of();
        reader = new JdbcAddressRefReader(fakeRoadQuery(), new MyMapProperties.Ref());
    }

    @AfterEach
    void tearDown() {
        H2Functions.INDEXES.clear();
    }

    /** U26 SQL(모양: query(sql, setter, handler))만 가로채 가짜 행을 먹이고, 나머지(적재 기록·색인 확인)는 H2로 보낸다. */
    private JdbcOperations fakeRoadQuery() {
        return (JdbcOperations) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[]{JdbcOperations.class}, (proxy, m, args) -> {
            boolean road = m.getName().equals("query") && args.length == 3 && args[0] instanceof String s
                    && s.startsWith("WITH k AS") && args[1] instanceof PreparedStatementSetter;
            if (!road) {
                try {
                    return m.invoke(h2, args);
                } catch (java.lang.reflect.InvocationTargetException e) {
                    throw e.getCause();
                }
            }
            PreparedStatement ps = mock(PreparedStatement.class);
            Connection con = mock(Connection.class);
            when(ps.getConnection()).thenReturn(con);
            List<String[]> varchars = new ArrayList<>();
            List<Integer[]> ints = new ArrayList<>();
            when(con.createArrayOf(eq("varchar"), any())).thenAnswer(a -> {
                varchars.add((String[]) a.getArgument(1));
                return mock(Array.class);
            });
            when(con.createArrayOf(eq("int4"), any())).thenAnswer(a -> {
                ints.add((Integer[]) a.getArgument(1));
                return mock(Array.class);
            });
            ((PreparedStatementSetter) args[1]).setValues(ps);
            verify(ps).setArray(eq(1), any());
            verify(ps).setArray(eq(2), any());
            verify(ps).setArray(eq(3), any());
            verify(ps).setArray(eq(4), any());
            org.mockito.ArgumentCaptor<Integer> perKey = org.mockito.ArgumentCaptor.forClass(Integer.class);
            verify(ps).setInt(eq(5), perKey.capture());
            Call call = new Call((String) args[0], varchars, ints, perKey.getValue());
            calls.add(call);
            for (Map<String, Object> values : rowsFor.apply(call)) {
                ResultSet rs = mock(ResultSet.class);
                for (Map.Entry<String, Object> e : values.entrySet()) {
                    if (e.getValue() instanceof Integer i) when(rs.getInt(e.getKey())).thenReturn(i);
                    else when(rs.getString(e.getKey())).thenReturn((String) e.getValue());
                }
                ((RowCallbackHandler) args[2]).processRow(rs);
            }
            return null;
        });
    }

    static Map<String, Object> row(int n, int bldCnt, int addrCnt, int addrRel, String road, int main, String apt, String sgg, String name, String zip) {
        Map<String, Object> m = new java.util.HashMap<>();
        m.put("n", n);
        m.put("bld_cnt", bldCnt);
        m.put("addr_cnt", addrCnt);
        m.put("addr_rel", addrRel);
        m.put("ctp_kor_nm", "세종특별자치시 ");
        m.put("sig_kor_nm", null);
        m.put("emd_kor_nm", "반곡동");
        m.put("li_kor_nm", null);
        m.put("rn", road);
        m.put("udgd_yn", "0");
        m.put("buld_mnnm", main);
        m.put("buld_slno", 0);
        m.put("apt_yn", apt);
        m.put("sgg_buld_nm", sgg);
        m.put("buld_nm", name);
        m.put("zip_cd", zip);
        m.put("emd_gb", "1");
        return m;
    }

    static JibunKey key(int main) {
        return new JibunKey("3611011600", "0", main, 0);
    }

    // ---------- SQL 모양 ----------

    @Test
    void SQL_모양_대표지번은_색인_키_4열_등호와_폐지_제외_건물당_1줄_도로키당_1줄() {
        String sql = reader.roadAddressesByJibunSql();
        assertThat(sql).startsWith("WITH k AS")
                .contains("unnest(?::varchar[], ?::varchar[], ?::int[], ?::int[]) WITH ORDINALITY AS u(adm_cd, mntn_yn, lnbr_mnnm, lnbr_slno, n)")
                .contains("FROM k JOIN ref.ti_spbd_buld b ON b.adm_cd = k.adm_cd AND b.mntn_yn = k.mntn_yn AND b.lnbr_mnnm = k.lnbr_mnnm AND b.lnbr_slno = k.lnbr_slno")
                .contains("coalesce(b.mv_rs_cd, '') NOT IN ('63', '72')")
                .contains("DISTINCT ON (n, bd_mgt_sn)").contains("ORDER BY n, bd_mgt_sn, rel_ord")
                .contains("count(*) OVER (PARTITION BY n) AS bld_cnt")
                .contains("min(rel_ord) OVER (PARTITION BY n, road_cd, udgd_yn, buld_mnnm, buld_slno) AS addr_rel")
                .contains("row_number() OVER (PARTITION BY n, road_cd, udgd_yn, buld_mnnm, buld_slno ORDER BY")
                .contains("WHERE rk = 1").contains("count(*) OVER (PARTITION BY n) AS addr_cnt")
                .contains("ORDER BY addr_rel, rn, udgd_yn, buld_mnnm, buld_slno, road_cd) AS addr_ord")
                .contains("LEFT JOIN ref.ti_sprd_stret s ON s.sgg_cd = substr(r.road_cd, 1, 5) AND s.road_no = substr(r.road_cd, 6, 7) AND s.emd_no = r.emd_no")
                .contains("WHERE r.addr_ord <= ?")
                .endsWith("ORDER BY r.n, r.addr_ord")
                .doesNotContain("ti_scco_mvmn").doesNotContain("UNION");
        // 대표 건물 정렬: NULL이 앞서지 않게 coalesce로 감싼 불리언 — 시군구용 건물명 있는 공동주택 → 이름 있는 건물 → 대표지번 → 건물관리번호
        assertThat(sql).contains("(coalesce(apt_yn, '') = '1' AND coalesce(sgg_buld_nm, '') <> '') DESC, "
                + "(coalesce(buld_nm, '') <> '' OR coalesce(sgg_buld_nm, '') <> '') DESC, rel_ord, bd_mgt_sn");
        assertThat(count(sql, '?')).isEqualTo(5);                    // 배열 4 + perKey. 값은 이어 붙이지 않고 바인딩한다
        assertThat(sql).doesNotContain("3611").doesNotContain("LIMIT");
    }

    @Test
    void SQL_모양_관련지번은_UNION_ALL로_같은_4열_등호_폐지_제외() {
        String sql = reader.roadAddressesByJibunRelatedSql();
        assertThat(sql).contains(" UNION ALL ")
                .contains("FROM k JOIN ref.ti_scco_mvmn m ON m.adm_cd = k.adm_cd AND m.mntn_yn = k.mntn_yn AND m.lnbr_mnnm = k.lnbr_mnnm AND m.lnbr_slno = k.lnbr_slno "
                        + "JOIN ref.ti_spbd_buld b ON b.road_cd = m.road_cd AND b.udgd_yn = m.udgd_yn AND b.buld_mnnm = m.buld_mnnm AND b.buld_slno = m.buld_slno")
                .contains("coalesce(m.mv_rs_cd, '') <> '63'")
                .contains("0 AS rel_ord").contains("1 AS rel_ord")
                .contains("DISTINCT ON (n, bd_mgt_sn)").contains("WHERE r.addr_ord <= ?").endsWith("ORDER BY r.n, r.addr_ord");
        assertThat(count(sql, '?')).isEqualTo(5);
        // 대표지번 쪽 JOIN은 한 번만, 폐지 건물 제외는 두 갈래 모두
        assertThat(sql.split("b\\.adm_cd = k\\.adm_cd", -1)).hasSize(2);
        assertThat(sql.split("coalesce\\(b\\.mv_rs_cd, ''\\) NOT IN \\('63', '72'\\)", -1)).hasSize(3);
    }

    @Test
    void 표_이름은_설정을_따른다() {
        MyMapProperties.Ref ref = new MyMapProperties.Ref();
        ref.getAddress().setBuildingTable("juso.bld");
        ref.getAddress().setRoadCodeTable("juso.rd");
        ref.getAddress().setRelatedJibunTable("juso.rel");
        JdbcAddressRefReader r = new JdbcAddressRefReader(mock(JdbcOperations.class), ref);
        assertThat(r.roadAddressesByJibunRelatedSql()).contains("JOIN juso.bld b ON b.adm_cd").contains("JOIN juso.rel m ON m.adm_cd")
                .contains("LEFT JOIN juso.rd s ON s.sgg_cd").doesNotContain("ref.ti_");
    }

    private static int count(String s, char c) {
        int n = 0;
        for (char x : s.toCharArray()) if (x == c) n++;
        return n;
    }

    // ---------- 실행(가짜 JDBC) ----------

    @Test
    void 결과를_키에_되짚어_매핑하고_건물이_없는_키는_빠진다_바인딩은_배열4개와_perKey() {
        rowsFor = c -> List.of(
                row(2, 3, 2, 0, "반곡로", 51, "1", "예시아파트", "건축물대장명", "30145"),
                row(2, 3, 2, 1, "나길", 7, "0", null, null, " "));
        Map<JibunKey, JibunAddresses> out = reader.roadAddressesByJibun(List.of(key(1), key(2), key(3)), 20);

        assertThat(calls).hasSize(1);
        Call c = calls.get(0);
        assertThat(c.sql()).isEqualTo(reader.roadAddressesByJibunSql());   // 관련지번 색인이 없으면 대표지번 SQL
        assertThat(c.perKey()).isEqualTo(20);
        assertThat(c.varchars().get(0)).containsExactly("3611011600", "3611011600", "3611011600");   // adm_cd[]
        assertThat(c.varchars().get(1)).containsExactly("0", "0", "0");                                // mntn_yn[]
        assertThat(c.ints().get(0)).containsExactly(1, 2, 3);                                          // 본번[] — 순서가 n(1부터)이다
        assertThat(c.ints().get(1)).containsExactly(0, 0, 0);

        assertThat(out).containsOnlyKeys(key(2));                           // n=2 → 두 번째 키만
        JibunAddresses a = out.get(key(2));
        assertThat(a.buildingCount()).isEqualTo(3);
        assertThat(a.addressCount()).isEqualTo(2);
        assertThat(a.rows()).hasSize(2);
        RoadAddressRow first = a.rows().get(0);
        assertThat(first.relation()).isEqualTo("MAIN");
        assertThat(first.apartment()).isTrue();
        assertThat(first.sggName()).isEqualTo("예시아파트");
        assertThat(first.name()).isEqualTo("건축물대장명");
        assertThat(first.zipCode()).isEqualTo("30145");
        assertThat(first.parts().sido()).isEqualTo("세종특별자치시");     // 앞뒤 공백 정리
        assertThat(first.parts().roadName()).isEqualTo("반곡로");
        assertThat(first.parts().main()).isEqualTo(51);
        assertThat(first.parts().emdGb()).isEqualTo("1");
        assertThat(first.parts().buildingName()).isEqualTo("예시아파트");
        RoadAddressRow second = a.rows().get(1);
        assertThat(second.relation()).isEqualTo("RELATED");                // addr_rel 1
        assertThat(second.apartment()).isFalse();
        assertThat(second.name()).isEmpty();
        assertThat(second.zipCode()).isEmpty();                            // 공백 → 빈 값
    }

    @Test
    void 관련지번_색인이_있으면_관련지번_SQL을_쓴다() {
        H2Functions.INDEXES.add("ref.ix_ti_scco_mvmn_jibun");
        reader.roadAddressesByJibun(List.of(key(1)), 20);
        assertThat(calls.get(0).sql()).isEqualTo(reader.roadAddressesByJibunRelatedSql());
    }

    @Test
    void 키는_500개씩_묶고_묶음마다_n을_다시_센다_중복은_합친다() {
        rowsFor = c -> {
            // 묶음의 마지막 키에만 결과가 있다고 가정 — n = 묶음 안 순번
            int last = c.ints().get(0).length;
            return List.of(row(last, 1, 1, 0, "길", c.ints().get(0)[last - 1], "0", null, null, "30145"));
        };
        List<JibunKey> keys = new ArrayList<>();
        for (int i = 1; i <= 1001; i++) keys.add(key(i));
        keys.add(key(7));                                                     // 중복
        Map<JibunKey, JibunAddresses> out = reader.roadAddressesByJibun(keys, 5);

        assertThat(calls).extracting(c -> c.ints().get(0).length).containsExactly(500, 500, 1);
        assertThat(calls).extracting(Call::perKey).containsOnly(5);
        assertThat(out).containsOnlyKeys(key(500), key(1000), key(1001));
        assertThat(out.get(key(1000)).rows().get(0).parts().main()).isEqualTo(1000);
    }

    @Test
    void 빈_키는_조회하지_않고_perKey_0은_거절() {
        assertThat(reader.roadAddressesByJibun(List.of(), 20)).isEmpty();
        assertThat(calls).isEmpty();
        assertThatThrownBy(() -> reader.roadAddressesByJibun(List.of(key(1)), 0)).isInstanceOf(IllegalArgumentException.class);
        assertThat(calls).isEmpty();
    }

    @Test
    void 기본_구현은_빈_결과() {
        AddressRefReader plain = new InMemoryAddressRefReader("x") {
        };
        assertThat(new AddressRefReader() {
            @Override
            public String readyVersion() {
                return "x";
            }

            @Override
            public List<LegalDong> legalDongs() {
                return List.of();
            }

            @Override
            public List<RoadCode> findRoadCodes(java.util.Collection<String> roadNames) {
                return List.of();
            }

            @Override
            public List<Building> findBuildings(java.util.Collection<BuildingKey> keys) {
                return List.of();
            }
        }.roadAddressesByJibun(List.of(key(1)), 20)).isEmpty();
        assertThat(plain.roadAddressesByJibun(List.of(key(1)), 20)).isEmpty();   // 메모리 구현도 건물이 없으면 빈 결과
    }
}
