package com.gtp.domain.mymap.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.gtp.domain.mymap.config.MyMapProperties;
import com.gtp.domain.mymap.controller.ParcelRefController;
import com.gtp.domain.mymap.dto.RefStatusResponse;
import com.gtp.domain.mymap.dto.RefStatusResponse.RefDataset;
import com.gtp.domain.mymap.infra.FakeRefLoadMetaReader;
import com.gtp.domain.mymap.port.RefLoadMetaReader.LoadRecord;
import com.gtp.global.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 참조 자료 적재 상태(U27) — DB 없이 메모리 기록으로: 항목 4개·순서, READY·SWAPPING·PARTIAL·MISSING·UNAVAILABLE,
 * 오래됨 경계(100일·400일), 지적도 시도 합산, 응답 JSON 모양, 컨트롤러 헤더.
 */
class RefStatusServiceTest {

    /** 2026-11-09 14:03:00 KST 로 고정 */
    static final Clock CLOCK = Clock.fixed(Instant.parse("2026-11-09T05:03:00Z"), RefStatusService.KST);
    static final LocalDate TODAY = LocalDate.of(2026, 11, 9);
    static final List<String> BUILDING = List.of("ti_spbd_buld", "ti_sprd_stret", "ti_scco_mvmn");

    final MyMapProperties props = new MyMapProperties();

    static LoadRecord addr(String dataset, String version, String status, LocalDate base) {
        return new LoadRecord(dataset, "00", version, status, 1_000L, base, LocalDateTime.of(2026, 10, 5, 2, 30, 45));
    }

    static LoadRecord parcel(String sido, String version, String status, LocalDate base, long rows) {
        return new LoadRecord("parcel", sido, version, status, rows, base, LocalDateTime.of(2026, 10, 6, 3, 0));
    }

    List<LoadRecord> allReady() {
        List<LoadRecord> all = new ArrayList<>();
        for (String d : BUILDING) all.add(addr(d, "2026-09", "READY", LocalDate.of(2026, 9, 1)));
        for (String s : props.getRef().getExpectedSidoCodes()) all.add(parcel(s, "2026-10", "READY", LocalDate.of(2026, 10, 1), 100));
        return all;
    }

    RefStatusResponse run(List<LoadRecord> records) {
        return new RefStatusService(new FakeRefLoadMetaReader(records), props, CLOCK).status();
    }

    RefDataset of(RefStatusResponse r, String id) {
        return r.datasets().stream().filter(d -> d.id().equals(id)).findFirst().orElseThrow();
    }

    // ---------------------------------------------------------------- 정상

    @Test
    void 항목은_항상_4개이고_순서_이름_출처가_고정이다() {
        RefStatusResponse r = run(allReady());
        assertThat(r.datasets()).extracting(RefDataset::id).containsExactly("building", "road-code", "related-jibun", "parcel");
        assertThat(r.datasets()).extracting(RefDataset::label).containsExactly("도로명주소 건물DB", "도로명코드", "관련지번", "연속지적도");
        assertThat(r.datasets().subList(0, 3)).extracting(RefDataset::source).containsOnly("행정안전부 도로명주소 건물DB 전체분(juso.go.kr)");
        assertThat(r.datasets().get(3).source()).isEqualTo("국토교통부 연속지적도형정보(브이월드 데이터 다운로드)");
        assertThat(r.datasets()).extracting(RefDataset::updateCycle).containsOnly("매월");
        assertThat(r.datasets()).extracting(RefDataset::staleAfterDays).containsExactly(100, 100, 100, 400);
        assertThat(r.checkedAt().toString()).isEqualTo("2026-11-09T14:03+09:00");
    }

    @Test
    void 정상_항목의_값() {
        RefStatusResponse r = run(allReady());
        RefDataset b = of(r, "building");
        assertThat(b.status()).isEqualTo("READY");
        assertThat(b.version()).isEqualTo("2026-09");
        assertThat(b.latestVersion()).isEqualTo("2026-09");
        assertThat(b.baseDate()).isEqualTo(LocalDate.of(2026, 9, 1));
        assertThat(b.loadedAt().toString()).isEqualTo("2026-10-05T02:30:45+09:00");   // 적재 시각은 한국 시각으로 본다
        assertThat(b.rowCount()).isEqualTo(1000L);
        assertThat(b.stale()).isFalse();
        assertThat(b.coverage()).isNull();

        RefDataset p = of(r, "parcel");
        assertThat(p.status()).isEqualTo("READY");
        assertThat(p.version()).isEqualTo("2026-10");
        assertThat(p.rowCount()).isEqualTo(1600L);   // 시도 16개 × 100
        assertThat(p.coverage().loadedSidoCount()).isEqualTo(16);
        assertThat(p.coverage().expectedSidoCount()).isEqualTo(16);
        assertThat(p.coverage().nationwide()).isTrue();
    }

