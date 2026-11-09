package com.gtp.domain.mymap.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gtp.domain.mymap.controller.ParcelRefController;
import com.gtp.domain.mymap.dto.PnuAddressRequest;
import com.gtp.domain.mymap.dto.PnuAddressResponse;
import com.gtp.domain.mymap.dto.PnuAddressResponse.Item;
import com.gtp.domain.mymap.infra.AddressRefReader.BuildingRow;
import com.gtp.domain.mymap.infra.AddressRefReader.JibunKey;
import com.gtp.domain.mymap.infra.InMemoryAddressRefReader;
import com.gtp.domain.mymap.infra.TableAddressResolver;
import com.gtp.domain.mymap.infra.UnsupportedAddressResolver;
import com.gtp.domain.mymap.port.Coverage;
import com.gtp.domain.mymap.port.ParcelShape;
import com.gtp.domain.mymap.port.PnuParcelProvider;
import com.gtp.global.exception.CustomException;
import com.gtp.global.exception.GlobalExceptionHandler;
import com.gtp.global.gis.GisErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * PNU 묶음 → 지번·도로명주소(U26). DB 없이 메모리 리더로: 입력 검사(400)·503·429(세마포어)·중복 합치기·순서·지번주소(사전·지적도 이름 보조)·
 * 도로명주소(자르기·관련지번·건물명·우편번호)·roadAvailable false, 컨트롤러 응답 모양·헤더·오류 상태.
 */
class PnuAddressServiceTest {

    static final String ADM = "3611011600";                 // 세종 반곡동(사전에 있음)
    static final String UNKNOWN_ADM = "3611099900";          // 사전에 없는 법정동
    static final JibunKey KEY = new JibunKey(ADM, "0", 708, 0);
    static final String PNU = TableAddressResolver.pnu(ADM, false, 708, 0);

    /** 지적도 법정동 이름 보조 조회 대역 */
    static class StubParcels implements PnuParcelProvider {
        Map<String, String> names = Map.of();
        RuntimeException failure;
        int calls = 0;
        List<String> lastAsked = List.of();

        @Override
        public Map<String, ParcelShape> findByPnus(Collection<String> pnus) {
            return Map.of();
        }

        @Override
        public Map<String, String> legalDongNamesByPnus(Collection<String> pnus) {
            calls++;
            lastAsked = new ArrayList<>(pnus);
            if (failure != null) throw failure;
            return names;
        }

        @Override
        public Coverage coverage() {
            return Coverage.unavailable();
        }
    }

    InMemoryAddressRefReader reader;
    StubParcels parcels;
    PnuAddressService service;

    @BeforeEach
    void setUp() {
        reader = new InMemoryAddressRefReader("2026-09");
        reader.legalDong(ADM, "세종특별자치시", "", "반곡동", "");
        parcels = new StubParcels();
        service = new PnuAddressService(reader, new TableAddressResolver(reader, 5), parcels);
    }

    static BuildingRow row(String id, String road, String udgd, int main, int sub, String name, String sgg, boolean apt, String zip,
                           String relation) {
        return new BuildingRow(id, "세종특별자치시", "", "반곡동", "", road, "cd-" + road, udgd, main, sub, name, null, sgg, apt, zip, "1", relation);
    }

    static PnuAddressRequest req(String... pnus) {
        PnuAddressRequest r = new PnuAddressRequest();
        r.setPnus(List.of(pnus));
        return r;
    }

    static void assertError(Runnable call, GisErrorCode code) {
        assertThatThrownBy(call::run).isInstanceOf(CustomException.class)
                .satisfies(e -> assertThat(((CustomException) e).getErrorCode()).isEqualTo(code));
    }

    // ---------- 1) 입력 검사 ----------

