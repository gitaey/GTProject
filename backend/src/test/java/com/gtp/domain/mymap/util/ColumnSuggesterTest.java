package com.gtp.domain.mymap.util;

import com.gtp.domain.mymap.dto.ExcelPreviewResponse.Suggestions;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ColumnSuggesterTest {

    static CellData s(String t) {
        return new CellData(t, t, false, null);
    }

    static CellData n(double v) {
        String t = v == Math.rint(v) ? Long.toString((long) v) : Double.toString(v);
        return new CellData(t, t, true, v);
    }

    static List<CellData> row(CellData... c) {
        return List.of(c);
    }

    @Test
    void PNU_문자열_컬럼을_추천한다() {
        List<List<CellData>> rows = List.of(
                row(s("1114010300100310000"), s("서울")), row(s("3611010300107180000"), s("세종")), row(s("2647010200110000000"), s("부산")));
        ColumnSuggester.Result r = ColumnSuggester.suggest(List.of("필지", "이름"), rows);
        assertThat(r.suggestions().getMode()).isEqualTo("PNU");
        assertThat(r.suggestions().getPnuColumn()).isEqualTo("필지");
        assertThat(r.numericPnuCells()).isFalse();
    }

    @Test
    void 숫자_서식_PNU는_추천하되_경고_표시() {
        List<List<CellData>> rows = List.of(row(n(1.11401030010031E18), s("a")), row(n(3.61101030010718E18), s("b")));
        ColumnSuggester.Result r = ColumnSuggester.suggest(List.of("PNU", "이름"), rows);
        assertThat(r.suggestions().getMode()).isEqualTo("PNU");
        assertThat(r.suggestions().getPnuColumn()).isEqualTo("PNU");
        assertThat(r.numericPnuCells()).isTrue();
    }

    @Test
    void 머리글이_PNU면_일부만_PNU_모양이어도_추천() {
        List<List<CellData>> rows = List.of(row(s("1114010300100310000")), row(s("오타")), row(s("잘못")), row(s("또오타")));
        assertThat(ColumnSuggester.suggest(List.of("pnu"), rows).suggestions().getMode()).isEqualTo("PNU");
        assertThat(ColumnSuggester.suggest(List.of("번호"), rows).suggestions().getMode()).isNull();
    }

    @Test
    void 위경도_컬럼은_값_범위로_가려_순서와_무관하다() {
        List<List<CellData>> rows = List.of(row(n(37.5663), n(126.9779), s("서울")), row(n(36.48), n(127.289), s("세종")));
        Suggestions s = ColumnSuggester.suggest(List.of("위도", "경도", "이름"), rows).suggestions();
        assertThat(s.getMode()).isEqualTo("COORD");
        assertThat(s.getLatColumn()).isEqualTo("위도");
        assertThat(s.getLonColumn()).isEqualTo("경도");
        assertThat(s.getSourceSrid()).isEqualTo("EPSG:4326");

        // 머리글이 불친절해도(순서 뒤집힘) 값 범위로 위도·경도를 가른다
        List<List<CellData>> swapped = List.of(row(n(126.9779), n(37.5663)), row(n(127.289), n(36.48)));
        Suggestions t = ColumnSuggester.suggest(List.of("A", "B"), swapped).suggestions();
        assertThat(t.getLonColumn()).isEqualTo("A");
        assertThat(t.getLatColumn()).isEqualTo("B");
    }

    @Test
    void 숫자_모양_문자열_좌표도_읽는다() {
        List<List<CellData>> rows = List.of(row(s("37.5663"), s("126.9779")), row(s("36.48"), s("127.289")));
        assertThat(ColumnSuggester.suggest(List.of("lat", "lon"), rows).suggestions().getMode()).isEqualTo("COORD");
    }

    @Test
    void TM_5186_X_Y를_머리글과_순서로_가른다() {
        List<List<CellData>> rows = List.of(row(n(198000), n(551000)), row(n(210000), n(560000)));
        Suggestions s = ColumnSuggester.suggest(List.of("X", "Y"), rows).suggestions();
        assertThat(s.getSourceSrid()).isEqualTo("EPSG:5186");
        assertThat(s.getLonColumn()).isEqualTo("X");
        assertThat(s.getLatColumn()).isEqualTo("Y");

        // Y가 먼저 와도 머리글 힌트가 우선
        List<List<CellData>> yFirst = List.of(row(n(551000), n(198000)), row(n(560000), n(210000)));
        Suggestions t = ColumnSuggester.suggest(List.of("Y좌표", "X좌표"), yFirst).suggestions();
        assertThat(t.getLonColumn()).isEqualTo("X좌표");
        assertThat(t.getLatColumn()).isEqualTo("Y좌표");
    }

    @Test
    void 한_글자_힌트_x_y는_머리글_전체가_그_글자일_때만() {
        // "year"·"max"에 x·y 글자가 들어 있어도 힌트가 아니다 → 열 순서(앞이 X)로 정한다
        List<List<CellData>> rows = List.of(row(n(198000), n(551000)), row(n(210000), n(560000)));
        Suggestions s = ColumnSuggester.suggest(List.of("year", "max"), rows).suggestions();
        assertThat(s.getLonColumn()).isEqualTo("year");
        assertThat(s.getLatColumn()).isEqualTo("max");
    }

    @Test
    void UTMK_5179와_웹메르카토르_3857을_구별한다() {
        List<List<CellData>> utmk = List.of(row(n(953000), n(1952000)), row(n(960000), n(1950000)));
        assertThat(ColumnSuggester.suggest(List.of("x", "y"), utmk).suggestions().getSourceSrid()).isEqualTo("EPSG:5179");
        List<List<CellData>> web = List.of(row(n(14135000), n(4518000)), row(n(14140000), n(4510000)));
        assertThat(ColumnSuggester.suggest(List.of("x", "y"), web).suggestions().getSourceSrid()).isEqualTo("EPSG:3857");
    }

    @Test
    void 숫자_서식_PNU_셀_판정은_행_하나만_봐도_된다() {
        assertThat(ColumnSuggester.hasNumericPnuCell(row(s("a"), n(1.11401030010031E18)))).isTrue();
        assertThat(ColumnSuggester.hasNumericPnuCell(row(s("1114010300100310000"), n(1100), n(37.5)))).isFalse();   // 문자열 PNU·작은 숫자
        assertThat(ColumnSuggester.hasNumericPnuCell(row(n(9.9e18)))).isTrue();
        assertThat(ColumnSuggester.hasNumericPnuCell(row(n(9.9e17)))).isFalse();   // 18자리 미만
        assertThat(ColumnSuggester.hasNumericPnuCell(row(n(1.1e19)))).isFalse();   // 20자리 이상
        assertThat(ColumnSuggester.hasNumericPnuCell(List.of())).isFalse();
    }

    @Test
    void 경도가_범위_밖이면_좌표로_추천하지_않는다() {
        List<List<CellData>> rows = List.of(row(n(37.5), n(150.0)), row(n(36.4), n(151.0)));   // 경도가 한국 범위(123~133) 밖
        assertThat(ColumnSuggester.suggest(List.of("위도", "경도"), rows).suggestions().getMode()).isNull();
    }

    @Test
    void 숫자가_아닌_값이_10퍼센트를_넘는_열은_좌표_열로_보지_않는다() {
        List<List<CellData>> rows = new java.util.ArrayList<>();
        for (int i = 0; i < 10; i++) rows.add(row(i < 8 ? n(37.5 + i * 0.01) : s("-"), n(127.0 + i * 0.01)));   // 위도 열 20%가 글자
        assertThat(ColumnSuggester.suggest(List.of("위도", "경도"), rows).suggestions().getMode()).isNull();
        // 글자가 10% 이하면(10개 중 1개) 좌표 열로 본다
        List<List<CellData>> few = new java.util.ArrayList<>();
        for (int i = 0; i < 10; i++) few.add(row(i < 9 ? n(37.5 + i * 0.01) : s("-"), n(127.0 + i * 0.01)));
        assertThat(ColumnSuggester.suggest(List.of("위도", "경도"), few).suggestions().getMode()).isEqualTo("COORD");
    }

    @Test
    void 직원수_연도_같은_작은_숫자_열은_좌표로_오인하지_않는다() {
        List<List<CellData>> rows = List.of(row(n(1100), n(2012), s("서울")), row(n(900), n(2013), s("세종")), row(n(1500), n(1998), s("부산")));
        Suggestions s = ColumnSuggester.suggest(List.of("직원수", "준공연도", "이름"), rows).suggestions();
        assertThat(s.getMode()).isNull();
    }

    @Test
    void PNU와_좌표가_함께_있으면_PNU가_이긴다() {
        List<List<CellData>> rows = List.of(row(s("1114010300100310000"), n(37.5663), n(126.9779)));
        assertThat(ColumnSuggester.suggest(List.of("PNU", "위도", "경도"), rows).suggestions().getMode()).isEqualTo("PNU");
    }

    @Test
    void 주소는_1단계에서_추천하지_않는다() {
        List<List<CellData>> rows = List.of(row(s("서울특별시 중구 세종대로 110")), row(s("세종특별자치시 한누리대로 2130")));
        Suggestions s = ColumnSuggester.suggest(List.of("주소"), rows).suggestions();
        assertThat(s.getMode()).isNull();
        assertThat(s.getAddressColumn()).isNull();
    }

    @Test
    void 행이_없어도_죽지_않는다() {
        assertThat(ColumnSuggester.suggest(List.of("a", "b"), new ArrayList<>()).suggestions().getMode()).isNull();
    }
}