    // ---------------------------------------------------------------- 상태

    @Test
    void 교체중이면_SWAPPING() {
        List<LoadRecord> rec = allReady();
        rec.set(0, addr("ti_spbd_buld", "2026-09", "SWAPPING", LocalDate.of(2026, 9, 1)));
        rec.set(3 + 5, parcel("30", "2026-10", "swapping", LocalDate.of(2026, 10, 1), 100));   // 대소문자 무관
        RefStatusResponse r = run(rec);
        assertThat(of(r, "building").status()).isEqualTo("SWAPPING");
        assertThat(of(r, "road-code").status()).isEqualTo("READY");
        assertThat(of(r, "parcel").status()).isEqualTo("SWAPPING");
        assertThat(of(r, "parcel").coverage().nationwide()).isTrue();   // 교체 중이어도 적재된 시도로 센다(한도 응답과 같다)
    }

    @Test
    void 지적도가_기대_시도_일부만_있으면_PARTIAL이고_기준월은_가장_이른_값_가장_늦은_값() {
        List<LoadRecord> rec = new ArrayList<>(allReady().subList(0, 3));
        rec.add(parcel("11", "2026-08", "READY", LocalDate.of(2026, 8, 1), 10));
        rec.add(parcel("36", "2026-10", "READY", LocalDate.of(2026, 10, 1), 20));
        rec.add(parcel("41", "2026-09", "READY", LocalDate.of(2026, 9, 15), 30));
        RefDataset p = of(run(rec), "parcel");
        assertThat(p.status()).isEqualTo("PARTIAL");
        assertThat(p.version()).isEqualTo("2026-08");
        assertThat(p.latestVersion()).isEqualTo("2026-10");
        assertThat(p.baseDate()).isEqualTo(LocalDate.of(2026, 8, 1));    // 가장 이른 값
        assertThat(p.loadedAt().toString()).isEqualTo("2026-10-06T03:00+09:00");
        assertThat(p.rowCount()).isEqualTo(60L);
        assertThat(p.coverage().loadedSidoCount()).isEqualTo(3);
        assertThat(p.coverage().expectedSidoCount()).isEqualTo(16);
        assertThat(p.coverage().nationwide()).isFalse();
    }

    @Test
    void 기대_목록에_없는_시도는_적재_수에_세지_않는다() {
        List<LoadRecord> rec = allReady();
        rec.add(parcel("29", "2026-10", "READY", LocalDate.of(2026, 10, 1), 5));   // 옛 시도코드
        RefDataset p = of(run(rec), "parcel");
        assertThat(p.coverage().loadedSidoCount()).isEqualTo(16);
        assertThat(p.status()).isEqualTo("READY");
    }

    @Test
    void 지역_제한이_있으면_그_지역만_기대하고_nationwide는_false() {
        props.getRef().setAllowedSidoCodes(List.of("36", "30"));
        List<LoadRecord> rec = new ArrayList<>(allReady().subList(0, 3));
        rec.add(parcel("36", "2026-10", "READY", LocalDate.of(2026, 10, 1), 10));
        rec.add(parcel("30", "2026-10", "READY", LocalDate.of(2026, 10, 1), 10));
        RefDataset p = of(run(rec), "parcel");
        assertThat(p.status()).isEqualTo("READY");               // 의도한 일부 적재는 PARTIAL이 아니다
        assertThat(p.coverage().expectedSidoCount()).isEqualTo(2);
        assertThat(p.coverage().loadedSidoCount()).isEqualTo(2);
        assertThat(p.coverage().nationwide()).isFalse();         // 한도 응답(MyMapQuotaService)과 같은 판정
    }

    @Test
    void 기대_시도_목록이_비어_있으면_전국이라고_하지_않는다() {
        props.getRef().setExpectedSidoCodes(List.of());
        RefDataset p = of(run(allReadyWith(List.of("11"))), "parcel");
        assertThat(p.coverage().nationwide()).isFalse();
        assertThat(p.status()).isEqualTo("READY");   // 기대할 시도가 없으니 PARTIAL도 아니다
    }

    List<LoadRecord> allReadyWith(List<String> sidos) {
        List<LoadRecord> all = new ArrayList<>();
        for (String d : BUILDING) all.add(addr(d, "2026-09", "READY", LocalDate.of(2026, 9, 1)));
        for (String s : sidos) all.add(parcel(s, "2026-10", "READY", LocalDate.of(2026, 10, 1), 100));
        return all;
    }