    @Test
    void 요청_값_위반은_400이고_아무것도_조회하지_않는다() {
        PnuAddressRequest none = new PnuAddressRequest();
        assertError(() -> service.lookup(null), GisErrorCode.PNU_ADDRESS_INVALID);
        assertError(() -> service.lookup(none), GisErrorCode.PNU_ADDRESS_INVALID);           // pnus 없음
        assertError(() -> service.lookup(req()), GisErrorCode.PNU_ADDRESS_INVALID);          // 빈 배열
        List<String> over = new ArrayList<>();
        for (int i = 0; i < 501; i++) over.add(TableAddressResolver.pnu(ADM, false, i + 1, 0));
        PnuAddressRequest tooMany = new PnuAddressRequest();
        tooMany.setPnus(over);
        assertError(() -> service.lookup(tooMany), GisErrorCode.PNU_ADDRESS_INVALID);        // 501개

        String[] bad = {
                null, "", PNU.substring(1), PNU + "0",                                       // null·빈 값·18자리·20자리
                ADM + "3" + "07080000", ADM + "0" + "07080000",                              // 11번째 3·0
                ADM + "1" + "0708000a", " " + PNU, PNU + " ", PNU + "\n", "3611011600-1-0708-0000",
                "３６１１０１１６００１０７０８００００"                                          // 전각 숫자
        };
        for (String b : bad) {
            PnuAddressRequest r = new PnuAddressRequest();
            List<String> list = new ArrayList<>();
            list.add(PNU);          // 앞의 정상 값 하나가 있어도 틀린 값이 하나라도 있으면 전체가 400
            list.add(b);
            r.setPnus(list);
            assertError(() -> service.lookup(r), GisErrorCode.PNU_ADDRESS_INVALID);
        }
        assertThat(reader.roadAddressesByJibunCalls).isZero();
        assertThat(reader.legalDongsCalls).isZero();
        assertThat(parcels.calls).isZero();
        assertThat(GisErrorCode.PNU_ADDRESS_INVALID.getStatus().value()).isEqualTo(400);
        assertThat(GisErrorCode.PNU_ADDRESS_INVALID.getMessage()).isEqualTo("요청 값이 올바르지 않습니다(PNU 19자리 숫자 1~500개).");
    }

    @Test
    void 딱_500개와_산_11번째_2는_통과() {
        List<String> ok = new ArrayList<>();
        for (int i = 0; i < 499; i++) ok.add(TableAddressResolver.pnu(ADM, false, i + 1, 0));
        ok.add(TableAddressResolver.pnu(ADM, true, 12, 3));
        PnuAddressRequest r = new PnuAddressRequest();
        r.setPnus(ok);
        assertThat(service.lookup(r).getItems()).hasSize(500);
        assertThat(reader.lastKeyCount).isEqualTo(500);
    }

    // ---------- 2) 준비 안 됨 ----------

    @Test
    void 적재_기록이_없거나_주소_자료가_없으면_503() {
        reader.setReadyVersion(null);
        assertError(() -> service.lookup(req(PNU)), GisErrorCode.MYMAP_REF_UNAVAILABLE);
        assertThat(reader.roadAddressesByJibunCalls).isZero();

        reader.setReadyVersion("2026-09");
        PnuAddressService unsupported = new PnuAddressService(reader, new UnsupportedAddressResolver(), parcels);
        assertError(() -> unsupported.lookup(req(PNU)), GisErrorCode.MYMAP_REF_UNAVAILABLE);
        assertThat(GisErrorCode.MYMAP_REF_UNAVAILABLE.getStatus().value()).isEqualTo(503);
    }

    // ---------- 중복·순서·빠짐없음 ----------

