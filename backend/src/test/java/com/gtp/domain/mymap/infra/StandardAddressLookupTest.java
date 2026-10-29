package com.gtp.domain.mymap.infra;

import com.gtp.domain.mymap.config.MyMapProperties;
import com.gtp.domain.mymap.infra.AddressRefReader.BuildingKey;
import com.gtp.domain.mymap.infra.AddressRefReader.StandardParts;
import com.gtp.domain.mymap.model.ImportFailureReason;
import com.gtp.domain.mymap.port.AddressMatch;
import com.gtp.domain.mymap.port.ParcelPoint;
import com.gtp.domain.mymap.port.StandardAddress;
import com.gtp.global.exception.CustomException;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.RowCallbackHandler;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/** 표준 주소 재료 조회(SQL 모양·지번 색인 유무 분기·캐시)와 해석기의 표준 주소 만들기, 필지 대표점 공급자. */
class StandardAddressLookupTest {

    // ---------- JdbcAddressRefReader: SQL 모양 ----------

    @Test
    void 표준_주소_SQL은_바인딩_배열과_도로명코드_PK_조인이다() {
        JdbcAddressRefReader r = new JdbcAddressRefReader(mock(JdbcOperations.class), new MyMapProperties.Ref());
        assertThat(r.standardByRoadSql())
                .contains("DISTINCT ON (k.n)")
                .contains("unnest(?::varchar[], ?::varchar[], ?::int[], ?::int[]) WITH ORDINALITY")
                .contains("JOIN ref.ti_spbd_buld b ON b.road_cd = k.road_cd AND b.udgd_yn = k.udgd_yn")   // ix_ti_spbd_buld_road
                .contains("LEFT JOIN ref.ti_sprd_stret s ON s.sgg_cd = substr(b.road_cd, 1, 5) AND s.road_no = substr(b.road_cd, 6, 7)")
                .contains("s.emd_no = b.emd_no")
                .contains("NOT IN ('63', '72')")
                .contains("ORDER BY k.n, b.adm_cd, b.mntn_yn, b.lnbr_mnnm, b.lnbr_slno");
        assertThat(r.standardByJibunSql())
                .contains("JOIN ref.ti_spbd_buld b ON b.adm_cd = k.adm_cd AND b.mntn_yn = k.mntn_yn")
                .contains("b.lnbr_mnnm = k.lnbr_mnnm AND b.lnbr_slno = k.lnbr_slno")
                .contains("NOT IN ('63', '72')")
                .contains("ORDER BY k.n, b.buld_mnnm, b.buld_slno");   // 건물이 여럿이면 건물본번·부번 오름차순 첫 건물
    }

    @Test
    void 색인_이름은_건물_표_이름에서_만든다() {
        assertThat(new JdbcAddressRefReader(mock(JdbcOperations.class), new MyMapProperties.Ref()).jibunIndexName())
                .isEqualTo("ref.ix_ti_spbd_buld_jibun");
        MyMapProperties.Ref ref = new MyMapProperties.Ref();
        ref.getAddress().setBuildingTable("juso.ti_spbd_buld");
        assertThat(new JdbcAddressRefReader(mock(JdbcOperations.class), ref).jibunIndexName()).isEqualTo("juso.ix_ti_spbd_buld_jibun");
    }

    // ---------- 색인 유무 분기·캐시 ----------

    /** 적재 기록(readyVersion)과 색인 확인(queryForObject)을 흉내 내는 jdbc */
    @SuppressWarnings("unchecked")
    private static JdbcOperations jdbcWith(String[] version, Boolean[] indexExists, int[] indexChecks) {
        JdbcOperations jdbc = mock(JdbcOperations.class);
        doAnswer(inv -> {
            RowCallbackHandler h = inv.getArgument(1);
            if (version[0] == null) return null;
            for (String dataset : List.of("ti_spbd_buld", "ti_sprd_stret")) {
                java.sql.ResultSet rs = mock(java.sql.ResultSet.class);
                when(rs.getString("dataset")).thenReturn(dataset);
                when(rs.getString("version")).thenReturn(version[0]);
                when(rs.getString("status")).thenReturn("READY");
                h.processRow(rs);
            }
            return null;
        }).when(jdbc).query(anyString(), any(RowCallbackHandler.class), any(Object[].class));
        when(jdbc.queryForObject(anyString(), eq(Boolean.class), any(Object[].class))).thenAnswer(inv -> {
            indexChecks[0]++;
            if (indexExists[0] == null) throw new DataRetrievalFailureException("boom");
            return indexExists[0];
        });
        return jdbc;
    }

