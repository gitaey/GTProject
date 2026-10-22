package com.gtp.global.gis.share;

/** 공유 상대 검색 결과 한 줄. 개인정보 최소화 — 이메일·역할은 싣지 않는다. */
public record ShareUserResponse(String userId, String name, String groupLabel) {
}