    @Test
    void 기록이_없으면_MISSING_값은_null_오래됨_아님() {
        RefStatusResponse r = run(List.of());
        assertThat(r.datasets()).hasSize(4);
        for (RefDataset d : r.datasets()) {
            assertThat(d.status()).isEqualTo("MISSING");
            assertThat(d.version()).isNull();
            assertThat(d.latestVersion()).isNull();
            assertThat(d.baseDate()).isNull();
            assertThat(d.loadedAt()).isNull();
            assertThat(d.rowCount()).isNull();
            assertThat(d.stale()).isFalse();
        }
        assertThat(of(r, "building").coverage()).isNull();
        assertThat(of(r, "parcel").coverage().loadedSidoCount()).isZero();
        assertThat(of(r, "parcel").coverage().nationwide()).isFalse();
    }

    @Test
    void 일부_데이터셋만_없으면_그것만_MISSING() {
        List<LoadRecord> rec = allReady();
        rec.removeIf(x -> x.dataset().equals("ti_scco_mvmn"));
        RefStatusResponse r = run(rec);
        assertThat(of(r, "related-jibun").status()).isEqualTo("MISSING");
        assertThat(of(r, "building").status()).isEqualTo("READY");
        assertThat(of(r, "parcel").status()).isEqualTo("READY");
    }

    @Test
    void 기록을_읽지_못하면_예외_없이_4개_모두_UNAVAILABLE() {
        RefStatusResponse r = new RefStatusService(
                new FakeRefLoadMetaReader(List.of(), new DataAccessResourceFailureException("연결 실패 jdbc:postgresql://secret-host/db")), props, CLOCK).status();
        assertThat(r.datasets()).hasSize(4);
        for (RefDataset d : r.datasets()) {
            assertThat(d.status()).isEqualTo("UNAVAILABLE");
            assertThat(d.version()).isNull();
            assertThat(d.stale()).isFalse();
            assertThat(d.coverage()).isNull();
        }
        // 응답에 예외 메시지(접속 주소 등)가 섞이지 않는다
        assertThat(new ObjectMapper().registerModule(new JavaTimeModule()).valueToTree(r).toString()).doesNotContain("secret-host").doesNotContain("jdbc");
    }

    @Test
    void READY_SWAPPING이_아닌_모르는_상태값만_있으면_UNAVAILABLE() {
        List<LoadRecord> rec = allReady();
        rec.set(1, addr("ti_sprd_stret", "2026-09", "FAILED", LocalDate.of(2026, 9, 1)));
        for (int i = 3; i < rec.size(); i++) rec.set(i, parcel(rec.get(i).sido(), "2026-10", "???", LocalDate.of(2026, 10, 1), 1));
        RefStatusResponse r = run(rec);
        assertThat(of(r, "road-code").status()).isEqualTo("UNAVAILABLE");
        assertThat(of(r, "building").status()).isEqualTo("READY");
        assertThat(of(r, "parcel").status()).isEqualTo("UNAVAILABLE");
    }

    @Test
    void 같은_데이터셋의_기록이_여럿이면_기준월이_가장_늦은_것() {
        List<LoadRecord> rec = allReady();
        rec.add(new LoadRecord("ti_spbd_buld", "11", "2026-10", "READY", 5L, LocalDate.of(2026, 10, 1), LocalDateTime.of(2026, 10, 7, 1, 0)));
        RefDataset b = of(run(rec), "building");
        assertThat(b.version()).isEqualTo("2026-10");
        assertThat(b.rowCount()).isEqualTo(5L);
    }

    @Test
    void 기준월_칸이_비어_있으면_version은_null() {
        List<LoadRecord> rec = allReady();
        rec.set(0, addr("ti_spbd_buld", " ", "READY", null));
        RefDataset b = of(run(rec), "building");
        assertThat(b.version()).isNull();
        assertThat(b.status()).isEqualTo("READY");
        assertThat(b.stale()).isFalse();   // 기준일도 기준월도 없으면 판단하지 않는다
    }

    // ---------------------------------------------------------------- 오래됨 경계

    @Test
    void 주소_자료는_기준일로부터_100일_넘으면_오래됨_딱_100일은_아님() {
        for (int days : new int[]{99, 100, 101}) {
            List<LoadRecord> rec = allReady();
            rec.set(0, addr("ti_spbd_buld", "2026-07", "READY", TODAY.minusDays(days)));
            assertThat(of(run(rec), "building").stale()).as(days + "일").isEqualTo(days > 100);
        }
    }

    @Test
    void 지적도는_가장_이른_기준일로_400일_넘으면_오래됨() {
        for (int days : new int[]{399, 400, 401}) {
            List<LoadRecord> rec = new ArrayList<>(allReady().subList(0, 3));
            rec.add(parcel("11", "2025-10", "READY", TODAY.minusDays(days), 1));
            rec.add(parcel("36", "2026-10", "READY", TODAY.minusDays(5), 1));   // 새 시도가 있어도 가장 이른 값으로 판정
            assertThat(of(run(rec), "parcel").stale()).as(days + "일").isEqualTo(days > 400);
        }
    }