    @Test
    void 색인이_있으면_지번_조회를_켜고_결과를_기억한다() {
        String[] version = {"2026-09"};
        Boolean[] exists = {true};
        int[] checks = {0};
        JdbcAddressRefReader r = new JdbcAddressRefReader(jdbcWith(version, exists, checks), new MyMapProperties.Ref());

        assertThat(r.jibunLookupReady()).isTrue();
        assertThat(r.jibunLookupReady()).isTrue();
        assertThat(checks[0]).as("같은 기준월이면 다시 확인하지 않는다").isEqualTo(1);
    }

    @Test
    void 색인이_없으면_끄고_기준월이_바뀌면_다시_확인한다() {
        String[] version = {"2026-09"};
        Boolean[] exists = {false};
        int[] checks = {0};
        JdbcAddressRefReader r = new JdbcAddressRefReader(jdbcWith(version, exists, checks), new MyMapProperties.Ref());

        assertThat(r.jibunLookupReady()).isFalse();
        assertThat(r.jibunLookupReady()).isFalse();
        assertThat(checks[0]).as("없음도 잠시 기억한다").isEqualTo(1);

        exists[0] = true;                 // 운영자가 색인을 만들었다 — 기준월이 같으면(시간이 지나기 전에는) 아직 모른다
        assertThat(r.jibunLookupReady()).isFalse();
        version[0] = "2026-10";           // 새 표로 교체 → 다시 확인
        assertThat(r.jibunLookupReady()).isTrue();
        assertThat(checks[0]).isEqualTo(2);
    }

    @Test
    void 자료가_준비되지_않았거나_확인이_실패하면_꺼진다() {
        String[] version = {null};
        Boolean[] exists = {true};
        int[] checks = {0};
        JdbcAddressRefReader notReady = new JdbcAddressRefReader(jdbcWith(version, exists, checks), new MyMapProperties.Ref());
        assertThat(notReady.jibunLookupReady()).isFalse();
        assertThat(checks[0]).isZero();

        JdbcAddressRefReader failing = new JdbcAddressRefReader(jdbcWith(new String[]{"2026-09"}, new Boolean[]{null}, checks), new MyMapProperties.Ref());
        assertThat(failing.jibunLookupReady()).isFalse();
    }

    // ---------- TableAddressResolver.standardize ----------

    private static InMemoryAddressRefReader reader() {
        InMemoryAddressRefReader r = new InMemoryAddressRefReader("2026-09");
        r.legalDong("1121510300", "서울특별시", "광진구", "구의동", "");
        r.road("112153104008", "서울특별시", "광진구", "영화사로", true)
                .building("112153104008", false, 87, 0, "1121510300", false, 16, 26, "서울특별시", "광진구", "구의동", "", "영화사로")
                .building("112153104008", false, 87, 1, "1121510300", false, 16, 27, "서울특별시", "광진구", "구의동", "", "영화사로");
        r.standard(new BuildingKey("112153104008", "0", 87, 1),
                new StandardParts("서울특별시", "광진구", "구의동", "", "영화사로", "0", 87, 1, true, "주택", "1"));
        r.legalDong("1123010400", "서울특별시", "동대문구", "전농동", "");
        r.road("112303105008", "서울특별시", "동대문구", "왕산로", true)
                .building("112303105008", true, 205, 0, "1123010400", false, 620, 67, "서울특별시", "동대문구", "전농동", "", "왕산로");
        return r;
    }

    private static TableAddressResolver resolver(InMemoryAddressRefReader r) {
        return new TableAddressResolver(r, 5);
    }

