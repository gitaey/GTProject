package com.gtp.domain.mymap.service;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gtp.domain.mymap.dto.StartViewResponse;
import com.gtp.domain.mymap.infra.StartViewStore;
import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import com.gtp.global.gis.GisUserContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.Set;

/**
 * U28~U30 내 지도 시작 화면 조회·저장·삭제. 사용자는 항상 {@link GisUserContext#currentUserId()}로만 정한다(경로·본문에 id 없음).
 *
 * 저장 검사는 <b>형식·크기만</b>이다(좌표 범위·줌 같은 내용은 서버가 해석하지 않는다 — 클라이언트 parseStartView 몫):
 * 본문 ≤ 8,192바이트 → JSON 객체 → version은 아는 정수 → panes는 객체 1~4개. 통과하면 정규화(공백 제거)한 문자열을 저장하고,
 * 모르는 키는 그대로 둔다.
 */
@Slf4j
@Service
public class StartViewService {

    /** 시작 화면 JSON 최대 바이트(4분할이 약 600바이트). 표의 CHECK 제약과 같은 값 */
    public static final int MAX_BYTES = 8192;
    /** 서버가 아는 version 값 */
    static final Set<Integer> KNOWN_VERSIONS = Set.of(1);
    static final int MIN_PANES = 1;
    static final int MAX_PANES = 4;

    private final StartViewStore store;
    private final GisUserContext users;
    private final ObjectMapper mapper;

    public StartViewService(StartViewStore store, GisUserContext users, ObjectMapper mapper) {
        this.store = store;
        this.users = users;
        this.mapper = mapper;
    }

    public StartViewResponse get() {
        String userId = userId();
        Optional<StartViewStore.Stored> found = store.find(userId);
        if (found.isEmpty()) return StartViewResponse.none();
        StartViewStore.Stored row = found.get();
        try {
            return new StartViewResponse(mapper.readTree(row.viewJson()), row.updatedAt());
        } catch (JsonProcessingException e) {
            // 저장할 때 검사했으므로 손으로 고친 경우뿐 — 저장값 없음으로 보이게 하면 사용자가 다시 저장해 복구한다
            log.warn("[나만의지도] 저장된 시작 화면을 JSON으로 읽지 못해 없는 것으로 답합니다: {}", e.getClass().getSimpleName());
            return StartViewResponse.none();
        }
    }

    /** @param body 요청 본문 바이트(컨트롤러가 최대 MAX_BYTES+1까지만 읽어 온다) */
    public StartViewResponse save(byte[] body) {
        String userId = userId();
        if (body == null || body.length > MAX_BYTES) throw new CustomException(GisErrorCode.START_VIEW_TOO_LARGE);

        JsonNode node = parse(body);
        int version = validate(node);

        String normalized;
        try {
            normalized = mapper.writeValueAsString(node);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("시작 화면 JSON을 다시 직렬화하지 못했습니다", e);
        }
        // 숫자 표기가 바뀌면(1e2 → 100.0) 정규화 결과가 조금 커질 수 있다 — 표의 CHECK에 걸리기 전에 막는다
        if (normalized.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) {
            throw new CustomException(GisErrorCode.START_VIEW_TOO_LARGE);
        }
        return new StartViewResponse(node, store.save(userId, normalized, version));
    }

    public void delete() {
        store.delete(userId());
    }

    // ---------------------------------------------------------------- 검사

    /** 끝에 군더더기가 붙었거나(`{} x`) 같은 키가 두 번 나오면 형식 오류 */
    private JsonNode parse(byte[] body) {
        try (JsonParser p = mapper.getFactory().createParser(body)) {
            p.enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION);
            JsonNode node = mapper.readTree(p);
            if (node == null || p.nextToken() != null) throw invalid();
            return node;
        } catch (IOException e) {
            throw invalid();
        }
    }

    /** @return version 값 */
    private static int validate(JsonNode root) {
        if (!root.isObject()) throw invalid();
        JsonNode v = root.get("version");
        if (v == null || !v.isIntegralNumber() || !v.canConvertToInt() || !KNOWN_VERSIONS.contains(v.intValue())) throw invalid();
        JsonNode panes = root.get("panes");
        if (panes == null || !panes.isArray() || panes.size() < MIN_PANES || panes.size() > MAX_PANES) throw invalid();
        for (JsonNode pane : panes) {
            if (!pane.isObject()) throw invalid();
        }
        return v.intValue();
    }

    private static CustomException invalid() {
        return new CustomException(GisErrorCode.START_VIEW_INVALID);
    }

    private String userId() {
        String id = users.currentUserId();
        if (id == null || id.isBlank()) throw new CustomException(GisErrorCode.UNAUTHORIZED);
        return id;
    }
}
