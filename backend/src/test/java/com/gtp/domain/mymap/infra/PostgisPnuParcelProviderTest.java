package com.gtp.domain.mymap.infra;

import com.gtp.domain.mymap.config.MyMapProperties;
import com.gtp.domain.mymap.port.Coverage;
import com.gtp.domain.mymap.port.ParcelShape;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.PreparedStatementSetter;
import org.springframework.jdbc.core.RowCallbackHandler;

import java.sql.Array;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/** DB 없이: 만들어지는 SQL·500개 묶음·시도 가지치기 인자·다중 폴리곤 처리·적재 기록 읽기를 확인한다. */
class PostgisPnuParcelProviderTest {

    /** 한 번의 jdbc.query 호출 기록 */
    record Call(String sql, List<String> sidos, List<String> pnus) {
    }

    static String pnu(int sido, int n) {
        return String.format("%02d010300101%04d0000", sido, n); // 19자리: 시도2 + 법정동 나머지 8 + 대지구분 1 + 본번4 + 부번4
    }

    @Test
    void 기본_설정의_SQL_모양() {
        PostgisPnuParcelProvider p = new PostgisPnuParcelProvider(mock(JdbcOperations.class), new MyMapProperties.Ref());
        assertThat(p.selectSql())
                .contains("FROM ref.parcel")
                .contains("sido = ANY(?::char(2)[])")
                .contains("pnu = ANY(?::varchar[])")
                .contains("ST_AsGeoJSON(geom, 7)")
                .doesNotContain("ST_Transform")
                .doesNotContain("GROUP BY");
        assertThat(p.unionSql()).contains("ST_Union(geom)").contains("GROUP BY pnu");
    }

    @Test
    void 표와_컬럼_이름은_설정을_따른다() {
        MyMapProperties.Ref ref = new MyMapProperties.Ref();
        ref.getParcel().setTable("cadastre.lots");
        ref.getParcel().setPnuColumn("pnu_cd");
        ref.getParcel().setJibunColumn("lot_no");
        ref.getParcel().setSidoColumn("sido_cd");
        ref.getParcel().setGeomColumn("the_geom");
        PostgisPnuParcelProvider p = new PostgisPnuParcelProvider(mock(JdbcOperations.class), ref);
        assertThat(p.selectSql()).contains("FROM cadastre.lots").contains("pnu_cd = ANY").contains("sido_cd = ANY")
                .contains("lot_no AS jibun").contains("ST_AsGeoJSON(the_geom, 7)");
    }

    @Test
    void 저장_좌표계가_4326이_아니면_변환한다() {
        MyMapProperties.Ref ref = new MyMapProperties.Ref();
        ref.getParcel().setSrid(5186);
        PostgisPnuParcelProvider p = new PostgisPnuParcelProvider(mock(JdbcOperations.class), ref);
        assertThat(p.selectSql()).contains("ST_AsGeoJSON(ST_Transform(geom, 4326), 7)");
        assertThat(p.unionSql()).contains("ST_Union(ST_Transform(geom, 4326))");
    }

    @Test
    void 식별자_모양이_아닌_설정은_거절한다() {
        MyMapProperties.Ref ref = new MyMapProperties.Ref();
        ref.getParcel().setTable("ref.parcel; DROP TABLE x");
        assertThatThrownBy(() -> new PostgisPnuParcelProvider(mock(JdbcOperations.class), ref)).isInstanceOf(IllegalArgumentException.class);

        MyMapProperties.Ref ref2 = new MyMapProperties.Ref();
        ref2.getParcel().setPnuColumn("pnu) OR (1=1");
        assertThatThrownBy(() -> new PostgisPnuParcelProvider(mock(JdbcOperations.class), ref2)).isInstanceOf(IllegalArgumentException.class);

        MyMapProperties.Ref ref3 = new MyMapProperties.Ref();
        ref3.setLoadMetaTable("ref.load_meta; --");
        assertThatThrownBy(() -> new PostgisPnuParcelProvider(mock(JdbcOperations.class), ref3)).isInstanceOf(IllegalArgumentException.class);
    }