    @Test
    void 중복은_하나로_합치고_처음_나온_순서로_요청한_PNU가_모두_한_번씩() {
        String a = TableAddressResolver.pnu(ADM, false, 1, 0);
        String b = TableAddressResolver.pnu(ADM, false, 2, 0);
        String c = TableAddressResolver.pnu(ADM, false, 3, 0);
        PnuAddressResponse r = service.lookup(req(b, a, b, c, a));
        assertThat(r.getItems()).extracting(Item::getPnu).containsExactly(b, a, c);
        assertThat(reader.lastKeyCount).isEqualTo(3);          // 조회도 한 번만
        assertThat(r.getReferenceVersion()).isEqualTo("2026-09");
        assertThat(r.getMaxRoadAddresses()).isEqualTo(20);
        // 건물이 없어도 빠지지 않는다
        assertThat(r.getItems()).allSatisfy(i -> {
            assertThat(i.getBuildingCount()).isZero();
            assertThat(i.getRoadAddressCount()).isZero();
            assertThat(i.getRoadAddresses()).isEmpty();
        });
    }

    // ---------- 4) 지번주소 ----------

    @Test
    void 지번주소는_법정동_사전으로_산과_부번을_붙여_만든다() {
        String plain = TableAddressResolver.pnu(ADM, false, 708, 0);
        String sub = TableAddressResolver.pnu(ADM, false, 708, 5);
        String san = TableAddressResolver.pnu(ADM, true, 12, 3);
        PnuAddressResponse r = service.lookup(req(plain, sub, san));
        assertThat(r.getItems()).extracting(Item::getJibunAddress)
                .containsExactly("세종특별자치시 반곡동 708", "세종특별자치시 반곡동 708-5", "세종특별자치시 반곡동 산 12-3");
        assertThat(parcels.calls).isZero();       // 사전에서 다 찾았으면 지적도 보조 조회는 부르지 않는다
    }

    @Test
    void 사전에_없는_법정동은_지적도_이름으로_메우고_공백을_정리하며_미해결만_묻는다() {
        String known = TableAddressResolver.pnu(ADM, false, 708, 0);
        String unknown = TableAddressResolver.pnu(UNKNOWN_ADM, false, 45, 2);
        String unknownSan = TableAddressResolver.pnu(UNKNOWN_ADM, true, 7, 0);
        String noName = TableAddressResolver.pnu(UNKNOWN_ADM, false, 9, 0);
        parcels.names = Map.of(unknown, "세종특별자치시  금남면   용포리", unknownSan, "세종특별자치시  금남면 용포리", noName, "   ");
        PnuAddressResponse r = service.lookup(req(known, unknown, unknownSan, noName));
        assertThat(r.getItems()).extracting(Item::getJibunAddress)
                .containsExactly("세종특별자치시 반곡동 708", "세종특별자치시 금남면 용포리 45-2", "세종특별자치시 금남면 용포리 산 7", null);
        assertThat(parcels.calls).isEqualTo(1);
        assertThat(parcels.lastAsked).containsExactlyInAnyOrder(unknown, unknownSan, noName);   // 사전에서 찾은 PNU는 묻지 않는다
    }

    @Test
    void 지적도_이름_조회가_DB_오류여도_그_PNU만_null이고_나머지는_정상() {
        String known = TableAddressResolver.pnu(ADM, false, 708, 0);
        String unknown = TableAddressResolver.pnu(UNKNOWN_ADM, false, 45, 0);
        parcels.failure = new DataAccessResourceFailureException("연결 실패");
        PnuAddressResponse r = service.lookup(req(known, unknown));
        assertThat(r.getItems().get(0).getJibunAddress()).isEqualTo("세종특별자치시 반곡동 708");
        assertThat(r.getItems().get(1).getJibunAddress()).isNull();
        assertThat(r.getItems().get(1).getRoadAddresses()).isEmpty();
    }

    // ---------- 5) 도로명주소 ----------

