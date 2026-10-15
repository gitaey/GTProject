package com.gtp.domain.wind.controller;

import com.fasterxml.jackson.databind.util.RawValue;
import com.gtp.domain.wind.dto.WindFrameMeta;
import com.gtp.domain.wind.repository.WindFrameRepository;
import com.gtp.domain.wind.repository.WindScalarRepository;
import com.gtp.domain.wind.service.WindDataService;
import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import com.gtp.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.context.request.WebRequest;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Slf4j
@RestController
@RequestMapping("/api/wind")
@RequiredArgsConstructor
public class WindController {

    /* 프레임 id별 내용은 바뀌지 않는다(IDENTITY — id를 다시 쓰지 않고, 내용을 고치지 않는다). 그래서 오래·immutable로 캐시한다.
       지워진 id는 캐시에 남아도 무해하다(프론트가 목록을 다시 받으면 새 id를 쓴다) */
    private static final Duration FRAME_CACHE = Duration.ofDays(1);

    private final WindFrameRepository windFrameRepository;
    private final WindScalarRepository windScalarRepository;
    private final WindDataService windDataService;

    /* 사이클이 "완전하다"는 기준(사이클당 예보시간 수). WindDataService와 같은 설정 */
    @Value("${wind.forecast-hours}")
    private int forecastHours;

    /** 수동 갱신 트리거 (관리자용 — SecurityConfig가 SUPER_ADMIN·MAP_ADMIN만 허용, 장애 시 즉시 재시도 목적). 최신 사이클이 완전하면 내려받지 않고 옛 사이클 정리만 한다 */
    @PostMapping("/refresh")
    public ApiResponse<Void> refresh() {
        windDataService.refresh();
        return ApiResponse.ok(null);
    }

    /**
     * 최신 "완전한" 사이클(예보시간 forecastHours개가 모두 있는 사이클)의 프레임 목록 — 바람 데이터 본문은 읽지 않는다.
     * 완전한 사이클이 아직 없으면(첫 설치·forecast-hours를 늘린 직후) 가장 늦은 사이클을 그대로 준다. 다운로드 중인 미완성 사이클은 내려주지 않는다.
     */
    @GetMapping("/frames")
    public ApiResponse<List<WindFrameMeta>> getFrames() {
        List<Object[]> keys = windFrameRepository.findCompleteCycleKeysDesc(forecastHours, PageRequest.of(0, 1));
        if (keys.isEmpty()) keys = windFrameRepository.findCycleKeysDesc(PageRequest.of(0, 1));
        if (keys.isEmpty()) return ApiResponse.ok(List.of());
        LocalDate cycleDate = (LocalDate) keys.get(0)[0];
        int cycleHour = ((Number) keys.get(0)[1]).intValue();
        List<WindFrameMeta> metas = windFrameRepository.findMetaByCycle(cycleDate, cycleHour);
        attachFields(metas, cycleDate, cycleHour);
        return ApiResponse.ok(metas);
    }

    /**
     * 프레임마다 스칼라 변수 id(fields)를 붙인다 — 한 사이클의 키(예보시간·변수·id)를 한 번에 읽어 합친다(데이터 본문은 읽지 않는다).
     * wind.fields에서 끈 변수는 DB에 남아 있어도 내보내지 않는다. 스칼라 조회가 실패해도 바람 목록은 그대로 준다(fields는 비어 나간다).
     */
    private void attachFields(List<WindFrameMeta> metas, LocalDate cycleDate, int cycleHour) {
        try {
            Set<String> allowed = windDataService.configuredVarCodes();
            if (allowed.isEmpty()) return;
            Map<Integer, WindFrameMeta> byHour = new HashMap<>();
            for (WindFrameMeta m : metas) byHour.put(m.getForecastHour(), m);
            for (Object[] row : windScalarRepository.findKeysByCycle(cycleDate, cycleHour)) {
                WindFrameMeta m = byHour.get(((Number) row[0]).intValue());
                String code = String.valueOf(row[1]);
                if (m == null || !allowed.contains(code)) continue;
                m.putField(code, ((Number) row[2]).longValue());
            }
        } catch (Exception e) {
            log.error("[바람길] 스칼라 변수 목록 조회 실패 — 바람 목록만 내려줌", e);
        }
    }

    /**
     * 현재 시각(UTC)에 해당하는 프레임의 바람 데이터(grib2json 포맷).
     * 같은 URL이 시간이 지나면 다른 프레임이 되므로 매번 id만 확인하는 조건부 요청(ETag)으로 캐시한다 — 바뀌지 않았으면 304로 본문을 보내지 않는다.
     */
    @GetMapping("/latest")
    public ResponseEntity<ApiResponse<RawValue>> getLatest(WebRequest request) {
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        List<Long> ids = windFrameRepository.findCurrentFrameIds(now, PageRequest.of(0, 1));
        if (ids.isEmpty()) ids = windFrameRepository.findOldestFrameIds(PageRequest.of(0, 1));
        Long id = ids.stream().findFirst().orElseThrow(() -> new CustomException(GisErrorCode.NOT_FOUND));
        if (request.checkNotModified("\"wind-" + id + "\"")) return null; // 304 — data_json을 읽지 않는다
        String json = windFrameRepository.findDataJsonById(id)
                .orElseThrow(() -> new CustomException(GisErrorCode.NOT_FOUND));
        return ResponseEntity.ok()
                .eTag("\"wind-" + id + "\"")
                .cacheControl(CacheControl.noCache())
                .body(ApiResponse.ok(new RawValue(json)));
    }

    /** 특정 프레임(시간별 스텝)의 바람 데이터 */
    @GetMapping("/frames/{id}")
    public ResponseEntity<ApiResponse<RawValue>> getFrame(@PathVariable Long id) {
        String json = windFrameRepository.findDataJsonById(id)
                .orElseThrow(() -> new CustomException(GisErrorCode.NOT_FOUND));
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(FRAME_CACHE).cachePublic().immutable())
                .body(ApiResponse.ok(new RawValue(json)));
    }

    /** 스칼라 변수(기온·습도·강수량) 한 장 — 단일 기록 JSON(정수 양자화, 값 = data × header.scale). id별 내용 불변이라 바람 프레임과 같이 immutable 캐시 */
    @GetMapping("/fields/{id}")
    public ResponseEntity<ApiResponse<RawValue>> getField(@PathVariable Long id) {
        String json = windScalarRepository.findDataJsonById(id)
                .orElseThrow(() -> new CustomException(GisErrorCode.NOT_FOUND));
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(FRAME_CACHE).cachePublic().immutable())
                .body(ApiResponse.ok(new RawValue(json)));
    }
}
