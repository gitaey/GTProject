package com.gtp.domain.mymap.controller;

import com.gtp.domain.mymap.dto.ParcelBuildingsResponse;
import com.gtp.domain.mymap.dto.PnuAddressRequest;
import com.gtp.domain.mymap.dto.PnuAddressResponse;
import com.gtp.domain.mymap.dto.RefStatusResponse;
import com.gtp.domain.mymap.service.ParcelBuildingService;
import com.gtp.domain.mymap.service.PnuAddressService;
import com.gtp.domain.mymap.service.RefStatusService;
import com.gtp.global.gis.GisErrorCode;
import com.gtp.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;

/**
 * 건물DB 참조 자료 읽기 API(필지 정보 카드, PNU → 주소 엑셀). 모든 경로가 /api/mymap/** 아래라 SecurityConfig의 authenticated() 규칙이 그대로 적용된다
 * (새 경로를 이 밖에 만들지 말 것 — SecurityContractTest가 확인한다).
 */
@RestController
@RequestMapping("/api/mymap/ref")
@RequiredArgsConstructor
public class ParcelRefController {

    private final ParcelBuildingService parcelBuildingService;
    private final PnuAddressService pnuAddressService;
    private final RefStatusService refStatusService;

    /**
     * U27. 참조 자료(건물DB 3종·연속지적도) 적재 상태 — 설정 패널의 "데이터 기준 정보". 읽기 전용(SELECT 1회).
     * 로그인만 확인하고 역할은 보지 않는다. 적재 기록을 읽지 못해도 200 + 항목 UNAVAILABLE. 60초 private 캐시.
     */
    @GetMapping("/status")
    public ResponseEntity<ApiResponse<RefStatusResponse>> status() {
        RefStatusResponse body = refStatusService.status();
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofSeconds(60)).cachePrivate())
                .body(ApiResponse.ok(body));
    }

    /** U25. 필지(PNU)에 걸린 건물. limit은 1~1000(기본 200) — 숫자가 아니면 400이라 문자열로 받아 서비스가 검사한다. */
    @GetMapping("/parcels/{pnu}/buildings")
    public ResponseEntity<ApiResponse<ParcelBuildingsResponse>> buildings(@PathVariable String pnu,
                                                                          @RequestParam(required = false) String limit) {
        ParcelBuildingsResponse body = parcelBuildingService.buildings(pnu, limit);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)).cachePrivate())
                .body(ApiResponse.ok(body));
    }

    /**
     * U26. PNU 묶음(1~500개) → 지번·도로명주소. 본문이 없거나 JSON이 깨졌거나 pnus 형식이 틀리면 400(PNU_ADDRESS_INVALID).
     * POST라 캐시하지 않는다(no-store). 로그인만 확인하고 역할은 보지 않는다(필지 정보 카드와 같다).
     */
    @PostMapping("/pnu-addresses")
    public ResponseEntity<ApiResponse<PnuAddressResponse>> pnuAddresses(@RequestBody(required = false) PnuAddressRequest req) {
        PnuAddressResponse body = pnuAddressService.lookup(req);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(ApiResponse.ok(body));
    }

    /**
     * 전역 핸들러는 깨진 본문·JSON 아닌 Content-Type을 500으로 바꾸므로, 이 컨트롤러에서는 계약대로 400으로 돌려준다
     * (이 컨트롤러에서 본문을 받는 요청은 U26뿐이다).
     */
    @ExceptionHandler({HttpMessageNotReadableException.class, HttpMediaTypeNotSupportedException.class})
    public ResponseEntity<ApiResponse<?>> badBody(Exception e) {
        return ResponseEntity.status(GisErrorCode.PNU_ADDRESS_INVALID.getStatus())
                .body(ApiResponse.fail(GisErrorCode.PNU_ADDRESS_INVALID.getMessage()));
    }
}
