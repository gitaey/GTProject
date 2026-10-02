package com.gtp.global.gis;

import com.gtp.global.exception.BaseErrorCode;
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
    INVALID_COORDINATE_COLUMN(HttpStatus.BAD_REQUEST, "선택한 위도/경도 컬럼에서 좌표를 읽을 수 없습니다.");

    private final HttpStatus status;
    private final String message;
}
