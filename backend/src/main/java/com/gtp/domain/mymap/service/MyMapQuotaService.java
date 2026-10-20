package com.gtp.domain.mymap.service;

import com.gtp.domain.mymap.config.MyMapProperties;
import com.gtp.domain.mymap.dto.MyMapQuotaResponse;
import com.gtp.domain.mymap.port.Coverage;
import com.gtp.domain.mymap.port.PnuParcelProvider;
import com.gtp.domain.mymap.repository.UserMapRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;

/** 업로드 한도·내 레이어 수·지적도 기준월(U14). 업로드 화면이 열릴 때 부른다. */
@Slf4j
@Service
@RequiredArgsConstructor
public class MyMapQuotaService {

    private final UserMapRepository userMapRepository;
    private final PnuParcelProvider parcelProvider;
    private final MyMapProperties props;

    public MyMapQuotaResponse quota(String userId) {
        MyMapProperties.Limits lim = props.getLimits();
        Coverage loadedCoverage = Coverage.unavailable();
        try {
            loadedCoverage = parcelProvider.coverage();
        } catch (RuntimeException e) {
            log.warn("[나만의지도] 지적도 적재 범위를 읽지 못했습니다: {}", e.getMessage());
        }
        final Coverage coverage = loadedCoverage;
        List<String> restricted = List.copyOf(props.getRef().getAllowedSidoCodes());
        // 실제로 매칭에 쓸 수 있는 시도 = 적재된 시도(지역 제한이 있으면 그 안에서만)
        List<String> sidos = coverage.versionBySido().keySet().stream()
                .filter(s -> restricted.isEmpty() || restricted.contains(s))
                .sorted().toList();
        String version = coverage.versionFor(sidos);
        List<MyMapQuotaResponse.LoadedSido> loaded = sidos.stream()
                .map(s -> MyMapQuotaResponse.LoadedSido.builder().sido(s).version(coverage.versionBySido().get(s)).build()).toList();
        List<String> expected = props.getRef().getExpectedSidoCodes();
        boolean nationwide = restricted.isEmpty() && !expected.isEmpty() && coverage.versionBySido().keySet().containsAll(expected);
        return MyMapQuotaResponse.builder()
                .ownedLayers((int) userMapRepository.countByOwnerId(userId))
                .maxLayers(lim.getMaxLayersPerUser())
                .maxRows(MyMapQuotaResponse.MaxRows.builder()
                        .pnu(lim.getMaxRowsPnu()).address(lim.getMaxRowsAddress()).coord(lim.getMaxRowsCoord()).build())
                .maxShpFeatures(lim.getMaxShpFeatures())
                .maxExcelMb(lim.getMaxExcelMb())
                .maxShpMb(lim.getMaxShpMb())
                .coverage(MyMapQuotaResponse.Coverage.builder().sidoCodes(sidos).parcelVersion(version).loaded(loaded)
                        .nationwide(nationwide).restrictedSidoCodes(restricted).build())
                .build();
    }
}
