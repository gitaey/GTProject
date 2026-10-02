# references — 지도 백엔드를 다른 스택(전자정부 + MyBatis)으로 옮길 때 보는 자료

GTProject 지도 백엔드(Spring Boot 3 · Java 17 · JPA)를 업무 프로젝트(JDK 11 · 전자정부 Spring 5 · MyBatis · JSP)에서
같은 화면이 동작하도록 다시 구현하기 위한 문서다. 코드는 2026-09-30 작업트리 기준이고, DB는 실측하지 않고 엔티티·코드에서 도출했다.

## 읽는 순서

| 순서 | 문서 | 언제 보나 | 핵심 |
|---|---|---|---|
| 1 | [`query-spec.md`](query-spec.md) 2·3절 | 무엇을 만들어야 하는지 정할 때 | 엔드포인트 전체 표(권한·프론트 사용처), **최소 구현(레이어 트리 L1) / 선택 목록** |
| 2 | [`ddl.md`](ddl.md) | DB를 만들 때 | 10개 테이블 PostgreSQL DDL(FK 없음), 논리 관계, 권장 인덱스, seed, Hibernate 실제 스키마와 다른 점, Oracle/Tibero 변환 |
| 3 | [`query-spec.md`](query-spec.md) 4~13절 | 매퍼·서비스를 짤 때 | 엔드포인트별 요청/응답 JSON·에러·SQL 등가물, Repository 28개 ↔ SQL 대조표, **깨지기 쉬운 계약**, 프론트-백엔드 불일치 |
| 4 | [`egov-jdk11-checklist.md`](egov-jdk11-checklist.md) | 코드를 옮기고 설정할 때 | Java 17 문법 위치와 대체, `jakarta`→`javax`, Boot 자동 설정 → XML, 의존성 충돌, 업로드·비동기·스케줄러, 보안(JWT→세션), MyBatis XML 예시, `GisUserContext`·예외 핸들러 스켈레톤, 이식 순서 체크리스트 |

## 한 줄 요약

- 백엔드가 요구하는 공통 조각은 `ApiResponse`, `BaseErrorCode`, `CustomException`, `GisErrorCode`, `GisUserContext` 5개 + `GisUserContext` 구현 1개다.
- 서비스 로직(트리 조립, 권한 판정, 좌표 변환, shp/엑셀 파싱)은 재사용하고 Repository만 MyBatis 매퍼로 바꾼다.
- 지도 화면이 뜨는 데 꼭 필요한 건 `GET /api/layers/tree` 하나다. 나머지(개인 설정·나만의지도·항공영상·바람길·VWorld 프록시)는 기능별 선택이다.
- 표기: **코드 확인**(파일:라인) / **추론** / **확인 필요**. 확인 필요 항목은 각 문서 끝에 모았다.

## 관련 문서

- 이식성 계약: `.claude/rules/map.md` · 백엔드 규칙: `.claude/rules/backend.md`
- 설계: `.claude/design-docs/2026-09-23-map-module-restructure.md` (백엔드 B1·B2a·B3·B4)
- 프론트 패키지: `frontend/packages/gis-map/README.md`(사용 3가지·호스트 주입·소스), `examples/jsp/README.md`(JSP 상세), `COMPATIBILITY.md`(ol 버전)
- 이식 절차 전체: `../SKILL.md`
- User FK 제거 이관 SQL: 설계문서 B1 절(실행은 사용자). 호출별 작업 기록은 저장소 밖(`_workspace/`, gitignore)이라 공개 저장소에는 없다
