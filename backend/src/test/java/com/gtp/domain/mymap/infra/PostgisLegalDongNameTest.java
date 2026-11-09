package com.gtp.domain.mymap.infra;

import com.gtp.domain.mymap.config.MyMapProperties;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.PreparedStatementSetter;
import org.springframework.jdbc.core.RowCallbackHandler;

import java.sql.Array;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** 지적도 법정동 이름 보조 조회(U26c) — SQL 모양·500개 묶음·시도 가지치기 인자·빈 이름 제외·열 이름 설정. DB 없이 확인한다. */
class PostgisLegalDongNameTest {

    record Call(String sql, List<String> sidos, List<String> pnus) {
    }

    static String pnu(int sido, int n) {
        return String.format("%02d010300101%04d0000", sido, n);
    }

    private static JdbcOperations fakeJdbc(List<Call> calls, java.util.function.Function<Call, List<String[]>> rowsFor) {
        JdbcOperations jdbc = mock(JdbcOperations.class);
        doAnswer(inv -> {
            PreparedStatement ps = mock(PreparedStatement.class);
            Connection con = mock(Connection.class);
            when(ps.getConnection()).thenReturn(con);
            List<String[]> arrays = new ArrayList<>();
            when(con.createArrayOf(eq("varchar"), any())).thenAnswer(a -> {
                arrays.add((String[]) a.getArgument(1));
                return mock(Array.class);
            });
            ((PreparedStatementSetter) inv.getArgument(1)).setValues(ps);
            Call call = new Call(inv.getArgument(0), List.of(arrays.get(0)), List.of(arrays.get(1)));
            calls.add(call);
            for (String[] r : rowsFor.apply(call)) {
                ResultSet rs = mock(ResultSet.class);
                when(rs.getString("pnu")).thenReturn(r[0]);
                when(rs.getString("bjd_name")).thenReturn(r[1]);
                ((RowCallbackHandler) inv.getArgument(2)).processRow(rs);
            }
            return null;
        }).when(jdbc).query(anyString(), any(PreparedStatementSetter.class), any(RowCallbackHandler.class));
        return jdbc;
    }

    @Test
    void SQL_모양은_시도_파티션_키와_PNU_배열만_쓰고_모양_열은_읽지_않는다() {
        PostgisPnuParcelProvider p = new PostgisPnuParcelProvider(mock(JdbcOperations.class), new MyMapProperties.Ref());
        assertThat(p.legalDongNameSql()).isEqualTo("SELECT pnu AS pnu, min(bjd_name) AS bjd_name FROM ref.lsmd_cont_ldreg "
                + "WHERE sido = ANY(?::char(2)[]) AND pnu = ANY(?::varchar[]) GROUP BY pnu");
        assertThat(p.legalDongNameSql()).doesNotContain("geom").doesNotContain("ST_");
    }

    @Test
    void 열_이름은_설정을_따르고_식별자_모양만_허용한다() {
        MyMapProperties.Ref ref = new MyMapProperties.Ref();
        ref.getParcel().setBjdNameColumn("bjd_nm");
        assertThat(new PostgisPnuParcelProvider(mock(JdbcOperations.class), ref).legalDongNameSql()).contains("min(bjd_nm) AS bjd_name");
        MyMapProperties.Ref evil = new MyMapProperties.Ref();
        evil.getParcel().setBjdNameColumn("bjd_name) FROM x; --");
        assertThatThrownBy(() -> new PostgisPnuParcelProvider(mock(JdbcOperations.class), evil)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 이름이_있는_PNU만_돌려주고_형식이_틀린_값은_조회하지_않는다() {
        List<Call> calls = new ArrayList<>();
        String a = pnu(36, 1), b = pnu(36, 2), c = pnu(36, 3);
        JdbcOperations jdbc = fakeJdbc(calls, call -> List.of(new String[]{a, "세종특별자치시  금남면"}, new String[]{b, "   "},
                new String[]{c, null}));
        Map<String, String> out = new PostgisPnuParcelProvider(jdbc, new MyMapProperties.Ref())
                .legalDongNamesByPnus(List.of(a, b, c, "bad", "123"));
        assertThat(out).containsOnlyKeys(a);
        assertThat(out.get(a)).isEqualTo("세종특별자치시  금남면");          // 공백 정리는 호출한 쪽이 한다
        assertThat(calls).hasSize(1);
        assertThat(calls.get(0).pnus()).containsExactlyInAnyOrder(a, b, c);
        assertThat(calls.get(0).sidos()).containsExactly("36");
    }

    @Test
    void 열두백_개는_500개씩_세_번_조회하고_빈_입력은_조회하지_않는다() {
        List<Call> calls = new ArrayList<>();
        JdbcOperations jdbc = fakeJdbc(calls, call -> List.of());
        PostgisPnuParcelProvider p = new PostgisPnuParcelProvider(jdbc, new MyMapProperties.Ref());
        List<String> pnus = new ArrayList<>();
        for (int i = 1; i <= 1200; i++) pnus.add(pnu(i % 2 == 0 ? 11 : 36, i));
        assertThat(p.legalDongNamesByPnus(pnus)).isEmpty();
        assertThat(calls).extracting(c -> c.pnus().size()).containsExactly(500, 500, 200);
        // PNU는 정렬해서 자르므로 시도 목록은 묶음 안에 든 것만(앞 묶음은 11뿐, 가운데는 둘, 끝은 36뿐)
        assertThat(calls.get(0).sidos()).containsExactly("11");
        assertThat(calls.get(1).sidos()).containsExactlyInAnyOrder("11", "36");
        assertThat(calls.get(2).sidos()).containsExactly("36");

        calls.clear();
        assertThat(p.legalDongNamesByPnus(List.of())).isEmpty();
        assertThat(calls).isEmpty();
    }

    @Test
    void 포트_기본_구현은_빈_결과() {
        assertThat(new FakePnuParcelProvider("FAKE").legalDongNamesByPnus(List.of(pnu(36, 1)))).isEmpty();
    }
}
