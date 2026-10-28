package com.gtp.domain.mymap.infra;

import com.gtp.domain.mymap.model.ImportFailureReason;
import com.gtp.domain.mymap.port.AddressMatch;
import com.gtp.domain.mymap.port.AddressMatch.Status;
import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 메모리 주소 자료(공공청사 7곳 + 가짜 동명 지역)로 지번·도로명 해석 규칙을 고정한다. DB는 쓰지 않는다. */
class TableAddressResolverTest {

    static final String SEOUL = "1114010300100310000";
    static final String SEJONG = "3611010300107180000";
    static final String BUSAN = "2647010200110000000";
    static final String DAEGU = "2711010100100020001";
    static final String DAEJEON = "3017011200114200000";
    static final String INCHEON = "2820010100111380000";
    static final String ULSAN = "3114010400106460004";

    InMemoryAddressRefReader data = InMemoryAddressRefReader.samples();
    TableAddressResolver resolver = new TableAddressResolver(data, 5);

    private AddressMatch one(String raw) {
        return resolver.resolve(List.of(raw)).get(0);
    }

    private void assertMatched(String raw, String pnu) {
        AddressMatch m = one(raw);
        assertThat(m.status()).as(raw + " → " + m).isEqualTo(Status.MATCHED);
        assertThat(m.pnu()).as(raw).isEqualTo(pnu);
    }

    private void assertFailed(String raw, ImportFailureReason reason) {
        AddressMatch m = one(raw);
        assertThat(m.status()).as(raw + " → " + m).isEqualTo(Status.FAILED);
        assertThat(m.reason()).as(raw).isEqualTo(reason);
        assertThat(m.pnu()).isNull();
    }

    // ---------- 샘플(공공청사 7곳) ----------

    @Test
    void 샘플_엑셀의_도로명_지번_주소_14개가_모두_PNU로_풀린다() {
        assertMatched("서울특별시 중구 세종대로 110", SEOUL);
        assertMatched("서울특별시 중구 태평로1가 31", SEOUL);
        assertMatched("세종특별자치시 한누리대로 2130", SEJONG);
        assertMatched("세종특별자치시 보람동 718", SEJONG);
        assertMatched("부산광역시 연제구 중앙대로 1001", BUSAN);
        assertMatched("부산광역시 연제구 연산동 1000", BUSAN);
        assertMatched("대구광역시 중구 공평로 88", DAEGU);
        assertMatched("대구광역시 중구 동인동1가 2-1", DAEGU);
        assertMatched("대전광역시 서구 둔산로 100", DAEJEON);
        assertMatched("대전광역시 서구 둔산동 1420", DAEJEON);
        assertMatched("인천광역시 남동구 정각로 29", INCHEON);
        assertMatched("인천광역시 남동구 구월동 1138", INCHEON);
        assertMatched("울산광역시 남구 중앙로 201", ULSAN);
        assertMatched("울산광역시 남구 신정동 646-4", ULSAN);
    }

    @Test
    void 약칭_상세주소_표기_흔들림을_받아들인다() {
        assertMatched("서울 중구 세종대로 110 (태평로1가)", SEOUL);
        assertMatched("서울시 중구 세종대로110, 서울시청 3층", SEOUL);
        assertMatched("서울 중구 태평로 1가 31번지", SEOUL);
        assertMatched("세종 한누리대로 2130", SEJONG);
        assertMatched("울산 남구 신정동 646-4", ULSAN);
        assertMatched("대구 중구 동인동 1가 2 - 1", DAEGU);
        assertMatched("부산 연제구 중앙대로 1001-0", BUSAN);   // 부번 0은 부번 없음과 같다
    }

    // ---------- 모호함 ----------

    @Test
    void 같은_도로명이_여러_지역에_있고_지역을_안_붙이면_AMBIGUOUS와_후보() {
        AddressMatch m = one("중앙로 201");
        assertThat(m.status()).isEqualTo(Status.AMBIGUOUS);
        assertThat(m.reason()).isEqualTo(ImportFailureReason.AMBIGUOUS);
        assertThat(m.candidates()).containsExactly("대구광역시 중구 중앙로 201 (동인동1가)", "울산광역시 남구 중앙로 201 (신정동)");

        assertMatched("울산 중앙로 201", ULSAN);          // 시도를 붙이면 정해진다
        assertMatched("남구 중앙로 201", ULSAN);          // 시군구만으로도
        assertMatched("대구 중구 중앙로 201", "2711010100100030000");
    }

