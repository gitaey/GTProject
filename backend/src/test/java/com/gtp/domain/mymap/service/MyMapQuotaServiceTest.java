package com.gtp.domain.mymap.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.gtp.domain.mymap.config.MyMapProperties;
import com.gtp.domain.mymap.dto.MyMapQuotaResponse;
import com.gtp.domain.mymap.infra.FakePnuParcelProvider;
import com.gtp.domain.mymap.port.Coverage;
import com.gtp.domain.mymap.port.PnuParcelProvider;
import com.gtp.domain.mymap.repository.UserMapRepository;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class MyMapQuotaServiceTest {

    private static PnuParcelProvider loaded(Map<String, String> versions, Set<String> swapping) {
        PnuParcelProvider p = mock(PnuParcelProvider.class);
        when(p.coverage()).thenReturn(new Coverage(versions, swapping));
        return p;
    }

    private MyMapQuotaResponse quota(PnuParcelProvider provider, MyMapProperties props) {
        return new MyMapQuotaService(mock(UserMapRepository.class), provider, props).quota("alice");
    }

    @Test
    void 한도_내_레이어_수() {
        UserMapRepository repo = mock(UserMapRepository.class);
        when(repo.countByOwnerId("alice")).thenReturn(7L);
        MyMapQuotaResponse q = new MyMapQuotaService(repo, FakePnuParcelProvider.fromClasspath(new ObjectMapper()), new MyMapProperties()).quota("alice");

        assertThat(q.getOwnedLayers()).isEqualTo(7);
        assertThat(q.getMaxLayers()).isEqualTo(20);
        assertThat(q.getMaxRows().getPnu()).isEqualTo(5000);
        assertThat(q.getMaxRows().getAddress()).isEqualTo(5000);
        assertThat(q.getMaxRows().getCoord()).isEqualTo(5000);
        assertThat(q.getMaxShpFeatures()).isEqualTo(100000);
        assertThat(q.getMaxExcelMb()).isEqualTo(10);
        assertThat(q.getMaxShpMb()).isEqualTo(300);
    }

    @Test
    void 세종만_적재되면_제공_범위는_세종_하나이고_전국이_아니다() {
        MyMapQuotaResponse.Coverage c = quota(loaded(Map.of("36", "2026-10"), Set.of()), new MyMapProperties()).getCoverage();
        assertThat(c.getSidoCodes()).containsExactly("36");
        assertThat(c.getParcelVersion()).isEqualTo("2026-10");
        assertThat(c.getLoaded()).hasSize(1);
        assertThat(c.getLoaded().get(0).getSido()).isEqualTo("36");
        assertThat(c.getLoaded().get(0).getVersion()).isEqualTo("2026-10");
        assertThat(c.isNationwide()).isFalse();            // 화면이 "(전국)"이라고 말하면 안 된다
        assertThat(c.getRestrictedSidoCodes()).isEmpty();
    }

    @Test
    void 적재가_없으면_빈_목록_기준월_null() {
        MyMapQuotaResponse.Coverage c = quota(loaded(Map.of(), Set.of()), new MyMapProperties()).getCoverage();
        assertThat(c.getSidoCodes()).isEmpty();
        assertThat(c.getLoaded()).isEmpty();
        assertThat(c.getParcelVersion()).isNull();
        assertThat(c.isNationwide()).isFalse();
    }

    @Test
    void 일부만_적재되면_적재된_시도와_시도별_기준월을_오름차순으로() {
        Map<String, String> v = Map.of("41", "2026-09", "11", "2026-10", "36", "2026-10");
        MyMapQuotaResponse.Coverage c = quota(loaded(v, Set.of()), new MyMapProperties()).getCoverage();
        assertThat(c.getSidoCodes()).containsExactly("11", "36", "41");
        assertThat(c.getLoaded()).extracting(MyMapQuotaResponse.LoadedSido::getSido).containsExactly("11", "36", "41");
        assertThat(c.getLoaded()).extracting(MyMapQuotaResponse.LoadedSido::getVersion).containsExactly("2026-10", "2026-10", "2026-09");
        assertThat(c.getParcelVersion()).isEqualTo("2026-09");   // 가장 이른 기준월
        assertThat(c.isNationwide()).isFalse();
    }

    @Test
    void 교체_중인_시도도_적재된_것으로_본다() {
        MyMapQuotaResponse.Coverage c = quota(loaded(Map.of("36", "2026-10", "11", "2026-09"), Set.of("11")), new MyMapProperties()).getCoverage();
        assertThat(c.getSidoCodes()).containsExactly("11", "36");
    }

    @Test
    void 전국_기준_16개가_모두_적재되면_nationwide() {
        MyMapProperties p = new MyMapProperties();
        Map<String, String> all = new java.util.HashMap<>();
        p.getRef().getExpectedSidoCodes().forEach(s -> all.put(s, "2026-10"));
        assertThat(p.getRef().getExpectedSidoCodes()).hasSize(16).contains("12", "36").doesNotContain("29", "46");
        MyMapQuotaResponse.Coverage c = quota(loaded(all, Set.of()), p).getCoverage();
        assertThat(c.isNationwide()).isTrue();
        assertThat(c.getSidoCodes()).hasSize(16);

        all.remove("50");   // 제주 하나만 빠져도 전국이 아니다
        assertThat(quota(loaded(all, Set.of()), p).getCoverage().isNationwide()).isFalse();
    }

    @Test
    void 지역_제한이_있으면_그_안의_적재_시도만_알리고_전국은_아니다() {
        MyMapProperties p = new MyMapProperties();
        p.getRef().setAllowedSidoCodes(List.of("36", "30"));
        Map<String, String> v = new java.util.HashMap<>();
        p.getRef().getExpectedSidoCodes().forEach(s -> v.put(s, "2026-10"));   // 전국이 다 적재돼 있어도
        MyMapQuotaResponse.Coverage c = quota(loaded(v, Set.of()), p).getCoverage();
        assertThat(c.getSidoCodes()).containsExactly("30", "36");
        assertThat(c.getRestrictedSidoCodes()).containsExactly("36", "30");
        assertThat(c.isNationwide()).isFalse();
        // 제한 목록 중 적재 안 된 시도는 빠진다
        assertThat(quota(loaded(Map.of("36", "2026-10"), Set.of()), p).getCoverage().getSidoCodes()).containsExactly("36");
    }

    @Test
    void 기준월은_지역_제한_안의_시도만으로_정한다() {
        MyMapProperties p = new MyMapProperties();
        p.getRef().setAllowedSidoCodes(List.of("36"));
        // 제한 밖(11)이 더 오래된 기준월이어도 화면에 보이는 범위(36)의 기준월을 알린다
        MyMapQuotaResponse.Coverage c = quota(loaded(Map.of("36", "2026-10", "11", "2026-08"), Set.of()), p).getCoverage();
        assertThat(c.getSidoCodes()).containsExactly("36");
        assertThat(c.getParcelVersion()).isEqualTo("2026-10");
    }

    @Test
    void 가짜_provider는_전국처럼_FAKE_기준월() {
        MyMapQuotaResponse.Coverage c = quota(FakePnuParcelProvider.fromClasspath(new ObjectMapper()), new MyMapProperties()).getCoverage();
        assertThat(c.getParcelVersion()).isEqualTo("FAKE");
        assertThat(c.isNationwide()).isTrue();
    }

    @Test
    void 설정한_한도가_그대로_나간다() {
        MyMapProperties p = new MyMapProperties();
        p.getLimits().setMaxLayersPerUser(3);
        p.getLimits().setMaxRowsPnu(11);
        p.getLimits().setMaxRowsAddress(22);
        p.getLimits().setMaxRowsCoord(33);
        p.getLimits().setMaxShpFeatures(44);
        p.getLimits().setMaxExcelMb(5);
        p.getLimits().setMaxShpMb(6);
        MyMapQuotaResponse q = new MyMapQuotaService(mock(UserMapRepository.class), FakePnuParcelProvider.fromClasspath(new ObjectMapper()), p).quota("a");
        assertThat(q.getMaxLayers()).isEqualTo(3);
        assertThat(q.getMaxRows().getPnu()).isEqualTo(11);
        assertThat(q.getMaxRows().getAddress()).isEqualTo(22);
        assertThat(q.getMaxRows().getCoord()).isEqualTo(33);
        assertThat(q.getMaxShpFeatures()).isEqualTo(44);
        assertThat(q.getMaxExcelMb()).isEqualTo(5);
        assertThat(q.getMaxShpMb()).isEqualTo(6);
    }

    @Test
    void 적재_범위를_못_읽어도_한도는_내려준다() {
        PnuParcelProvider broken = mock(PnuParcelProvider.class);
        when(broken.coverage()).thenThrow(new IllegalStateException("db down"));
        MyMapQuotaResponse q = quota(broken, new MyMapProperties());
        assertThat(q.getCoverage().getParcelVersion()).isNull();
        assertThat(q.getCoverage().getSidoCodes()).isEmpty();
        assertThat(q.getCoverage().isNationwide()).isFalse();
        assertThat(q.getMaxLayers()).isEqualTo(20);

        PnuParcelProvider none = mock(PnuParcelProvider.class);
        when(none.coverage()).thenReturn(Coverage.unavailable());
        assertThat(quota(none, new MyMapProperties()).getCoverage().getParcelVersion()).isNull();
    }
}