    @Test
    void 도로명_입력_행은_해석에서_찾은_건물로_도로명주소와_지번주소를_만든다() {
        TableAddressResolver res = resolver(reader());
        List<AddressMatch> m = res.resolve(List.of("서울특별시 광진구 영화사로 87", "서울특별시 광진구 영화사로 87-1", "서울특별시 동대문구 왕산로 지하 205"));
        assertThat(m).extracting(AddressMatch::status).containsOnly(AddressMatch.Status.MATCHED);
        assertThat(m.get(1).building()).isEqualTo(new AddressMatch.BuildingRef("112153104008", "0", 87, 1));

        List<StandardAddress> std = res.standardize(m, true, true);
        assertThat(std.get(0).road()).isEqualTo("서울특별시 광진구 영화사로 87 (구의동)");
        assertThat(std.get(0).jibun()).isEqualTo("서울특별시 광진구 구의동 16-26");
        assertThat(std.get(1).road()).isEqualTo("서울특별시 광진구 영화사로 87-1 (구의동, 주택)");
        assertThat(std.get(2).road()).isEqualTo("서울특별시 동대문구 왕산로 지하205 (전농동)");
    }

    @Test
    void 지번_입력_행은_색인이_있을_때만_도로명주소를_채운다() {
        InMemoryAddressRefReader r = reader();
        TableAddressResolver res = resolver(r);
        List<AddressMatch> m = res.resolve(List.of("서울특별시 광진구 구의동 16-26"));
        assertThat(m.get(0).status()).isEqualTo(AddressMatch.Status.MATCHED);
        assertThat(m.get(0).building()).isNull();

        // 색인 있음 → 지번으로 건물을 찾아 도로명주소 채움
        StandardAddress with = res.standardize(m, true, true).get(0);
        assertThat(with.road()).isEqualTo("서울특별시 광진구 영화사로 87 (구의동)");
        assertThat(with.jibun()).isEqualTo("서울특별시 광진구 구의동 16-26");
        assertThat(r.standardByJibunCalls).isEqualTo(1);

        // 색인 없음 → 건물 조회를 하지 않고 도로명주소는 빈 칸, 지번주소는 그대로
        r.jibunReady(false);
        r.standardByJibunCalls = 0;
        StandardAddress without = res.standardize(m, true, true).get(0);
        assertThat(without.road()).isEmpty();
        assertThat(without.jibun()).isEqualTo("서울특별시 광진구 구의동 16-26");
        assertThat(r.standardByJibunCalls).as("색인이 없으면 전체 스캔 조회를 아예 부르지 않는다").isZero();
    }

    @Test
    void 지번에_건물이_여럿이면_건물본번_부번_오름차순_첫_건물() {
        InMemoryAddressRefReader r = new InMemoryAddressRefReader("2026-09");
        r.legalDong("1121510300", "서울특별시", "광진구", "구의동", "");
        r.road("112153104008", "서울특별시", "광진구", "영화사로", true)
                .building("112153104008", false, 90, 0, "1121510300", false, 16, 26, "서울특별시", "광진구", "구의동", "", "영화사로")
                .building("112153104008", false, 88, 3, "1121510300", false, 16, 26, "서울특별시", "광진구", "구의동", "", "영화사로")
                .building("112153104008", false, 88, 1, "1121510300", false, 16, 26, "서울특별시", "광진구", "구의동", "", "영화사로");
        TableAddressResolver res = resolver(r);
        StandardAddress s = res.standardize(res.resolve(List.of("서울특별시 광진구 구의동 16-26")), true, false).get(0);
        assertThat(s.road()).isEqualTo("서울특별시 광진구 영화사로 88-1 (구의동)");
        assertThat(s.jibun()).isEmpty();   // wantJibun=false
    }

    @Test
    void 해석에_실패한_행과_도로명을_원하지_않을_때는_조회하지_않는다() {
        InMemoryAddressRefReader r = reader();
        TableAddressResolver res = resolver(r);
        List<AddressMatch> m = res.resolve(List.of("어디쯤", "서울특별시 광진구 영화사로 87"));
        List<StandardAddress> std = res.standardize(m, false, true);
        assertThat(std.get(0)).isEqualTo(StandardAddress.EMPTY);
        assertThat(std.get(1).road()).isEmpty();
        assertThat(std.get(1).jibun()).isEqualTo("서울특별시 광진구 구의동 16-26");
        assertThat(r.standardByRoadCalls).isZero();
        assertThat(m.get(0).reason()).isEqualTo(ImportFailureReason.PARSE_FAILED);
    }

    @Test
    void 자료가_준비되지_않았으면_503() {
        InMemoryAddressRefReader r = reader();
        TableAddressResolver res = resolver(r);
        List<AddressMatch> m = res.resolve(List.of("서울특별시 광진구 영화사로 87"));
        r.setReadyVersion(null);
        assertThatThrownBy(() -> res.standardize(m, true, true)).isInstanceOf(CustomException.class);
        assertThat(res.jibunAddressFormatter().apply("1121510300100160026")).isEmpty();
    }