    @Test
    void 기준일이_없으면_기준월의_말일로_센다() {
        // 2026-07 말일 = 07-31, +100일 = 11-08
        assertThat(RefStatusService.stale(null, "2026-07", 100, LocalDate.of(2026, 11, 8))).isFalse();
        assertThat(RefStatusService.stale(null, "2026-07", 100, LocalDate.of(2026, 11, 9))).isTrue();
        assertThat(RefStatusService.stale(null, "2024-02", 100, LocalDate.of(2024, 6, 8))).isFalse();   // 윤년 2월 말일 02-29 + 100일 = 06-08
        assertThat(RefStatusService.stale(null, "2024-02", 100, LocalDate.of(2024, 6, 9))).isTrue();
        assertThat(RefStatusService.stale(null, "unknown", 100, TODAY)).isFalse();
        assertThat(RefStatusService.stale(null, "2026-13", 100, TODAY)).isFalse();
        assertThat(RefStatusService.stale(null, null, 100, TODAY)).isFalse();
        // 기준일이 있으면 기준월보다 기준일이 우선
        assertThat(RefStatusService.stale(TODAY, "2000-01", 100, TODAY)).isFalse();
    }

    @Test
    void 오래됨_기준_일수는_설정을_따른다() {
        props.getRef().getStaleDays().setAddress(30);
        props.getRef().getStaleDays().setParcel(10);
        List<LoadRecord> rec = new ArrayList<>(allReady());
        RefStatusResponse r = run(rec);
        assertThat(of(r, "building").staleAfterDays()).isEqualTo(30);
        assertThat(of(r, "building").stale()).isTrue();      // 기준일 2026-09-01 → 69일
        assertThat(of(r, "parcel").staleAfterDays()).isEqualTo(10);
        assertThat(of(r, "parcel").stale()).isTrue();        // 기준일 2026-10-01 → 39일
    }

    @Test
    void 기본_설정은_100일_400일() {
        assertThat(new MyMapProperties().getRef().getStaleDays().getAddress()).isEqualTo(100);
        assertThat(new MyMapProperties().getRef().getStaleDays().getParcel()).isEqualTo(400);
    }

    // ---------------------------------------------------------------- 응답 JSON·컨트롤러

    @Test
    void 응답_JSON은_시각_날짜가_문자열이고_null_칸도_자리를_지킨다() {
        // 일부러 Boot 기본 설정이 아닌 ObjectMapper(날짜를 숫자로 내보내는 기본값)로 — @JsonFormat이 문자열을 보장해야 한다
        ObjectMapper om = new ObjectMapper().registerModule(new JavaTimeModule());
        JsonNode data = om.valueToTree(run(allReady()));
        assertThat(data.get("checkedAt").asText()).isEqualTo("2026-11-09T14:03:00+09:00");
        JsonNode b = data.get("datasets").get(0);
        assertThat(b.get("baseDate").asText()).isEqualTo("2026-09-01");
        assertThat(b.get("loadedAt").asText()).isEqualTo("2026-10-05T02:30:45+09:00");
        assertThat(b.get("stale").isBoolean()).isTrue();
        assertThat(b.get("rowCount").isNumber()).isTrue();
        assertThat(b.has("coverage")).isTrue();
        assertThat(b.get("coverage").isNull()).isTrue();
        assertThat(data.get("datasets").get(3).get("coverage").get("nationwide").asBoolean()).isTrue();

        JsonNode missing = om.valueToTree(run(List.of())).get("datasets").get(0);
        for (String f : List.of("version", "latestVersion", "baseDate", "loadedAt", "rowCount", "coverage")) {
            assertThat(missing.has(f)).as(f).isTrue();
            assertThat(missing.get(f).isNull()).as(f).isTrue();
        }
    }

    @Test
    void GET_status_는_60초_private_캐시와_봉투() throws Exception {
        RefStatusService svc = new RefStatusService(new FakeRefLoadMetaReader(allReady()), props, CLOCK);
        ObjectMapper om = new ObjectMapper().registerModule(new JavaTimeModule());
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new ParcelRefController(mock(ParcelBuildingService.class), mock(PnuAddressService.class), svc))
                .setControllerAdvice(new GlobalExceptionHandler())
                .setMessageConverters(new MappingJackson2HttpMessageConverter(om)).build();
        mvc.perform(get("/api/mymap/ref/status")).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "max-age=60, private"))
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.datasets.length()").value(4))
                .andExpect(jsonPath("$.data.datasets[0].id").value("building"))
                .andExpect(jsonPath("$.data.datasets[3].coverage.expectedSidoCount").value(16))
                .andExpect(jsonPath("$.data.checkedAt").value("2026-11-09T14:03:00+09:00"));
    }
}
