package com.gtp.domain.mymap.infra;

import com.gtp.domain.mymap.infra.AddressRefReader.LegalDong;
import com.gtp.domain.mymap.infra.AddressRefReader.StandardParts;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** 표준 도로명주소·지번주소 조립: 「도로명주소 활용 가이드(건물DB)」 붙임 2 표기 규칙 예시를 고정한다. */
class StandardAddressFormatterTest {

    /** 건물 하나: emdGb 0 읍면·1 동 */
    private static StandardParts p(String sido, String sigungu, String emd, String li, String road, String udgd, int main, int sub,
                                   boolean apt, String name, String emdGb) {
        return new StandardParts(sido, sigungu, emd, li, road, udgd, main, sub, apt, name, emdGb);
    }

    @Test
    void 동_비공동은_법정동만_참고항목() {
        assertThat(StandardAddressFormatter.road(p("서울특별시", "광진구", "구의동", "", "영화사로", "0", 87, 0, false, "", "1")))
                .isEqualTo("서울특별시 광진구 영화사로 87 (구의동)");
    }

    @Test
    void 동_공동주택은_법정동_건물명() {
        assertThat(StandardAddressFormatter.road(p("서울특별시", "광진구", "구의동", "", "영화사로", "0", 87, 1, true, "주택", "1")))
                .isEqualTo("서울특별시 광진구 영화사로 87-1 (구의동, 주택)");
    }

    @Test
    void 읍면_법정리가_있으면_읍면을_도로명_앞에_쓰고_참고항목은_없다() {
        assertThat(StandardAddressFormatter.road(p("전라북도", "정읍시", "소성면", "소성리", "소성로", "0", 10, 0, false, "", "0")))
                .isEqualTo("전라북도 정읍시 소성면 소성로 10");
    }

    @Test
    void 읍면_공동주택은_건물명만_참고항목() {
        assertThat(StandardAddressFormatter.road(p("전라북도", "정읍시", "소성면", "소성리", "소성로", "0", 10, 0, true, "소성아파트", "0")))
                .isEqualTo("전라북도 정읍시 소성면 소성로 10 (소성아파트)");
    }

    @Test
    void 읍면_공동주택인데_건물명이_없으면_참고항목이_없다() {
        assertThat(StandardAddressFormatter.road(p("전라북도", "정읍시", "소성면", "소성리", "소성로", "0", 10, 0, true, "", "0")))
                .isEqualTo("전라북도 정읍시 소성면 소성로 10");
    }

    @Test
    void 동_공동주택인데_건물명이_없으면_법정동만() {
        assertThat(StandardAddressFormatter.road(p("서울특별시", "광진구", "구의동", "", "영화사로", "0", 87, 0, true, "", "1")))
                .isEqualTo("서울특별시 광진구 영화사로 87 (구의동)");
    }

    @Test
    void 비공동주택의_건물명은_참고항목에_넣지_않는다() {
        assertThat(StandardAddressFormatter.road(p("서울특별시", "광진구", "구의동", "", "영화사로", "0", 87, 0, false, "삼성빌딩", "1")))
                .isEqualTo("서울특별시 광진구 영화사로 87 (구의동)");
    }

    @Test
    void 지하는_건물본번_앞에_붙여_쓴다() {
        assertThat(StandardAddressFormatter.road(p("서울특별시", "동대문구", "전농동", "", "왕산로", "1", 205, 0, false, "", "1")))
                .isEqualTo("서울특별시 동대문구 왕산로 지하205 (전농동)");
    }

    @Test
    void 공중과_수상_표기() {
        assertThat(StandardAddressFormatter.road(p("서울특별시", "종로구", "청운동", "", "자하문로", "2", 3, 0, false, "", "1")))
                .isEqualTo("서울특별시 종로구 자하문로 공중3 (청운동)");
        assertThat(StandardAddressFormatter.road(p("서울특별시", "종로구", "청운동", "", "자하문로", "3", 3, 4, false, "", "1")))
                .isEqualTo("서울특별시 종로구 자하문로 수상3-4 (청운동)");
    }

