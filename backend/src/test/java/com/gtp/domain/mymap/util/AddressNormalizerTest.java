package com.gtp.domain.mymap.util;

import com.gtp.domain.mymap.model.ImportFailureReason;
import com.gtp.domain.mymap.util.AddressNormalizer.Kind;
import com.gtp.domain.mymap.util.AddressNormalizer.Parsed;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** 주소 정규화·분류 규칙(순수 함수)을 표로 고정한다. 주소는 공공청사·가상의 이름만 쓴다. */
class AddressNormalizerTest {

    private static Parsed road(String raw, String sido, List<String> places, String name, boolean underground, int main, int sub) {
        Parsed p = AddressNormalizer.parse(raw);
        assertThat(p.kind()).as(raw).isEqualTo(Kind.ROAD);
        assertThat(p.sido()).as(raw + " sido").isEqualTo(sido);
        assertThat(p.places()).as(raw + " places").isEqualTo(places);
        assertThat(p.name()).as(raw + " name").isEqualTo(name);
        assertThat(p.underground()).as(raw + " 지하").isEqualTo(underground);
        assertThat(p.main()).as(raw + " 본번").isEqualTo(main);
        assertThat(p.sub()).as(raw + " 부번").isEqualTo(sub);
        return p;
    }

    private static Parsed jibun(String raw, String sido, List<String> places, String name, boolean mountain, int main, int sub) {
        Parsed p = AddressNormalizer.parse(raw);
        assertThat(p.kind()).as(raw).isEqualTo(Kind.JIBUN);
        assertThat(p.sido()).as(raw + " sido").isEqualTo(sido);
        assertThat(p.places()).as(raw + " places").isEqualTo(places);
        assertThat(p.name()).as(raw + " name").isEqualTo(name);
        assertThat(p.mountain()).as(raw + " 산").isEqualTo(mountain);
        assertThat(p.main()).as(raw + " 본번").isEqualTo(main);
        assertThat(p.sub()).as(raw + " 부번").isEqualTo(sub);
        return p;
    }

    private static void fails(String raw, ImportFailureReason reason) {
        Parsed p = AddressNormalizer.parse(raw);
        assertThat(p.kind()).as(raw).isEqualTo(Kind.FAILED);
        assertThat(p.failure()).as(raw).isEqualTo(reason);
    }

    // ---------- 도로명 ----------

    @Test
    void 도로명_기본형과_괄호_상세주소_제거() {
        road("서울특별시 중구 세종대로 110", "서울특별시", List.of("중구"), "세종대로", false, 110, 0);
        road("서울  중구   세종대로 110 (태평로1가)", "서울", List.of("중구"), "세종대로", false, 110, 0);
        road("서울특별시 강남구 테헤란로 152 강남파이낸스센터 12층 1203호", "서울특별시", List.of("강남구"), "테헤란로", false, 152, 0);
        road("세종특별자치시 한누리대로 2130, 3층", "세종특별자치시", List.of(), "한누리대로", false, 2130, 0);
    }

    @Test
    void 건물부번_지하_붙여쓴_번호() {
        road("서울 중구 세종대로 110-2", "서울", List.of("중구"), "세종대로", false, 110, 2);
        road("서울 중구 세종대로 110 - 2", "서울", List.of("중구"), "세종대로", false, 110, 2);
        road("서울 중구 세종대로 지하 110", "서울", List.of("중구"), "세종대로", true, 110, 0);
        road("서울 중구 세종대로 지하110", "서울", List.of("중구"), "세종대로", true, 110, 0);
        road("서울 중구 세종대로110", "서울", List.of("중구"), "세종대로", false, 110, 0);
        road("서울 중구 세종대로 110 지하 1층", "서울", List.of("중구"), "세종대로", false, 110, 0);   // 번호 뒤는 전부 버린다
    }

    @Test
    void 번길과_도로명에_붙는_숫자는_이름의_일부() {
        road("경기도 수원시 장안구 중앙로 12번길 3", "경기도", List.of("수원시", "장안구"), "중앙로12번길", false, 3, 0);
        road("경기도 수원시 장안구 중앙로12번길 3-1", "경기도", List.of("수원시", "장안구"), "중앙로12번길", false, 3, 1);
        road("서울 강남구 테헤란로 8길 21", "서울", List.of("강남구"), "테헤란로8길", false, 21, 0);
        road("대전 중구 보수대로 289 번길 5", "대전", List.of("중구"), "보수대로", false, 289, 0);   // "289"가 번호 — 떨어진 "번길"은 앞 숫자에 붙지 않는다
    }

    @Test
    void 도로명에_읍면동_토큰이_끼어도_places에_남는다_시도_없음도_허용() {
        road("충남 천안시 동남구 목천읍 삼방로 123", "충남", List.of("천안시", "동남구", "목천읍"), "삼방로", false, 123, 0);
        road("세종대로 110", null, List.of(), "세종대로", false, 110, 0);
    }

