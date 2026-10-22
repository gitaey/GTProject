package com.gtp.domain.mymap.dto;

/** 공유 대상 그룹(역할/세부권한) 하나의 현재 상태. state = ACTIVE | MISSING(공유 가능한 그룹 목록에 없음) */
public record ShareRoleState(String code, String label, String state) {
}
