package com.gtp.global.gis.share;

import java.util.Collection;
import java.util.List;
import java.util.Map;

/**
 * 공유 상대(사용자·역할/그룹)를 찾는 읽기 전용 포트. 모든 공유 가능한 자원(나만의지도 등)이 같이 쓴다.
 * 호스트가 자기 사용자·조직 저장소에 맞는 구현을 하나 등록한다
 * (GTProject: {@link JdbcGisShareDirectory}, 전자정부: 자기 테이블/세션 기반 구현).
 * 도메인(mymap 등)은 member 같은 다른 도메인을 import하지 않고 이 포트로만 이름·존재를 묻는다.
 */
public interface GisShareDirectory {

    /**
     * 공유 상대 검색 — 활성 사용자만, {@code excludeUserId}(본인)는 제외.
     * 이름·별명은 부분 일치, 아이디는 앞부분 일치. 정렬: 아이디 완전 일치 → 이름 → 아이디.
     *
     * @param q 이미 trim·길이 검사를 마친 검색어
     */
    List<ShareUserResponse> searchUsers(String q, String excludeUserId, int limit);

    /** 공유 가능한 그룹 목록(역할 → 그 아래 세부권한 순). 코드 형식: 역할 {@code ROLE}, 세부권한 {@code ROLE:SUB} */
    List<ShareGroupResponse> groups();

    /** 아이디별 이름·상태. 없는 아이디는 키가 없다. 비활성 사용자도 포함. */
    Map<String, UserState> lookupUsers(Collection<String> userIds);

    /** {@code name}은 없을 수 있다(null). */
    record UserState(String name, boolean active) {
    }
}