    @Test
    void 번지호_표기와_전각과_앞_우편번호() {
        road("04524 서울특별시 중구 세종대로 110", "서울특별시", List.of("중구"), "세종대로", false, 110, 0);
        road("서울특별시　중구　세종대로　１１０", "서울특별시", List.of("중구"), "세종대로", false, 110, 0);
    }

    // ---------- 지번 ----------

    @Test
    void 지번_기본형_가_표기_번지() {
        jibun("대구광역시 중구 동인동1가 2-1", "대구광역시", List.of("중구"), "동인동1가", false, 2, 1);
        jibun("대구광역시 중구 동인동 1가 2-1", "대구광역시", List.of("중구"), "동인동1가", false, 2, 1);
        jibun("서울특별시 중구 태평로1가 31번지", "서울특별시", List.of("중구"), "태평로1가", false, 31, 0);
        jibun("서울 중구 태평로 1가 31", "서울", List.of("중구"), "태평로1가", false, 31, 0);
        jibun("서울 강남구 역삼동 123번지 4호", "서울", List.of("강남구"), "역삼동", false, 123, 4);
        jibun("서울 강남구 역삼동 123 - 4 (역삼빌딩)", "서울", List.of("강남구"), "역삼동", false, 123, 4);
        jibun("세종특별자치시 보람동 718", "세종특별자치시", List.of(), "보람동", false, 718, 0);
    }

    @Test
    void 산_번지와_리() {
        jibun("세종특별자치시 연서면 월하리 산 12-3", "세종특별자치시", List.of("연서면"), "월하리", true, 12, 3);
        jibun("세종특별자치시 연서면 월하리 산12-3", "세종특별자치시", List.of("연서면"), "월하리", true, 12, 3);
        jibun("충남 서산시 대산읍 대죽리 5", "충남", List.of("서산시", "대산읍"), "대죽리", false, 5, 0);
    }

    @Test
    void 로로_끝나는_법정동은_도로명으로_분류되고_해석기가_지번으로_다시_본다() {
        Parsed p = road("서울 종로구 세종로 1", "서울", List.of("종로구"), "세종로", false, 1, 0);
        assertThat(p.normalized()).isEqualTo("서울 종로구 세종로 1");
    }

    @Test
    void 광주는_다음_토큰이_구일_때만_시도다() {
        jibun("광주 광산구 우산동 1", "광주", List.of("광산구"), "우산동", false, 1, 0);
        Parsed p = jibun("광주 경안동 12", null, List.of("광주"), "경안동", false, 12, 0);   // 경기도 광주시일 수 있다
        assertThat(p.sidoUnknown()).isFalse();
    }

    @Test
    void 모르는_시도처럼_생긴_첫_토큰() {
        Parsed p = AddressNormalizer.parse("경상도 어딘가동 1");
        assertThat(p.kind()).isEqualTo(Kind.JIBUN);
        assertThat(p.sidoUnknown()).isTrue();
        assertThat(p.sido()).isNull();
        assertThat(AddressNormalizer.parse("서울광역시 중구 소공동 1").sidoUnknown()).isTrue();
        assertThat(AddressNormalizer.parse("송도 12동 5").sidoUnknown()).isFalse();
    }

    @Test
    void 번지_뒤_부번은_합치고_번호_뒤_숫자만_남은_꼬리는_실패() {
        jibun("경남 창원 의창구 동읍 용잠리 422번지 5", "경남", List.of("창원", "의창구", "동읍"), "용잠리", false, 422, 5);
        jibun("경남 창원 의창구 동읍 용잠리 422번지 5호", "경남", List.of("창원", "의창구", "동읍"), "용잠리", false, 422, 5);
        jibun("서울 중구 광희동 2가 12번지 3호", "서울", List.of("중구"), "광희동2가", false, 12, 3);
        jibun("서울 중구 광희동2가 12번지  3", "서울", List.of("중구"), "광희동2가", false, 12, 3);
        jibun("서울 강남구 역삼동 123번지 3 101동", "서울", List.of("강남구"), "역삼동", false, 123, 3);   // 번지 N M 뒤 상세주소는 버림
        road("서울 중구 장충단로 226-12", "서울", List.of("중구"), "장충단로", false, 226, 12);
        fails("서울 중구 장충단로 226 12", ImportFailureReason.PARSE_FAILED);          // 띄어 쓴 부번은 확실하지 않아 실패
        fails("경남 창원 의창구 동읍 용잠리 422 5", ImportFailureReason.PARSE_FAILED);
        fails("서울 강남구 역삼동 123 4", ImportFailureReason.PARSE_FAILED);
        fails("서울 중구 세종대로 110 04524", ImportFailureReason.PARSE_FAILED);       // 뒤에 붙은 우편번호도 숫자만 남은 꼬리
        // 상세주소는 기존대로 버려지고 성공
        road("서울 중구 세종대로 110 101동 202호", "서울", List.of("중구"), "세종대로", false, 110, 0);
        road("서울 중구 세종대로 110 3층", "서울", List.of("중구"), "세종대로", false, 110, 0);
        road("서울 중구 세종대로 110 (태평로1가) 3층", "서울", List.of("중구"), "세종대로", false, 110, 0);
        road("서울 중구 세종대로 110 지하 1층", "서울", List.of("중구"), "세종대로", false, 110, 0);
    }

