package com.gtp.global.gis;

import com.gtp.global.exception.BaseErrorCode;
import com.gtp.global.exception.CustomException;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

/**
 * 지도 도메인(map, mymap, geoserver, geotiff, wind) 전용 에러 코드.
 * 지도 모듈을 다른 프로젝트로 옮길 때 전역 ErrorCode 대신 이 enum만 가져가면 된다.
 * HttpStatus·메시지는 전역 ErrorCode에 있던 값과 같다.
 */
@Getter
@RequiredArgsConstructor
public enum GisErrorCode implements BaseErrorCode {
    NOT_FOUND(HttpStatus.NOT_FOUND, "리소스를 찾을 수 없습니다."),

    // 레이어
    LAYER_NOT_FOUND(HttpStatus.NOT_FOUND, "레이어를 찾을 수 없습니다."),
    LAYER_GROUP_NOT_FOUND(HttpStatus.NOT_FOUND, "레이어 그룹을 찾을 수 없습니다."),

    // GeoTIFF
    GEOTIFF_NOT_FOUND(HttpStatus.NOT_FOUND, "GeoTIFF 파일을 찾을 수 없습니다."),
    INVALID_FILE_TYPE(HttpStatus.BAD_REQUEST, "GeoTIFF(.tif, .tiff) 파일만 업로드 가능합니다."),
    FILE_UPLOAD_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "파일 업로드에 실패했습니다."),

    // 나만의지도
    USER_MAP_NOT_FOUND(HttpStatus.NOT_FOUND, "나만의지도를 찾을 수 없습니다."),
    USER_MAP_FORBIDDEN(HttpStatus.FORBIDDEN, "이 나만의지도에 대한 권한이 없습니다."),
    USER_MAP_NOT_READY(HttpStatus.CONFLICT, "아직 처리 중인 나만의지도입니다."),
    INVALID_SHP_FILE(HttpStatus.BAD_REQUEST, "shp 파일 세트(.shp/.shx/.dbf)가 올바르지 않습니다."),
    INVALID_EXCEL_FILE(HttpStatus.BAD_REQUEST, "엑셀(.xlsx) 파일만 업로드 가능합니다."),
    EXCEL_UPLOAD_NOT_FOUND(HttpStatus.NOT_FOUND, "엑셀 업로드 세션을 찾을 수 없습니다(만료되었을 수 있습니다)."),
    INVALID_COORDINATE_COLUMN(HttpStatus.BAD_REQUEST, "선택한 위도/경도 컬럼에서 좌표를 읽을 수 없습니다."),

    // 나만의지도 — 엑셀(PNU·좌표) 업로드와 한도. {0}·{1}은 exception(...)으로 채운다
    MYMAP_LAYER_LIMIT(HttpStatus.CONFLICT, "나만의지도는 한 사람당 최대 {0}개까지 만들 수 있습니다."),
    MYMAP_ROW_LIMIT(HttpStatus.BAD_REQUEST, "한 번에 최대 {0}행까지 올릴 수 있습니다."),
    MYMAP_FILE_TOO_LARGE(HttpStatus.PAYLOAD_TOO_LARGE, "파일이 너무 큽니다(최대 {0}MB)."),
    MYMAP_IMPORT_BUSY(HttpStatus.TOO_MANY_REQUESTS, "처리 중인 업로드가 있습니다. 끝난 뒤 다시 시도하세요."),
    MYMAP_COLUMN_REQUIRED(HttpStatus.BAD_REQUEST, "{0}에 쓸 컬럼을 선택하세요."),
    MYMAP_REF_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, "지적도(또는 주소) 자료가 아직 준비되지 않았습니다."),
    MYMAP_SAMPLE_NOT_FOUND(HttpStatus.NOT_FOUND, "샘플을 찾을 수 없습니다."),
    MYMAP_STYLE_INVALID(HttpStatus.BAD_REQUEST, "스타일 설정 형식이 올바르지 않습니다."),
    MYMAP_MODE_UNSUPPORTED(HttpStatus.BAD_REQUEST, "지원하지 않는 업로드 방식입니다."),
    MYMAP_SRID_UNSUPPORTED(HttpStatus.BAD_REQUEST, "지원하지 않는 좌표계입니다: {0}");

    private final HttpStatus status;
    private final String message;

    /** 메시지의 {0}, {1}…을 args로 채운 예외. 값이 없는 코드는 {@code new CustomException(code)}로 충분하다. */
    public CustomException exception(Object... args) {
        String text = message;
        for (int i = 0; i < args.length; i++) {
            text = text.replace("{" + i + "}", String.valueOf(args[i]));
        }
        return new CustomException(this, text);
    }
}