    @Test
    void 도로명주소_색인이_없으면_roadAvailable_false이고_조회하지_않는다() {
        reader.jibunReady(false);
        reader.parcelBuilding(KEY, row("A", "반곡로", "0", 51, 0, "건물", null, false, "30145", "MAIN"));
        PnuAddressResponse r = service.lookup(req(PNU));
        assertThat(r.isRoadAvailable()).isFalse();
        assertThat(r.isRelatedIncluded()).isFalse();
        assertThat(reader.roadAddressesByJibunCalls).isZero();
        Item i = r.getItems().get(0);
        assertThat(i.getJibunAddress()).isEqualTo("세종특별자치시 반곡동 708");     // 지번주소는 그대로
        assertThat(i.getBuildingCount()).isZero();
        assertThat(i.getRoadAddressCount()).isZero();
        assertThat(i.getRoadAddresses()).isEmpty();
    }

    @Test
    void 도로명주소_필드와_표준_도로명주소_건물명_우편번호() {
        reader.parcelBuilding(KEY, row("A", "반곡로", "0", 51, 0, "건축물대장명", "예시아파트", true, "30145", "MAIN"));
        reader.parcelBuilding(KEY, row("B", "반곡로", "0", 51, 0, "건축물대장명", "예시아파트", true, "30145", "MAIN"));   // 같은 도로명주소의 다른 동
        reader.parcelBuilding(KEY, row("C", "하길", "1", 7, 2, null, null, false, "", "MAIN"));                          // 지하·이름 없음·우편번호 없음
        PnuAddressResponse r = service.lookup(req(PNU));
        assertThat(r.isRoadAvailable()).isTrue();
        Item i = r.getItems().get(0);
        assertThat(i.getBuildingCount()).isEqualTo(3);           // 건물 수는 건물당 1번
        assertThat(i.getRoadAddressCount()).isEqualTo(2);        // 도로명주소는 도로 키당 1개
        assertThat(i.getRoadAddresses()).hasSize(2);
        PnuAddressResponse.RoadAddress first = i.getRoadAddresses().get(0);
        assertThat(first.getRoadAddress()).isEqualTo("세종특별자치시 반곡로 51 (반곡동, 예시아파트)");
        assertThat(first.getBuildingName()).isEqualTo("예시아파트");        // 공동주택 → 시군구용 건물명
        assertThat(first.getZipCode()).isEqualTo("30145");
        assertThat(first.getRelation()).isEqualTo("MAIN");
        PnuAddressResponse.RoadAddress second = i.getRoadAddresses().get(1);
        assertThat(second.getRoadAddress()).isEqualTo("세종특별자치시 하길 지하7-2 (반곡동)");
        assertThat(second.getBuildingName()).isNull();             // 빈 값은 null
        assertThat(second.getZipCode()).isNull();
    }

    @Test
    void 대표_이름은_이름이_있는_건물을_고르고_공동주택은_시군구용_아니면_건축물대장() {
        reader.parcelBuilding(KEY, row("1", "가길", "0", 1, 0, null, null, false, "30145", "MAIN"));          // 같은 주소에 이름 없는 건물 + 이름 있는 건물
        reader.parcelBuilding(KEY, row("2", "가길", "0", 1, 0, "대장명", null, false, "30145", "MAIN"));
        reader.parcelBuilding(KEY, row("3", "나길", "0", 2, 0, "대장명", "시군구명", true, "30145", "MAIN"));
        reader.parcelBuilding(KEY, row("4", "다길", "0", 3, 0, "대장명", null, true, "30145", "MAIN"));        // 공동주택인데 시군구용 없음 → 대장명
        reader.parcelBuilding(KEY, row("5", "라길", "0", 4, 0, "대장명", "시군구명", false, "30145", "MAIN"));  // 일반 건물 → 대장명
        List<PnuAddressResponse.RoadAddress> a = service.lookup(req(PNU)).getItems().get(0).getRoadAddresses();
        assertThat(a).extracting(PnuAddressResponse.RoadAddress::getBuildingName).containsExactly("대장명", "시군구명", "대장명", "대장명");
    }

