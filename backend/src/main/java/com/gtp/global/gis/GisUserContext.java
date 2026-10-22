package com.gtp.global.gis;

import java.util.List;

/**
 * 지도 도메인이 현재 요청 사용자를 알아내는 유일한 통로.
 * 호스트 프로젝트가 자기 인증 방식에 맞는 구현을 하나 등록한다
 * (GTProject: {@link SecurityContextGisUserContext}, 전자정부: EgovUserDetailsHelper 기반 등).
 */
public interface GisUserContext {

    /** 로그인 사용자 id. 비로그인(익명)이면 null. */
    String currentUserId();

    /** 로그인 사용자의 역할 코드 목록("ROLE_" 접두사 제거). 비로그인이면 빈 목록. */
    List<String> currentRoleCodes();

    /**
     * 공유(그룹 공유) 판정에 쓰는 그룹 코드 목록. 역할 코드("MAP_USER")와, 세부권한(부서)이 있으면 "역할:세부"("MAP_USER:DEPT_A").
     * 세부권한 개념이 없는 호스트(전자정부 등)는 오버라이드하지 않아도 역할 코드만으로 동작한다.
     */
    default List<String> currentShareGroupCodes() {
        return currentRoleCodes();
    }
}
