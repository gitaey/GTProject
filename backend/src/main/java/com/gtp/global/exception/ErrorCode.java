package com.gtp.global.exception;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@Getter
@RequiredArgsConstructor
public enum ErrorCode {
    NOT_FOUND(HttpStatus.NOT_FOUND, "리소스를 찾을 수 없습니다."),
    INVALID_INPUT(HttpStatus.BAD_REQUEST, "잘못된 입력입니다."),
    INTERNAL_SERVER_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "서버 오류가 발생했습니다."),
    LOSTARK_API_ERROR(HttpStatus.BAD_GATEWAY, "로스트아크 API 오류가 발생했습니다."),

    // 사용자 관련
    USER_NOT_FOUND(HttpStatus.NOT_FOUND, "사용자를 찾을 수 없습니다."),
    DUPLICATE_USER_ID(HttpStatus.CONFLICT, "이미 사용 중인 아이디입니다."),
    DUPLICATE_NICKNAME(HttpStatus.CONFLICT, "이미 사용 중인 닉네임입니다."),
    DUPLICATE_EMAIL(HttpStatus.CONFLICT, "이미 사용 중인 이메일입니다."),
    INVALID_ROLE(HttpStatus.BAD_REQUEST, "유효하지 않은 역할입니다."),
    INVALID_STATUS(HttpStatus.BAD_REQUEST, "유효하지 않은 상태입니다."),
    INVALID_PERMISSION(HttpStatus.BAD_REQUEST, "해당 역할에 유효하지 않은 세부 권한입니다."),
    PERMISSION_REQUIRED(HttpStatus.BAD_REQUEST, "해당 역할은 세부 권한이 필요합니다."),

    // 포스트 관련
    POST_NOT_FOUND(HttpStatus.NOT_FOUND, "포스트를 찾을 수 없습니다."),
    DUPLICATE_SLUG(HttpStatus.CONFLICT, "이미 사용 중인 슬러그입니다."),

    // 카테고리 관련
    CATEGORY_NOT_FOUND(HttpStatus.NOT_FOUND, "카테고리를 찾을 수 없습니다."),
    DUPLICATE_CATEGORY_CODE(HttpStatus.CONFLICT, "이미 사용 중인 카테고리 코드입니다."),

    // 레이어 관련
    LAYER_NOT_FOUND(HttpStatus.NOT_FOUND, "레이어를 찾을 수 없습니다."),
    LAYER_GROUP_NOT_FOUND(HttpStatus.NOT_FOUND, "레이어 그룹을 찾을 수 없습니다."),

    // GeoTIFF 관련
    GEOTIFF_NOT_FOUND(HttpStatus.NOT_FOUND, "GeoTIFF 파일을 찾을 수 없습니다."),
    INVALID_FILE_TYPE(HttpStatus.BAD_REQUEST, "GeoTIFF(.tif, .tiff) 파일만 업로드 가능합니다."),
    FILE_UPLOAD_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "파일 업로드에 실패했습니다."),

    // 나만의지도 관련
    USER_MAP_NOT_FOUND(HttpStatus.NOT_FOUND, "나만의지도를 찾을 수 없습니다."),
    USER_MAP_FORBIDDEN(HttpStatus.FORBIDDEN, "이 나만의지도에 대한 권한이 없습니다."),
    USER_MAP_NOT_READY(HttpStatus.CONFLICT, "아직 처리 중인 나만의지도입니다."),
    INVALID_SHP_FILE(HttpStatus.BAD_REQUEST, "shp 파일 세트(.shp/.shx/.dbf)가 올바르지 않습니다."),
    INVALID_EXCEL_FILE(HttpStatus.BAD_REQUEST, "엑셀(.xlsx) 파일만 업로드 가능합니다."),
    EXCEL_UPLOAD_NOT_FOUND(HttpStatus.NOT_FOUND, "엑셀 업로드 세션을 찾을 수 없습니다(만료되었을 수 있습니다)."),
    INVALID_COORDINATE_COLUMN(HttpStatus.BAD_REQUEST, "선택한 위도/경도 컬럼에서 좌표를 읽을 수 없습니다."),

    // 인증 관련
    INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED, "아이디 또는 비밀번호가 올바르지 않습니다."),
    ACCOUNT_INACTIVE(HttpStatus.FORBIDDEN, "비활성화된 계정입니다."),
    UNAUTHORIZED(HttpStatus.UNAUTHORIZED, "인증이 필요합니다."),
    INVALID_TOKEN(HttpStatus.UNAUTHORIZED, "유효하지 않은 토큰입니다."),

    // 역할/세부권한 관련
    DUPLICATE_ROLE_CODE(HttpStatus.CONFLICT, "이미 존재하는 역할 코드입니다."),
    DUPLICATE_PERMISSION_CODE(HttpStatus.CONFLICT, "이미 존재하는 세부 권한 코드입니다."),
    ROLE_HAS_PERMISSIONS(HttpStatus.CONFLICT, "세부 권한이 있는 역할은 삭제할 수 없습니다."),
    SUPER_ADMIN_PROTECTED(HttpStatus.FORBIDDEN, "슈퍼관리자만 수행할 수 있는 작업입니다.");

    private final HttpStatus status;
    private final String message;
}