    @Test
    void 정렬은_대표지번_먼저_도로명_지하여부_본번_부번() {
        reader.relatedReady(true);
        reader.parcelBuilding(KEY, row("R1", "가길", "0", 1, 0, "관련", null, false, "30145", "RELATED"));
        reader.parcelBuilding(KEY, row("M5", "나길", "0", 10, 0, "나10", null, false, "30145", "MAIN"));
        reader.parcelBuilding(KEY, row("M4", "나길", "1", 2, 0, "나지하2", null, false, "30145", "MAIN"));
        reader.parcelBuilding(KEY, row("M3", "나길", "0", 2, 1, "나2-1", null, false, "30145", "MAIN"));
        reader.parcelBuilding(KEY, row("M2", "나길", "0", 2, 0, "나2", null, false, "30145", "MAIN"));
        reader.parcelBuilding(KEY, row("M1", "가길", "0", 99, 0, "가99", null, false, "30145", "MAIN"));
        List<String> names = service.lookup(req(PNU)).getItems().get(0).getRoadAddresses().stream()
                .map(PnuAddressResponse.RoadAddress::getBuildingName).toList();
        assertThat(names).containsExactly("가99", "나2", "나2-1", "나10", "나지하2", "관련");
    }

    @Test
    void 관련지번만_걸린_주소는_RELATED_대표지번_건물이_하나라도_있으면_MAIN() {
        reader.relatedReady(true);
        reader.parcelBuilding(KEY, row("A", "반곡로", "0", 1, 0, "대표", null, false, "30145", "MAIN"));
        reader.parcelBuilding(KEY, row("B", "반곡로", "0", 1, 0, "관련", null, false, "30145", "RELATED"));
        reader.parcelBuilding(KEY, row("C", "별길", "0", 5, 0, "관련만", null, false, "30145", "RELATED"));
        PnuAddressResponse r = service.lookup(req(PNU));
        assertThat(r.isRelatedIncluded()).isTrue();
        Item i = r.getItems().get(0);
        assertThat(i.getBuildingCount()).isEqualTo(3);
        assertThat(i.getRoadAddresses()).extracting(PnuAddressResponse.RoadAddress::getRelation).containsExactly("MAIN", "RELATED");
    }

    @Test
    void 관련지번_색인이_없으면_관련지번_건물은_빠지고_relatedIncluded_false() {
        reader.relatedReady(false);
        reader.parcelBuilding(KEY, row("A", "반곡로", "0", 1, 0, "대표", null, false, "30145", "MAIN"));
        reader.parcelBuilding(KEY, row("C", "별길", "0", 5, 0, "관련만", null, false, "30145", "RELATED"));
        PnuAddressResponse r = service.lookup(req(PNU));
        assertThat(r.isRelatedIncluded()).isFalse();
        assertThat(r.getItems().get(0).getBuildingCount()).isEqualTo(1);
        assertThat(r.getItems().get(0).getRoadAddressCount()).isEqualTo(1);
    }

    @Test
    void 도로명주소가_20개를_넘으면_20개만_주고_개수는_자르기_전_값() {
        for (int i = 1; i <= 25; i++) {
            reader.parcelBuilding(KEY, row("B" + i, "길" + String.format("%02d", i), "0", i, 0, "건물" + i, null, false, "30145", "MAIN"));
        }
        PnuAddressResponse r = service.lookup(req(PNU));
        Item item = r.getItems().get(0);
        assertThat(reader.lastPerKey).isEqualTo(20);
        assertThat(item.getBuildingCount()).isEqualTo(25);
        assertThat(item.getRoadAddressCount()).isEqualTo(25);
        assertThat(item.getRoadAddresses()).hasSize(20);
        assertThat(item.getRoadAddresses().get(0).getBuildingName()).isEqualTo("건물1");
        assertThat(item.getRoadAddresses().get(19).getBuildingName()).isEqualTo("건물20");
    }