    @Test
    void 지역을_못_가렸으면_건물이_한_곳에만_있어도_고르지_않고_후보를_보여_준다() {
        // 중앙로는 대구·울산에 있고 번호 201은 둘 다 있다. 울산에만 있는 번호는? 후보 1개짜리 AMBIGUOUS
        data.building("311402000007", false, 777, 0, "3114010400", false, 1, 0, "울산광역시", "남구", "신정동", "", "중앙로");
        AddressMatch m = one("중앙로 777");
        assertThat(m.status()).isEqualTo(Status.AMBIGUOUS);
        assertThat(m.candidates()).containsExactly("울산광역시 남구 중앙로 777 (신정동)");
    }

    @Test
    void 같은_이름_법정동이_여러_곳이면_AMBIGUOUS_시군구로_좁히면_해결() {
        AddressMatch m = one("신정동 646-4");
        assertThat(m.status()).isEqualTo(Status.AMBIGUOUS);
        assertThat(m.candidates()).containsExactly("서울특별시 양천구 신정동 646-4", "울산광역시 남구 신정동 646-4");

        assertMatched("서울 신정동 646-4", "1147010200106460004");
        assertMatched("양천구 신정동 646-4", "1147010200106460004");
        assertMatched("남구 신정동 646-4", ULSAN);
    }

    @Test
    void 시도를_적었으면_도로명이_여러_구에_걸쳐도_해당_번호_건물이_한_곳이면_확정_시도가_없으면_AMBIGUOUS() {
        InMemoryAddressRefReader d = new InMemoryAddressRefReader("T");
        d.road("111401000001", "서울특별시", "중구", "장충단로", true).road("111501000002", "서울특별시", "동대문구", "장충단로", true)
                .road("261101000003", "부산광역시", "중구", "장충단로", true);
        d.building("111401000001", false, 226, 12, "1114015500", false, 4, 0, "서울특별시", "중구", "장충동1가", "", "장충단로");
        d.building("261101000003", false, 226, 12, "2611010100", false, 9, 0, "부산광역시", "중구", "중앙동1가", "", "장충단로");
        TableAddressResolver r = new TableAddressResolver(d, 5);

        AddressMatch scoped = r.resolve(List.of("서울 장충단로 226-12")).get(0);            // 시도만: 서울 안에서 그 번호는 중구 한 곳
        assertThat(scoped.status()).isEqualTo(Status.MATCHED);
        assertThat(scoped.pnu()).isEqualTo("1114015500100040000");

        AddressMatch none = r.resolve(List.of("장충단로 226-12")).get(0);                   // 시도도 없음: 부산에도 있다 → 정하지 않는다
        assertThat(none.status()).isEqualTo(Status.AMBIGUOUS);
        assertThat(none.candidates()).containsExactly("부산광역시 중구 장충단로 226-12 (중앙동1가)", "서울특별시 중구 장충단로 226-12 (장충동1가)");

        // 시도도 없고 건물이 한 곳뿐이어도 정하지 않는다(후보 1개짜리 AMBIGUOUS) — 오타 하나로 다른 도에 찍히지 않게
        d.building("111501000002", false, 7, 0, "1123010100", false, 1, 0, "서울특별시", "동대문구", "신설동", "", "장충단로");
        AddressMatch single = r.resolve(List.of("장충단로 7")).get(0);
        assertThat(single.status()).isEqualTo(Status.AMBIGUOUS);
        assertThat(single.candidates()).containsExactly("서울특별시 동대문구 장충단로 7 (신설동)");
        assertThat(r.resolve(List.of("서울특별시 장충단로 7")).get(0).pnu()).isEqualTo("1123010100100010000");   // 시도를 적으면 확정

        // 시도를 적어도 같은 시도 두 곳에 같은 번호 건물이 있으면 AMBIGUOUS + 후보
        d.building("111501000002", false, 226, 12, "1123010200", false, 2, 0, "서울특별시", "동대문구", "용두동", "", "장충단로");
        AddressMatch two = r.resolve(List.of("서울 장충단로 226-12")).get(0);
        assertThat(two.status()).isEqualTo(Status.AMBIGUOUS);
        assertThat(two.candidates()).containsExactly("서울특별시 동대문구 장충단로 226-12 (용두동)", "서울특별시 중구 장충단로 226-12 (장충동1가)");
        assertThat(r.resolve(List.of("서울 중구 장충단로 226-12")).get(0).pnu()).isEqualTo("1114015500100040000");   // 구까지 적으면 확정
    }

