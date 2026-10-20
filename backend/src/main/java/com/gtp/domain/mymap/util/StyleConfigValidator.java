package com.gtp.domain.mymap.util;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;

import java.nio.charset.StandardCharsets;

/** styleConfig는 서버가 내용을 해석하지 않는다 — 크기(16KB 이하)와 "JSON 객체"인지만 본다. */
public final class StyleConfigValidator {

    public static final int MAX_BYTES = 16 * 1024;
    private static final ObjectMapper OM = new ObjectMapper();

    private StyleConfigValidator() {
    }

    /** 비어 있으면(null·공백) 통과 — 호출하는 쪽이 "그대로/지움"을 정한다. */
    public static void validate(String json) {
        if (json == null || json.isBlank()) return;
        if (json.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) {
            throw new CustomException(GisErrorCode.MYMAP_STYLE_INVALID);
        }
        try {
            JsonNode node = OM.readTree(json);
            if (node == null || !node.isObject()) throw new CustomException(GisErrorCode.MYMAP_STYLE_INVALID);
        } catch (CustomException e) {
            throw e;
        } catch (Exception e) {
            throw new CustomException(GisErrorCode.MYMAP_STYLE_INVALID);
        }
    }
}
