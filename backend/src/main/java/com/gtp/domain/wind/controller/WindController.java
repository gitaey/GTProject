package com.gtp.domain.wind.controller;

import com.gtp.domain.wind.dto.WindFrameMeta;
import com.gtp.domain.wind.entity.WindFrameEntity;
import com.gtp.domain.wind.repository.WindFrameRepository;
import com.gtp.global.exception.CustomException;
import com.gtp.global.exception.ErrorCode;
import com.gtp.global.response.ApiResponse;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;

@RestController
@RequestMapping("/api/wind")
@RequiredArgsConstructor
public class WindController {

    private final WindFrameRepository windFrameRepository;
    private final com.gtp.domain.wind.service.WindDataService windDataService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    /** 수동 갱신 트리거 (관리자용, 장애 시 즉시 재시도 목적) */
    @PostMapping("/refresh")
    public ApiResponse<Void> refresh() {
        windDataService.refresh();
        return ApiResponse.ok(null);
    }

    /** 사용 가능한 프레임 목록 (시간별 예보 스텝 메타데이터) */
    @GetMapping("/frames")
    public ApiResponse<List<WindFrameMeta>> getFrames() {
        List<WindFrameMeta> frames = windFrameRepository.findAllByOrderByForecastHourAsc()
                .stream().map(WindFrameMeta::new).toList();
        return ApiResponse.ok(frames);
    }

    /** 현재 시각(UTC)에 해당하는 프레임의 바람 데이터(grib2json 포맷) */
    @GetMapping("/latest")
    public ApiResponse<JsonNode> getLatest() throws Exception {
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        List<WindFrameEntity> candidates = windFrameRepository.findCurrentCandidates(now);
        WindFrameEntity frame = candidates.isEmpty()
                ? windFrameRepository.findFirstByOrderByValidTimeAsc()
                    .orElseThrow(() -> new CustomException(ErrorCode.NOT_FOUND))
                : candidates.get(0);

        return ApiResponse.ok(objectMapper.readTree(frame.getDataJson()));
    }

    /** 특정 프레임(시간별 스텝)의 바람 데이터 */
    @GetMapping("/frames/{id}")
    public ApiResponse<JsonNode> getFrame(@PathVariable Long id) throws Exception {
        WindFrameEntity frame = windFrameRepository.findById(id)
                .orElseThrow(() -> new CustomException(ErrorCode.NOT_FOUND));
        return ApiResponse.ok(objectMapper.readTree(frame.getDataJson()));
    }
}