    @Test
    void 후보는_최대_개수까지만() {
        InMemoryAddressRefReader d = new InMemoryAddressRefReader("T");
        for (int i = 1; i <= 8; i++) {
            d.legalDong("41" + (10 + i) + "110100", "경기도", "가" + i + "시", "우리동", "");
        }
        List<String> c = new TableAddressResolver(d, 5).resolve(List.of("우리동 1")).get(0).candidates();
        assertThat(c).hasSize(5);
        assertThat(new TableAddressResolver(d, 3).resolve(List.of("우리동 1")).get(0).candidates()).hasSize(3);
    }

    @Test
    void 같은_도로_같은_지역에_같은_번호가_두_번_있으면_AMBIGUOUS_하나만_있으면_그것() {
        InMemoryAddressRefReader d = new InMemoryAddressRefReader("T");
        d.road("411001000001", "경기도", "가평군", "중앙로", true).road("411001000002", "경기도", "가평군", "중앙로", true);
        d.building("411001000001", false, 5, 0, "4182025000", false, 10, 0, "경기도", "가평군", "가평읍", "", "중앙로");
        d.building("411001000002", false, 5, 0, "4182031000", false, 20, 0, "경기도", "가평군", "설악면", "", "중앙로");
        d.building("411001000002", false, 9, 0, "4182031000", false, 30, 0, "경기도", "가평군", "설악면", "", "중앙로");
        TableAddressResolver r = new TableAddressResolver(d, 5);

        AddressMatch dup = r.resolve(List.of("경기도 가평군 중앙로 5")).get(0);
        assertThat(dup.status()).isEqualTo(Status.AMBIGUOUS);
        assertThat(dup.candidates()).containsExactly("경기도 가평군 중앙로 5 (가평읍)", "경기도 가평군 중앙로 5 (설악면)");

        AddressMatch only = r.resolve(List.of("경기도 가평군 중앙로 9")).get(0);   // 번호 9는 한 도로에만 → 지역이 하나라 확정
        assertThat(only.status()).isEqualTo(Status.MATCHED);
        assertThat(only.pnu()).isEqualTo("4182031000100300000");
    }

    // ---------- 실패 사유 ----------

    @Test
    void 사유별_실패() {
        assertFailed("서울특별시 중구 없는길 1", ImportFailureReason.ROAD_NOT_FOUND);
        assertFailed("서울특별시 중구 세종대로 9999", ImportFailureReason.BUILDING_NO_NOT_FOUND);
        assertFailed("서울특별시 중구 세종대로 110-1", ImportFailureReason.BUILDING_NO_NOT_FOUND);   // 부번이 다르면 다른 건물
        assertFailed("서울특별시 중구 세종대로 지하 110", ImportFailureReason.BUILDING_NO_NOT_FOUND);   // 지하는 다른 건물
        assertFailed("서울특별시 종로구 세종대로 110", ImportFailureReason.ROAD_NOT_FOUND);           // 시군구가 맞지 않는 도로명
        assertFailed("서울특별시 중구 없는동 3", ImportFailureReason.LEGAL_DONG_NOT_FOUND);
        assertFailed("서울특별시 중구 태평로1가", ImportFailureReason.JIBUN_MISSING);
        assertFailed("서울특별시 중구 세종대로", ImportFailureReason.BUILDING_NO_NOT_FOUND);
        assertFailed("어디쯤", ImportFailureReason.PARSE_FAILED);
        assertFailed("경상도 어딘가동 1", ImportFailureReason.SIDO_UNKNOWN);
        assertFailed("부산광역시 중구 연산동 1000", ImportFailureReason.LEGAL_DONG_NOT_FOUND);    // 시군구가 다르면 그 동이 아니다
        assertFailed("서울 중구 연산동 1000", ImportFailureReason.LEGAL_DONG_NOT_FOUND);          // 시도가 다르면 그 동이 아니다
    }

