package com.gtp.domain.mymap.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.databind.JsonNode;

import java.time.OffsetDateTime;

/**
 * U28·U29 응답. view는 저장한 시작 화면 JSON 그대로(서버는 내용을 해석하지 않는다), 저장한 적 없으면 null이고 updatedAt도 null.
 *
 * @param updatedAt 서버 저장 시각(ISO-8601 + 시간대, Asia/Seoul)
 */
public record StartViewResponse(
        JsonNode view,
        @JsonFormat(shape = JsonFormat.Shape.STRING) OffsetDateTime updatedAt) {

    public static StartViewResponse none() {
        return new StartViewResponse(null, null);
    }
}