    @Test
    void PNU에서_지번_키를_만든다_대지_산_본번_부번() {
        reader.parcelBuilding(new JibunKey(ADM, "0", 708, 5), row("A", "반곡로", "0", 51, 0, "건물", null, false, "30145", "MAIN"));
        reader.parcelBuilding(new JibunKey(ADM, "1", 12, 3), row("S", "산길", "0", 7, 0, "산건물", null, false, "30145", "MAIN"));
        List<Item> items = service.lookup(req(TableAddressResolver.pnu(ADM, false, 708, 5), TableAddressResolver.pnu(ADM, false, 708, 0),
                TableAddressResolver.pnu(ADM, true, 12, 3), TableAddressResolver.pnu(ADM, false, 12, 3))).getItems();
        assertThat(items).extracting(Item::getBuildingCount).containsExactly(1, 0, 1, 0);      // 부번·산 여부가 다르면 다른 필지
        assertThat(items.get(2).getRoadAddresses().get(0).getRoadAddress()).startsWith("세종특별자치시 산길 7");
    }

    @Test
    void 샘플_리더의_세종청사_필지() {
        InMemoryAddressRefReader samples = InMemoryAddressRefReader.samples();
        PnuAddressService s = new PnuAddressService(samples, new TableAddressResolver(samples, 5), parcels);
        Item i = s.lookup(req("3611010300" + "1" + "0718" + "0000")).getItems().get(0);
        assertThat(i.getJibunAddress()).isEqualTo("세종특별자치시 보람동 718");
        assertThat(i.getBuildingCount()).isEqualTo(2);
        assertThat(i.getRoadAddressCount()).isEqualTo(1);
        assertThat(i.getRoadAddresses().get(0).getRoadAddress()).isEqualTo("세종특별자치시 한누리대로 2130 (보람동)");
    }

    // ---------- 3) 동시 처리 제한 ----------

    @Test
    void 동시_처리_칸이_다_차면_429이고_끝나면_다시_받는다() throws Exception {
        PnuAddressService one = new PnuAddressService(reader, new TableAddressResolver(reader, 5), parcels, 1);
        reader.enteredRoadAddresses = new CountDownLatch(1);
        reader.holdRoadAddresses = new CountDownLatch(1);
        ExecutorService pool = Executors.newSingleThreadExecutor();
        try {
            Future<PnuAddressResponse> first = pool.submit(() -> one.lookup(req(PNU)));
            assertThat(reader.enteredRoadAddresses.await(5, TimeUnit.SECONDS)).isTrue();
            assertError(() -> one.lookup(req(PNU)), GisErrorCode.PNU_ADDRESS_BUSY);
            reader.holdRoadAddresses.countDown();
            assertThat(first.get(5, TimeUnit.SECONDS).getItems()).hasSize(1);
            assertThat(one.lookup(req(PNU)).getItems()).hasSize(1);     // 반납됐다
        } finally {
            reader.holdRoadAddresses.countDown();
            pool.shutdownNow();
        }
        assertThat(GisErrorCode.PNU_ADDRESS_BUSY.getStatus().value()).isEqualTo(429);
        assertThat(GisErrorCode.PNU_ADDRESS_BUSY.getMessage()).isEqualTo("주소 찾기 요청이 많습니다. 잠시 후 다시 시도하세요.");
    }

    @Test
    void 기본은_동시_3건까지_네_번째는_429() throws Exception {
        reader.enteredRoadAddresses = new CountDownLatch(3);
        reader.holdRoadAddresses = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(3);
        try {
            List<Future<PnuAddressResponse>> running = new ArrayList<>();
            for (int i = 0; i < 3; i++) running.add(pool.submit(() -> service.lookup(req(PNU))));
            assertThat(reader.enteredRoadAddresses.await(5, TimeUnit.SECONDS)).isTrue();
            assertError(() -> service.lookup(req(PNU)), GisErrorCode.PNU_ADDRESS_BUSY);
            reader.holdRoadAddresses.countDown();
            for (Future<PnuAddressResponse> f : running) assertThat(f.get(5, TimeUnit.SECONDS).getItems()).hasSize(1);
        } finally {
            reader.holdRoadAddresses.countDown();
            pool.shutdownNow();
        }
    }