    /** jdbc.query(sql, setter, handler)를 가로채 호출 기록을 남기고, rowsFor가 주는 행을 handler에 먹인다. */
    private static JdbcOperations fakeJdbc(List<Call> calls, java.util.function.Function<Call, List<String[]>> rowsFor) throws Exception {
        JdbcOperations jdbc = mock(JdbcOperations.class);
        doAnswer(inv -> {
            String sql = inv.getArgument(0);
            PreparedStatementSetter setter = inv.getArgument(1);
            RowCallbackHandler handler = inv.getArgument(2);

            PreparedStatement ps = mock(PreparedStatement.class);
            Connection con = mock(Connection.class);
            when(ps.getConnection()).thenReturn(con);
            List<String[]> arrays = new ArrayList<>();
            when(con.createArrayOf(eq("varchar"), any())).thenAnswer(a -> {
                arrays.add((String[]) a.getArgument(1));
                return mock(Array.class);
            });
            setter.setValues(ps);
            verify(ps).setArray(eq(1), any());
            verify(ps).setArray(eq(2), any());
            Call call = new Call(sql, List.of(arrays.get(0)), List.of(arrays.get(1)));
            calls.add(call);
            for (String[] r : rowsFor.apply(call)) {
                ResultSet rs = mock(ResultSet.class);
                when(rs.getString("pnu")).thenReturn(r[0]);
                when(rs.getString("jibun")).thenReturn(r[1]);
                when(rs.getString("geojson")).thenReturn(r[2]);
                handler.processRow(rs);
            }
            return null;
        }).when(jdbc).query(anyString(), any(PreparedStatementSetter.class), any(RowCallbackHandler.class));
        return jdbc;
    }

    @Test
    void 열두백_개는_500개씩_세_번_조회하고_시도_목록을_함께_넘긴다() throws Exception {
        List<Call> calls = new ArrayList<>();
        JdbcOperations jdbc = fakeJdbc(calls, c -> c.pnus().stream().map(p -> new String[]{p, "j", "{\"type\":\"Polygon\"}"}).toList());
        PostgisPnuParcelProvider p = new PostgisPnuParcelProvider(jdbc, new MyMapProperties.Ref());

        List<String> pnus = new ArrayList<>();
        for (int i = 0; i < 1200; i++) pnus.add(pnu(i < 700 ? 11 : 36, i));
        pnus.add(pnus.get(0));      // 중복
        pnus.add("12345");          // 19자리가 아님 — 무시
        pnus.add(null);
        Map<String, ParcelShape> out = p.findByPnus(pnus);

        assertThat(out).hasSize(1200);
        assertThat(calls).hasSize(3);
        assertThat(calls.stream().map(c -> c.pnus().size()).toList()).containsExactly(500, 500, 200);
        // PNU를 정렬해 묶으므로 11·36이 섞인 묶음도 시도 목록에 두 코드가 다 들어간다(가지치기용)
        assertThat(calls.get(0).sidos()).containsExactly("11");
        assertThat(calls.get(1).sidos()).containsExactlyInAnyOrder("11", "36");
        assertThat(calls.get(2).sidos()).containsExactly("36");
        assertThat(calls).allSatisfy(c -> assertThat(c.sql()).isEqualTo(p.selectSql()));
    }

    @Test
    void 못_찾은_PNU는_결과에_없다() throws Exception {
        List<Call> calls = new ArrayList<>();
        String found = pnu(11, 1), missing = pnu(11, 2);
        JdbcOperations jdbc = fakeJdbc(calls, c -> Collections.singletonList(new String[]{found, "1대", "{\"type\":\"Polygon\"}"}));
        Map<String, ParcelShape> out = new PostgisPnuParcelProvider(jdbc, new MyMapProperties.Ref()).findByPnus(List.of(found, missing));
        assertThat(out).containsOnlyKeys(found);
        assertThat(out.get(found).jibun()).isEqualTo("1대");
    }

    @Test
    void 같은_PNU_다중_폴리곤은_ST_Union_질의로_합친_모양을_쓴다() throws Exception {
        List<Call> calls = new ArrayList<>();
        String multi = pnu(11, 1), single = pnu(11, 2);
        PostgisPnuParcelProvider[] holder = new PostgisPnuParcelProvider[1];
        JdbcOperations jdbc = fakeJdbc(calls, c -> {
            if (c.sql().contains("GROUP BY")) return List.<String[]>of(new String[]{multi, "1대", "{\"type\":\"MultiPolygon\",\"u\":1}"});
            return List.<String[]>of(
                    new String[]{multi, "1대", "{\"type\":\"Polygon\",\"a\":1}"},
                    new String[]{multi, "1대", "{\"type\":\"Polygon\",\"a\":2}"},
                    new String[]{single, "2대", "{\"type\":\"Polygon\",\"s\":1}"});
        });
        holder[0] = new PostgisPnuParcelProvider(jdbc, new MyMapProperties.Ref());
        Map<String, ParcelShape> out = holder[0].findByPnus(List.of(multi, single));

        assertThat(calls).hasSize(2);
        assertThat(calls.get(1).sql()).isEqualTo(holder[0].unionSql());
        assertThat(calls.get(1).pnus()).containsExactly(multi);          // 중복된 PNU만 다시 묻는다
        assertThat(out.get(multi).geometryJson()).contains("MultiPolygon").contains("\"u\":1");
        assertThat(out.get(single).geometryJson()).contains("\"s\":1");  // 보통 PNU는 저장된 모양 그대로
    }

