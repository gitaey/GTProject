package com.gtp.domain.mymap.model;

/**
 * 엑셀 행이 지도에 오르지 못한 사유(보고서·실패 행 엑셀 공통). 코드는 DB({@code reason_code})와 API에 그대로 나간다.
 * 주소 계열(PARSE_FAILED~AMBIGUOUS)은 2단계(주소 엑셀)에서 쓰며, 지금은 정의만 둔다.
 */
public enum ImportFailureReason {
    EMPTY("값이 비어 있습니다"),
    PNU_NUMERIC_CELL("숫자 서식이라 PNU가 바뀌었습니다(텍스트 서식으로 바꿔 주세요)"),
    PNU_EXP_NOTATION("지수 표기(예: 1.11E+18)로 바뀐 PNU입니다(텍스트 서식으로 바꿔 주세요)"),
    PNU_FORMAT("PNU가 19자리 숫자가 아닙니다"),
    PARSE_FAILED("주소 형식을 알 수 없습니다"),
    SIDO_UNKNOWN("시도를 모릅니다"),
    LEGAL_DONG_NOT_FOUND("법정동을 찾지 못했습니다"),
    JIBUN_MISSING("번지가 없습니다"),
    ROAD_NOT_FOUND("도로명을 찾지 못했습니다"),
    BUILDING_NO_NOT_FOUND("건물번호를 찾지 못했습니다"),
    AMBIGUOUS("후보가 여러 개입니다(시도·시군구를 붙여 주세요)"),
    OUT_OF_COVERAGE("이 지역 지적도는 아직 제공하지 않습니다"),
    PARCEL_NOT_FOUND("지적도에 없는 필지입니다(지번 변경·말소 가능)"),
    COORD_INVALID("좌표를 읽을 수 없습니다"),
    COORD_OUT_OF_RANGE("한국 범위를 벗어난 좌표입니다"),
    ROW_LIMIT("한도를 넘는 행입니다");

    private final String message;

    ImportFailureReason(String message) {
        this.message = message;
    }

    public String message() {
        return message;
    }

    /** DB에 남은 코드가 나중에 지워진 값이어도 보고서가 죽지 않게 한다. */
    public static String messageOf(String code) {
        for (ImportFailureReason r : values()) {
            if (r.name().equals(code)) return r.message;
        }
        return code;
    }
}