    @Test
    void 조회가_실패해도_칸을_반납한다() {
        PnuAddressService one = new PnuAddressService(reader, new TableAddressResolver(reader, 5), parcels, 1);
        reader.failRoadAddresses = new IllegalStateException("DB 오류 흉내");
        assertThatThrownBy(() -> one.lookup(req(PNU))).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> one.lookup(req(PNU))).isInstanceOf(IllegalStateException.class);   // 429가 아니라 또 같은 오류 = 반납됨
        reader.failRoadAddresses = null;
        assertThat(one.lookup(req(PNU)).getItems()).hasSize(1);
    }

    @Test
    void 검사에서_거절된_요청은_칸을_쓰지_않는다() {
        PnuAddressService one = new PnuAddressService(reader, new TableAddressResolver(reader, 5), parcels, 1);
        assertError(() -> one.lookup(req("bad")), GisErrorCode.PNU_ADDRESS_INVALID);
        reader.setReadyVersion(null);
        assertError(() -> one.lookup(req(PNU)), GisErrorCode.MYMAP_REF_UNAVAILABLE);
        reader.setReadyVersion("2026-09");
        assertThat(one.lookup(req(PNU)).getItems()).hasSize(1);
    }

    // ---------- 컨트롤러 ----------

    @Test
    void 컨트롤러_응답_봉투_필드_캐시_헤더와_오류_상태() throws Exception {
        reader.parcelBuilding(KEY, row("X1", "반곡로", "0", 51, 0, "건축물대장명", "예시아파트", true, "30145", "MAIN"));
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new ParcelRefController(org.mockito.Mockito.mock(ParcelBuildingService.class), service))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
        ObjectMapper om = new ObjectMapper();
        String url = "/api/mymap/ref/pnu-addresses";
        String unknown = TableAddressResolver.pnu(UNKNOWN_ADM, false, 1, 0);

        MvcResult ok = mvc.perform(post(url).contentType(MediaType.APPLICATION_JSON)
                .content("{\"pnus\":[\"" + PNU + "\",\"" + unknown + "\",\"" + PNU + "\"]}")).andReturn();
        assertThat(ok.getResponse().getStatus()).isEqualTo(200);
        assertThat(ok.getResponse().getHeader("Cache-Control")).isEqualTo("no-store");
        JsonNode j = om.readTree(ok.getResponse().getContentAsString(StandardCharsets.UTF_8));
        assertThat(j.get("success").asBoolean()).isTrue();
        JsonNode d = j.get("data");
        assertThat(d.fieldNames()).toIterable().containsExactlyInAnyOrder("referenceVersion", "roadAvailable", "relatedIncluded", "maxRoadAddresses", "items");
        assertThat(d.get("referenceVersion").asText()).isEqualTo("2026-09");
        assertThat(d.get("roadAvailable").asBoolean()).isTrue();
        assertThat(d.get("relatedIncluded").asBoolean()).isFalse();
        assertThat(d.get("maxRoadAddresses").asInt()).isEqualTo(20);
        assertThat(d.get("items")).hasSize(2);
        JsonNode first = d.get("items").get(0);
        assertThat(first.fieldNames()).toIterable().containsExactlyInAnyOrder("pnu", "jibunAddress", "buildingCount", "roadAddressCount", "roadAddresses");
        assertThat(first.get("pnu").asText()).isEqualTo(PNU);
        assertThat(first.get("buildingCount").asInt()).isEqualTo(1);
        assertThat(first.get("roadAddressCount").asInt()).isEqualTo(1);
        JsonNode road = first.get("roadAddresses").get(0);
        assertThat(road.fieldNames()).toIterable().containsExactlyInAnyOrder("roadAddress", "zipCode", "buildingName", "relation");
        assertThat(road.get("roadAddress").asText()).isEqualTo("세종특별자치시 반곡로 51 (반곡동, 예시아파트)");
        assertThat(road.get("relation").asText()).isEqualTo("MAIN");
        JsonNode second = d.get("items").get(1);                      // 사전에도 지적도에도 없는 법정동 → 필드는 있고 값은 null
        assertThat(second.has("jibunAddress")).isTrue();
        assertThat(second.get("jibunAddress").isNull()).isTrue();
        assertThat(second.get("roadAddresses")).isEmpty();

        // 400: 본문 없음·빈 객체·빈 배열·깨진 JSON·배열이 아님·숫자 값·JSON이 아닌 형식 — 전부 같은 코드, 캐시 헤더 없음
        String message = GisErrorCode.PNU_ADDRESS_INVALID.getMessage();
        List<MvcResult> bad = new ArrayList<>();
        bad.add(mvc.perform(post(url).contentType(MediaType.APPLICATION_JSON)).andReturn());
        bad.add(mvc.perform(post(url).contentType(MediaType.APPLICATION_JSON).content("{}")).andReturn());
        bad.add(mvc.perform(post(url).contentType(MediaType.APPLICATION_JSON).content("{\"pnus\":[]}")).andReturn());
        bad.add(mvc.perform(post(url).contentType(MediaType.APPLICATION_JSON).content("{\"pnus\":[")).andReturn());
        bad.add(mvc.perform(post(url).contentType(MediaType.APPLICATION_JSON).content("{\"pnus\":\"" + PNU + "\"}")).andReturn());
        bad.add(mvc.perform(post(url).contentType(MediaType.APPLICATION_JSON).content("{\"pnus\":[123]}")).andReturn());
        bad.add(mvc.perform(post(url).contentType(MediaType.APPLICATION_JSON).content("{\"pnus\":[null]}")).andReturn());
        bad.add(mvc.perform(post(url).contentType(MediaType.TEXT_PLAIN).content(PNU)).andReturn());
        for (MvcResult b : bad) {
            assertThat(b.getResponse().getStatus()).isEqualTo(400);
            assertThat(b.getResponse().getHeader("Cache-Control")).isNull();
            JsonNode e = om.readTree(b.getResponse().getContentAsString(StandardCharsets.UTF_8));
            assertThat(e.get("success").asBoolean()).isFalse();
            assertThat(e.get("message").asText()).isEqualTo(message);
            assertThat(e.get("data").isNull()).isTrue();
        }

        // 503·429
        reader.setReadyVersion(null);
        MvcResult unavailable = mvc.perform(post(url).contentType(MediaType.APPLICATION_JSON).content("{\"pnus\":[\"" + PNU + "\"]}")).andReturn();
        assertThat(unavailable.getResponse().getStatus()).isEqualTo(503);
        assertThat(unavailable.getResponse().getContentAsString(StandardCharsets.UTF_8)).contains("아직 준비되지 않았습니다");
        reader.setReadyVersion("2026-09");

        PnuAddressService one = new PnuAddressService(reader, new TableAddressResolver(reader, 5), parcels, 0);
        MockMvc busyMvc = MockMvcBuilders.standaloneSetup(new ParcelRefController(org.mockito.Mockito.mock(ParcelBuildingService.class), one))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
        MvcResult busy = busyMvc.perform(post(url).contentType(MediaType.APPLICATION_JSON).content("{\"pnus\":[\"" + PNU + "\"]}")).andReturn();
        assertThat(busy.getResponse().getStatus()).isEqualTo(429);
        assertThat(busy.getResponse().getContentAsString(StandardCharsets.UTF_8)).contains("주소 찾기 요청이 많습니다");
    }
}