    @Test
    void 부번이_0이면_생략하고_있으면_하이픈() {
        assertThat(StandardAddressFormatter.road(p("서울특별시", "중구", "태평로1가", "", "세종대로", "0", 110, 0, false, "", "1")))
                .isEqualTo("서울특별시 중구 세종대로 110 (태평로1가)");
        assertThat(StandardAddressFormatter.road(p("서울특별시", "중구", "태평로1가", "", "세종대로", "0", 110, 2, false, "", "1")))
                .isEqualTo("서울특별시 중구 세종대로 110-2 (태평로1가)");
    }

    @Test
    void 시군구가_없는_세종은_생략하고_공백은_하나() {
        assertThat(StandardAddressFormatter.road(p("세종특별자치시", "", "보람동", "", "한누리대로", "0", 2130, 0, false, "", "1")))
                .isEqualTo("세종특별자치시 한누리대로 2130 (보람동)");
        assertThat(StandardAddressFormatter.road(p("세종특별자치시", null, " 보람동 ", "", "한누리  대로", "0", 2130, 0, false, "", "1")))
                .isEqualTo("세종특별자치시 한누리 대로 2130 (보람동)");
    }

    @Test
    void 읍면동구분을_모르면_이름_끝글자로_가린다() {
        // 미부여(2)·빈 값 — 읍·면으로 끝나면 읍면, 아니면 동으로 본다
        assertThat(StandardAddressFormatter.road(p("서울특별시", "종로구", "세종로", "", "세종대로", "0", 209, 0, false, "", "2")))
                .isEqualTo("서울특별시 종로구 세종대로 209 (세종로)");
        assertThat(StandardAddressFormatter.road(p("경기도", "화성시", "봉담읍", "와우리", "봉담로", "0", 5, 0, false, "", "")))
                .isEqualTo("경기도 화성시 봉담읍 봉담로 5");
    }

    @Test
    void 지번주소_조립() {
        LegalDong l = new LegalDong("1114010300", "서울특별시", "중구", "태평로1가", "");
        assertThat(StandardAddressFormatter.jibun(l, false, 31, 0)).isEqualTo("서울특별시 중구 태평로1가 31");
        assertThat(StandardAddressFormatter.jibun(l, true, 12, 3)).isEqualTo("서울특별시 중구 태평로1가 산 12-3");
        LegalDong ri = new LegalDong("4518025034", "전북특별자치도", "정읍시", "소성면", "소성리");
        assertThat(StandardAddressFormatter.jibun(ri, false, 123, 4)).isEqualTo("전북특별자치도 정읍시 소성면 소성리 123-4");
        LegalDong sejong = new LegalDong("3611010300", "세종특별자치시", "", "보람동", "");
        assertThat(StandardAddressFormatter.jibun(sejong, false, 718, 0)).isEqualTo("세종특별자치시 보람동 718");
    }

    @Test
    void PNU에서_지번주소() {
        Map<String, LegalDong> dict = Map.of("1114010300", new LegalDong("1114010300", "서울특별시", "중구", "태평로1가", ""));
        assertThat(StandardAddressFormatter.jibunOfPnu("1114010300100310000", dict::get)).isEqualTo("서울특별시 중구 태평로1가 31");
        assertThat(StandardAddressFormatter.jibunOfPnu("1114010300200120003", dict::get)).isEqualTo("서울특별시 중구 태평로1가 산 12-3");
        assertThat(StandardAddressFormatter.jibunOfPnu("9999999999100010000", dict::get)).isEmpty();   // 사전에 없는 법정동
        assertThat(StandardAddressFormatter.jibunOfPnu("123", dict::get)).isEmpty();
        assertThat(StandardAddressFormatter.jibunOfPnu(null, dict::get)).isEmpty();
    }
}
