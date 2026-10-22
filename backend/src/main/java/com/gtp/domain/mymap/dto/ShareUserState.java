package com.gtp.domain.mymap.dto;

/** 공유 대상 사용자 한 명의 현재 상태. state = ACTIVE | INACTIVE | MISSING(탈퇴·삭제) */
public record ShareUserState(String userId, String name, String state) {
}