    @Test
    void 지번주소_변환기는_PNU로_사전을_조회한다() {
        TableAddressResolver res = resolver(reader());
        assertThat(res.jibunAddressFormatter().apply("1121510300100160026")).isEqualTo("서울특별시 광진구 구의동 16-26");
        assertThat(res.jibunAddressFormatter().apply("0000000000100010000")).isEmpty();
        assertThat(res.referenceVersion()).isEqualTo("2026-09");
    }

    // ---------- 필지 대표점 ----------

    @Test
    void 가짜_공급자는_사각형_중심을_대표점으로_면적은_변_길이로_근사한다() {
        FakePnuParcelProvider fake = new FakePnuParcelProvider("FAKE").addSquare("1114010300100310000", "31", 126.9782, 37.5666, 0.0002);
        Map<String, ParcelPoint> pts = fake.findPointsByPnus(List.of("1114010300100310000", "9999999999999999999"), true);
        assertThat(pts).containsOnlyKeys("1114010300100310000");
        ParcelPoint p = pts.get("1114010300100310000");
        assertThat(p.lon()).isEqualTo(126.9782);
        assertThat(p.lat()).isEqualTo(37.5666);
        assertThat(p.areaSqm()).isBetween(1000.0, 3000.0);   // 약 35m × 44m
        assertThat(fake.findPointsByPnus(List.of("1114010300100310000"), false).get("1114010300100310000").areaSqm()).isNull();
    }

    @Test
    void 대표점_SQL은_PNU_묶음과_시도_파티션_키로만_조회한다() {
        PostgisPnuParcelProvider p = new PostgisPnuParcelProvider(mock(JdbcOperations.class), new MyMapProperties.Ref());
        assertThat(p.pointSql(false)).contains("ST_PointOnSurface(g)").contains("sido = ANY(?::char(2)[])").contains("pnu = ANY(?::varchar[])")
                .contains("FROM ref.lsmd_cont_ldreg").doesNotContain("geography").doesNotContain("ST_AsGeoJSON");
        assertThat(p.pointSql(true)).contains("sum(ST_Area(g::geography))").contains("ST_PointOnSurface(g)");
    }

    @Test
    @SuppressWarnings("unchecked")
    void 대표점_조회는_500개씩_나눠_부르고_면적은_소수_한_자리() throws Exception {
        JdbcOperations jdbc = mock(JdbcOperations.class);
        int[] calls = {0};
        doAnswer(inv -> {
            calls[0]++;
            java.sql.PreparedStatement ps = mock(java.sql.PreparedStatement.class);
            java.sql.Connection con = mock(java.sql.Connection.class);
            when(ps.getConnection()).thenReturn(con);
            ((org.springframework.jdbc.core.PreparedStatementSetter) inv.getArgument(1)).setValues(ps);
            RowCallbackHandler h = inv.getArgument(2);
            java.sql.ResultSet rs = mock(java.sql.ResultSet.class);
            when(rs.getString("pnu")).thenReturn("1114010300100310000");
            when(rs.getDouble("lon")).thenReturn(126.97);
            when(rs.getDouble("lat")).thenReturn(37.56);
            when(rs.getDouble("a")).thenReturn(1234.5678);
            when(rs.wasNull()).thenReturn(false);
            h.processRow(rs);
            return null;
        }).when(jdbc).query(anyString(), any(org.springframework.jdbc.core.PreparedStatementSetter.class), any(RowCallbackHandler.class));
        PostgisPnuParcelProvider p = new PostgisPnuParcelProvider(jdbc, new MyMapProperties.Ref());
        java.util.List<String> pnus = new java.util.ArrayList<>();
        for (int i = 0; i < 1001; i++) pnus.add(String.format("11140103001%04d0000", i));
        Map<String, ParcelPoint> out = p.findPointsByPnus(pnus, true);
        assertThat(calls[0]).isEqualTo(3);   // 500 + 500 + 1
        assertThat(out.get("1114010300100310000").areaSqm()).isEqualTo(1234.6);
        assertThat(p.findPointsByPnus(Set.of("not-a-pnu", ""), true)).isEmpty();
        assertThat(calls[0]).as("PNU 모양이 아닌 값은 조회하지 않는다").isEqualTo(3);
    }
}