    @Test
    void 지하와_부번과_건물군은_건물번호_키로_가른다() {
        InMemoryAddressRefReader d = new InMemoryAddressRefReader("T");
        d.road("111402005001", "서울특별시", "중구", "세종대로", true);
        d.building("111402005001", true, 5, 0, "1114010300", false, 1, 0, "서울특별시", "중구", "태평로1가", "", "세종대로");
        d.building("111402005001", false, 5, 2, "1114010300", false, 2, 0, "서울특별시", "중구", "태평로1가", "", "세종대로");
        // 건물군: 같은 도로명주소에 지번이 다른 건물 둘 → PNU가 작은 쪽
        d.building("111402005001", false, 7, 0, "1114010300", false, 50, 0, "서울특별시", "중구", "태평로1가", "", "세종대로");
        d.building("111402005001", false, 7, 0, "1114010300", false, 40, 0, "서울특별시", "중구", "태평로1가", "", "세종대로");
        TableAddressResolver r = new TableAddressResolver(d, 5);
        assertThat(r.resolve(List.of("서울 중구 세종대로 지하 5")).get(0).pnu()).isEqualTo("1114010300100010000");
        assertThat(r.resolve(List.of("서울 중구 세종대로 5-2")).get(0).pnu()).isEqualTo("1114010300100020000");
        assertThat(r.resolve(List.of("서울 중구 세종대로 5")).get(0).status()).isEqualTo(Status.FAILED);
        assertThat(r.resolve(List.of("서울 중구 세종대로 7")).get(0).pnu()).isEqualTo("1114010300100400000");
    }

    @Test
    void 사용중이고_말소_없는_도로명코드가_있으면_그것만_쓴다() {
        InMemoryAddressRefReader d = new InMemoryAddressRefReader("T");
        d.road("111402005001", "서울특별시", "중구", "옛길", false).road("111402005002", "서울특별시", "중구", "옛길", true);
        d.building("111402005001", false, 1, 0, "1114010300", false, 1, 0, "서울특별시", "중구", "태평로1가", "", "옛길");
        d.building("111402005002", false, 1, 0, "1114010300", false, 2, 0, "서울특별시", "중구", "태평로1가", "", "옛길");
        assertThat(new TableAddressResolver(d, 5).resolve(List.of("서울 중구 옛길 1")).get(0).pnu()).isEqualTo("1114010300100020000");

        InMemoryAddressRefReader onlyOld = new InMemoryAddressRefReader("T");
        onlyOld.road("111402005001", "서울특별시", "중구", "옛길", false);
        onlyOld.building("111402005001", false, 1, 0, "1114010300", false, 1, 0, "서울특별시", "중구", "태평로1가", "", "옛길");
        assertThat(new TableAddressResolver(onlyOld, 5).resolve(List.of("서울 중구 옛길 1")).get(0).pnu()).isEqualTo("1114010300100010000");   // 사용 중인 게 없으면 있는 것으로
    }

    // ---------- 리·산·시군구 약칭·로로 끝나는 동 ----------

    @Test
    void 리_산_번지와_읍면_표기() {
        InMemoryAddressRefReader d = new InMemoryAddressRefReader("T");
        d.legalDong("3611031021", "세종특별자치시", "", "연서면", "월하리");
        d.legalDong("4311025022", "충청북도", "청주시 상당구", "남일면", "월하리");
        TableAddressResolver r = new TableAddressResolver(d, 5);

        assertThat(r.resolve(List.of("세종특별자치시 연서면 월하리 산 12-3")).get(0).pnu()).isEqualTo("3611031021200120003");
        assertThat(r.resolve(List.of("세종 월하리 12")).get(0).pnu()).isEqualTo("3611031021100120000");
        assertThat(r.resolve(List.of("월하리 12")).get(0).status()).isEqualTo(Status.AMBIGUOUS);              // 같은 리가 두 곳
        assertThat(r.resolve(List.of("청주시 월하리 12")).get(0).pnu()).isEqualTo("4311025022100120000");     // 시만 써도
        assertThat(r.resolve(List.of("충북 청주시 상당구 남일면 월하리 12")).get(0).pnu()).isEqualTo("4311025022100120000");
        assertThat(r.resolve(List.of("세종 남일면 월하리 12")).get(0).reason()).isEqualTo(ImportFailureReason.LEGAL_DONG_NOT_FOUND);
        assertThat(r.resolve(List.of("세종 연서면 12")).get(0).reason()).isEqualTo(ImportFailureReason.LEGAL_DONG_NOT_FOUND);   // 면은 리까지 써야 한다
    }