    @Test
    void 합치기가_실패하면_첫_폴리곤을_쓴다() throws Exception {
        String multi = pnu(11, 1);
        List<Call> calls = new ArrayList<>();
        JdbcOperations inner = fakeJdbc(calls, c -> List.of(
                new String[]{multi, "1대", "{\"type\":\"Polygon\",\"a\":1}"}, new String[]{multi, "1대", "{\"type\":\"Polygon\",\"a\":2}"}));
        PostgisPnuParcelProvider p = new PostgisPnuParcelProvider(inner, new MyMapProperties.Ref());
        doThrow(new DataRetrievalFailureException("topology")).when(inner)
                .query(eq(p.unionSql()), any(PreparedStatementSetter.class), any(RowCallbackHandler.class));
        Map<String, ParcelShape> out = p.findByPnus(List.of(multi));
        assertThat(out.get(multi).geometryJson()).contains("\"a\":1");
    }

    @Test
    void 적재_기록에서_시도별_기준월과_교체중_표시를_읽는다() {
        JdbcOperations jdbc = mock(JdbcOperations.class);
        PostgisPnuParcelProvider p = new PostgisPnuParcelProvider(jdbc, new MyMapProperties.Ref());
        doAnswer(inv -> {
            assertThat((String) inv.getArgument(0)).contains("FROM ref.load_meta").contains("dataset = 'parcel'");
            RowCallbackHandler h = inv.getArgument(1);
            for (String[] r : new String[][]{{"36", "2026-10", "READY"}, {"11 ", "2026-09", "SWAPPING"}, {"41", "2026-10", "READY"}}) {
                ResultSet rs = mock(ResultSet.class);
                when(rs.getString("sido")).thenReturn(r[0]);
                when(rs.getString("version")).thenReturn(r[1]);
                when(rs.getString("status")).thenReturn(r[2]);
                h.processRow(rs);
            }
            return null;
        }).when(jdbc).query(anyString(), any(RowCallbackHandler.class));

        Coverage c = p.coverage();
        assertThat(c.available()).isTrue();
        assertThat(c.isLoaded("36")).isTrue();
        assertThat(c.isLoaded("11")).isTrue();            // char(2) 뒤 공백을 떼고 읽는다
        assertThat(c.isSwapping("11")).isTrue();
        assertThat(c.isSwapping("36")).isFalse();
        assertThat(c.parcelVersion()).isEqualTo("2026-09"); // 가장 이른 기준월
    }

    @Test
    void 적재_기록을_못_읽으면_unavailable() {
        JdbcOperations jdbc = mock(JdbcOperations.class);
        doThrow(new DataRetrievalFailureException("no table")).when(jdbc).query(anyString(), any(RowCallbackHandler.class));
        Coverage c = new PostgisPnuParcelProvider(jdbc, new MyMapProperties.Ref()).coverage();
        assertThat(c.available()).isFalse();
        assertThat(c.parcelVersion()).isNull();
    }

    @Test
    void Coverage_기준월은_매칭에_쓰인_시도_중_가장_이른_달() {
        Coverage c = new Coverage(Map.of("36", "2026-10", "11", "2026-08", "41", "2026-09"), Set.of());
        assertThat(c.versionFor(List.of("36", "41"))).isEqualTo("2026-09");
        assertThat(c.versionFor(List.of("36"))).isEqualTo("2026-10");
        assertThat(c.versionFor(List.of("99"))).isNull();           // 적재 안 된 시도
        assertThat(c.versionFor(List.of("99", "36"))).isEqualTo("2026-10");
        assertThat(c.parcelVersion()).isEqualTo("2026-08");
    }
}