    @Test
    void 너무_긴_칸은_읽지_않고_실패하고_시간도_짧다() {
        String longNum = "서울 중구 세종대로 " + "1".repeat(AddressNormalizer.MAX_CHARS);
        fails(longNum, ImportFailureReason.PARSE_FAILED);
        fails("서울 중구 세종대로 110 " + "가".repeat(AddressNormalizer.MAX_CHARS), ImportFailureReason.PARSE_FAILED);   // 번호가 맞아도 300자를 넘으면 읽지 않는다
        String exactly = "서울 중구 세종대로 110 " + "가".repeat(AddressNormalizer.MAX_CHARS - "서울 중구 세종대로 110 ".length());
        assertThat(exactly).hasSize(AddressNormalizer.MAX_CHARS);
        assertThat(AddressNormalizer.parse(exactly).kind()).isEqualTo(Kind.ROAD);       // 300자까지는 읽는다
        long t0 = System.nanoTime();
        for (int i = 0; i < 5000; i++) AddressNormalizer.parse("(".repeat(AddressNormalizer.MAX_CHARS));
        for (int i = 0; i < 5000; i++) AddressNormalizer.parse("1".repeat(AddressNormalizer.MAX_CHARS));
        assertThat((System.nanoTime() - t0) / 1_000_000).as("5,000행 × 최악 2종 ms").isLessThan(3000);
    }

    // ---------- 실패 ----------

    @Test
    void 분류할_수_없거나_번호가_없으면_사유가_갈린다() {
        fails(null, ImportFailureReason.PARSE_FAILED);
        fails("  ", ImportFailureReason.PARSE_FAILED);
        fails("어디쯤", ImportFailureReason.PARSE_FAILED);
        fails("서울 중구 서울시청 101", ImportFailureReason.PARSE_FAILED);          // 번호 앞이 이름 토큰이 아니다
        fails("1114010300100310000", ImportFailureReason.PARSE_FAILED);            // PNU·좌표 같은 숫자뿐
        fails("37.5663", ImportFailureReason.PARSE_FAILED);
        fails("서울특별시 중구 세종대로", ImportFailureReason.BUILDING_NO_NOT_FOUND);
        fails("서울특별시 중구 태평로1가", ImportFailureReason.JIBUN_MISSING);
        fails("서울 강남구 역삼동 12345", ImportFailureReason.PARSE_FAILED);        // 지번 본번은 4자리까지
        fails("서울 강남구 역삼동 12-12345", ImportFailureReason.PARSE_FAILED);
        fails("서울 강남구 역삼동 0", ImportFailureReason.PARSE_FAILED);
    }

    @Test
    void 정리된_주소는_같은_주소의_다른_표기에서_같다() {
        String a = AddressNormalizer.parse("서울특별시 중구 세종대로 110 (태평로1가)").normalized();
        String b = AddressNormalizer.parse("서울특별시  중구   세종대로 110, 서울시청 3층").normalized();
        assertThat(a).isEqualTo("서울특별시 중구 세종대로 110").isEqualTo(b);
        assertThat(AddressNormalizer.parse("역삼동 산 3-1").normalized()).isEqualTo("역삼동 산 3-1");
    }

    @Test
    void 시도_약칭은_현행과_옛_명칭_후보로_늘어난다() {
        assertThat(AddressNormalizer.sidoNames("서울")).containsExactly("서울특별시");
        assertThat(AddressNormalizer.sidoNames("전남")).containsExactly("전라남도", "전남광주통합특별시");
        assertThat(AddressNormalizer.sidoNames("광주")).contains("광주광역시", "전남광주통합특별시");
        assertThat(AddressNormalizer.sidoNames("강원")).containsExactly("강원특별자치도", "강원도");
        assertThat(AddressNormalizer.sidoNames("광주시")).isEmpty();   // 경기도의 시 — 시도 약칭이 아니다
        assertThat(AddressNormalizer.sidoNames(null)).isEmpty();
    }

    @Test
    void looksLikeAddress는_컬럼_추천에_쓰인다() {
        assertThat(AddressNormalizer.looksLikeAddress("서울특별시 중구 세종대로 110")).isTrue();
        assertThat(AddressNormalizer.looksLikeAddress("대구 중구 동인동1가 2-1")).isTrue();
        assertThat(AddressNormalizer.looksLikeAddress("본청사")).isFalse();
        assertThat(AddressNormalizer.looksLikeAddress("3-4")).isFalse();
    }
}
