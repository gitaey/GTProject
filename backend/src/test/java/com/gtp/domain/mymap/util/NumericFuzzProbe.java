package com.gtp.domain.mymap.util;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;

import java.nio.file.Files;
import java.nio.file.Path;

/** 서버·프론트 숫자 판정 차분 시험용 실행기(수동): 입력 JSON 배열의 각 문자열을 NumericText로 읽어 [숫자|null] 배열을 출력 파일에 쓴다. 인자: 입력 출력 [trim] — 세 번째 인자가 trim이면 숫자 대신 {@link NumericText#jsTrim} 결과 글자를 쓴다 */
public final class NumericFuzzProbe {

    private NumericFuzzProbe() {
    }

    public static void main(String[] args) throws Exception {
        ObjectMapper om = new ObjectMapper();
        JsonNode in = om.readTree(Files.readString(Path.of(args[0])));
        ArrayNode out = om.createArrayNode();
        boolean trim = args.length > 2 && "trim".equals(args[2]);
        for (JsonNode n : in) {
            if (trim) {
                out.add(NumericText.jsTrim(n.asText()));
                continue;
            }
            Double v = NumericText.parse(n.asText());
            if (v == null) out.addNull();
            else out.add(v);
        }
        Files.writeString(Path.of(args[1]), om.writeValueAsString(out));
    }
}
