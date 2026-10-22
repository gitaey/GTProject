package com.gtp.domain.mymap.dto;

import java.util.List;

/** 레이어 하나의 현재 공유(여러 레이어 조회용). 항목 모양은 단일 조회 {@link UserMapShareResponse}의 users·roles와 같다. */
public record ShareSnapshotResponse(Long id, List<ShareUserState> users, List<ShareRoleState> roles) {
}
