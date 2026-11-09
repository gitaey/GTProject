package com.gtp.domain.mymap.controller;

import com.gtp.domain.mymap.dto.StartViewResponse;
import com.gtp.domain.mymap.service.StartViewService;
import com.gtp.global.response.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;

/**
 * U28~U30 내 지도 시작 화면(계정 저장). /api/mymap/** 아래라 SecurityConfig의 authenticated() 규칙이 그대로 적용된다
 * (이 밖으로 옮기면 anyRequest().permitAll()로 열린다 — SecurityContractTest가 확인한다). 역할은 보지 않는다.
 *
 * 경로에 사용자 id가 없고, 서비스가 토큰의 사용자로만 행을 고른다 → 남의 것을 읽거나 쓸 방법이 없다.
 * 개인 값이라 세 응답 모두 no-store(같은 브라우저에서 사용자가 바뀌어도 이전 응답을 재사용하지 않는다).
 * UserMapController의 /{id}(PATCH·DELETE)와 같은 깊이지만 Spring은 글자 그대로인 경로를 먼저 고른다.
 */
@RestController
@RequestMapping("/api/mymap/start-view")
@RequiredArgsConstructor
public class StartViewController {

    private final StartViewService service;

    /** U28. 저장한 적 없으면 200 + {view: null, updatedAt: null} (404가 아니다 — 콘솔 오류를 만들지 않는다) */
    @GetMapping
    public ResponseEntity<ApiResponse<StartViewResponse>> get() {
        return noStore(ApiResponse.ok(service.get()));
    }

    /**
     * U29. 본문 = 시작 화면 JSON. @RequestBody 변환기를 거치지 않고 바이트를 직접 읽는다 — 깨진 JSON·낯선 Content-Type이
     * 전역 핸들러에서 500이 되지 않고 서비스의 400(START_VIEW_INVALID)이 되며, 8KB를 넘는 본문은 더 읽지 않고 413으로 끝낸다.
     */
    @PutMapping
    public ResponseEntity<ApiResponse<StartViewResponse>> put(HttpServletRequest request) throws IOException {
        byte[] body = request.getInputStream().readNBytes(StartViewService.MAX_BYTES + 1);
        return noStore(ApiResponse.ok(service.save(body)));
    }

    /** U30. 저장값이 없어도 200(멱등) */
    @DeleteMapping
    public ResponseEntity<ApiResponse<Void>> delete() {
        service.delete();
        return noStore(ApiResponse.ok(null));
    }

    private static <T> ResponseEntity<ApiResponse<T>> noStore(ApiResponse<T> body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
