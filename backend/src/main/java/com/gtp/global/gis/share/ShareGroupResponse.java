package com.gtp.global.gis.share;

/** 공유 가능한 그룹(역할/세부권한) 한 줄. parentCode는 세부권한일 때만(소속 역할 코드). */
public record ShareGroupResponse(String code, String label, String parentCode) {
}