    @Test
    void 시군구는_시_군_구를_뺀_약칭도_받는다() {
        InMemoryAddressRefReader d = new InMemoryAddressRefReader("T");
        d.legalDong("4111111100", "경기도", "수원시 장안구", "정자동", "");
        TableAddressResolver r = new TableAddressResolver(d, 5);
        assertThat(r.resolve(List.of("경기 수원 정자동 1")).get(0).status()).isEqualTo(Status.MATCHED);
        assertThat(r.resolve(List.of("수원시 정자동 1")).get(0).status()).isEqualTo(Status.MATCHED);
        assertThat(r.resolve(List.of("수원시 장안구 정자동 1")).get(0).status()).isEqualTo(Status.MATCHED);
        assertThat(r.resolve(List.of("수원시 영통구 정자동 1")).get(0).status()).isEqualTo(Status.FAILED);
        assertThat(r.resolve(List.of("성남시 정자동 1")).get(0).status()).isEqualTo(Status.FAILED);
    }

    @Test
    void 로로_끝나는_법정동은_도로명이_없을_때_지번으로_풀린다() {
        InMemoryAddressRefReader d = new InMemoryAddressRefReader("T");
        d.legalDong("1111011800", "서울특별시", "종로구", "세종로", "");
        d.road("111402005001", "서울특별시", "중구", "세종대로", true);
        TableAddressResolver r = new TableAddressResolver(d, 5);
        AddressMatch m = r.resolve(List.of("서울특별시 종로구 세종로 1")).get(0);
        assertThat(m.status()).isEqualTo(Status.MATCHED);
        assertThat(m.pnu()).isEqualTo("1111011800100010000");
        assertThat(r.resolve(List.of("서울특별시 종로구 세종로 1")).get(0).pnu()).isEqualTo(m.pnu());
    }

    // ---------- 호출 방식 ----------

    @Test
    void 입력_순서를_지키고_같은_주소는_한_번만_조회한다() {
        List<AddressMatch> out = resolver.resolve(List.of(
                "서울특별시 중구 세종대로 110", "어디쯤", "서울 중구 세종대로 110 (태평로1가)", "세종특별자치시 보람동 718", "서울특별시 중구 세종대로 110"));
        assertThat(out).hasSize(5);
        assertThat(out.get(0).pnu()).isEqualTo(SEOUL);
        assertThat(out.get(1).reason()).isEqualTo(ImportFailureReason.PARSE_FAILED);
        assertThat(out.get(2).pnu()).isEqualTo(SEOUL);            // 표기가 달라도 정리하면 같은 주소
        assertThat(out.get(3).pnu()).isEqualTo(SEJONG);
        assertThat(out.get(4).pnu()).isEqualTo(SEOUL);
        assertThat(data.findRoadCodesCalls).isEqualTo(1);
        assertThat(data.findBuildingsCalls).isEqualTo(1);
    }

    @Test
    void 법정동_사전은_기준월이_바뀔_때만_다시_만든다() {
        resolver.resolve(List.of("울산 남구 신정동 646-4"));
        resolver.resolve(List.of("울산 남구 신정동 646-4"));
        assertThat(data.legalDongsCalls).isEqualTo(1);
        data.setReadyVersion("2026-10");
        resolver.resolve(List.of("울산 남구 신정동 646-4"));
        assertThat(data.legalDongsCalls).isEqualTo(2);
    }

    @Test
    void 자료가_준비되지_않으면_available_false_해석은_MYMAP_REF_UNAVAILABLE() {
        assertThat(resolver.supported()).isTrue();
        assertThat(resolver.available()).isTrue();
        data.setReadyVersion(null);
        assertThat(resolver.available()).isFalse();
        assertThatThrownBy(() -> resolver.resolve(List.of("서울특별시 중구 세종대로 110")))
                .isInstanceOfSatisfying(CustomException.class, e -> assertThat(e.getErrorCode()).isEqualTo(GisErrorCode.MYMAP_REF_UNAVAILABLE));
    }

    @Test
    void null과_빈_입력도_죽지_않는다() {
        assertThat(resolver.resolve(List.of())).isEmpty();
        List<AddressMatch> out = resolver.resolve(java.util.Arrays.asList(null, " "));
        assertThat(out).extracting(AddressMatch::reason).containsExactly(ImportFailureReason.PARSE_FAILED, ImportFailureReason.PARSE_FAILED);
    }

    @Test
    void PNU_조립은_대지구분과_자리수를_맞춘다() {
        assertThat(TableAddressResolver.pnu("1114010300", false, 31, 0)).isEqualTo("1114010300100310000");
        assertThat(TableAddressResolver.pnu("3611031021", true, 12, 3)).isEqualTo("3611031021200120003");
        assertThat(TableAddressResolver.pnu("1114010300", false, 9999, 9999)).hasSize(19).endsWith("99999999");
    }
}
