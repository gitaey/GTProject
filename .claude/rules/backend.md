---
paths:
  - "backend/**"
---

# Backend 규칙

지도 도메인(`map`, `mymap`, `geoserver`, `geotiff`, `wind`)은 `map.md`, 봇 도메인(`bot`, `lostark`)은
`bot.md` 규칙이 추가로 적용된다.

## 구조

```
com.gtp
├── global/
│   ├── config/     SecurityConfig, CorsConfig
│   ├── jwt/        JwtUtil, JwtFilter
│   ├── exception/  CustomException, BaseErrorCode(인터페이스), ErrorCode, GlobalExceptionHandler
│   ├── gis/        지도 도메인 공통 — GisErrorCode, GisUserContext(+ SecurityContextGisUserContext)
│   ├── response/   ApiResponse<T>
│   └── init/       DataInitializer(역할·권한·관리자 시드), PostDataInitializer
└── domain/
    blog · bot · geoserver · geotiff · log(접속로그) · lostark · map(레이어 트리)
    member/{auth,role,user} · menu(메뉴 가시성) · mymap(나만의지도) · wind(바람길)
```

각 도메인은 `controller / service / repository / entity / dto` 패키지로 나눈다.

## 컨벤션

- 응답은 `ApiResponse<T>` — `{ success, message, data }`. `ApiResponse.ok(data)`, `ApiResponse.fail(msg)`.
- 비즈니스 예외는 `throw new CustomException(ErrorCode.XXX)`. 필요한 코드가 없으면 `ErrorCode`에 추가한다
  (HttpStatus + 한국어 메시지). **지도 5개 도메인은 `GisErrorCode`(`global/gis`)에 추가**하고 `ErrorCode`를 쓰지 않는다
  (`CustomException`은 `BaseErrorCode`를 받으므로 둘 다 던질 수 있다).
- 새 도메인은 다른 도메인의 엔티티·리포지토리를 import하지 않는다. 사용자는 `userId` 문자열로 저장한다(FK 없음, `domain/mymap`·BK-1 이후 `domain/map`이 예시).
  현재 사용자가 필요하면 지도 도메인은 `GisUserContext`, 그 밖은 컨트롤러에서 principal을 읽는다.
- `GlobalExceptionHandler`의 일반 예외 처리는 `log.error(msg, e)`처럼 **예외 객체를 함께** 넘긴다.
  메시지만 찍으면 스택트레이스가 안 남아 프로덕션 500 원인을 못 찾는다(실제로 겪었음).
- 역할/권한은 DB 테이블(`RoleEntity`, `PermissionEntity`)이다. `member/user/entity`의 `Role`, `Permission`
  enum은 안 쓰는 옛 코드다.
- 테이블명은 `tbl_` 접두사(예외: `bot_*`, `geo_tiff_files`).

## 보안 (SecurityConfig)

- Stateless JWT, CSRF 끔. JWT는 HS256, subject=userId, claim `role`, 만료 24시간.
- `JwtFilter`는 principal에 userId(String), 권한에 `ROLE_<role>`을 넣는다.
  컨트롤러에서 role 코드와 비교할 때는 `ROLE_` 접두사를 떼야 한다(지도 도메인은 `GisUserContext.currentRoleCodes()`가 떼서 준다).
- **마지막 규칙이 `anyRequest().permitAll()`이다.** 새 엔드포인트를 만들면 SecurityConfig에 명시적으로
  `authenticated()`나 역할 제한을 추가하지 않는 한 **로그인 없이 열린다.** 새 API마다 반드시 확인한다.
- SUPER_ADMIN 전용: `/api/admin/mymap/**`, `/api/roles/**`(GET 제외).
- CORS 허용 Origin은 `CorsConfig`에 있다. 새 배포 도메인이 생기면 여기에 추가한다.

## DB / 설정

- **로컬 `application-local.yml`의 DB는 운영 DB(호스트 주소는 저장소에 적지 않는다)다.** `ddl-auto: update`라서 엔티티를 바꾼 채
  로컬에서 기동하면 **운영 스키마가 즉시 바뀐다.** 사용자가 명시적으로 허락하지 않는 한:
  엔티티/매핑을 바꾼 상태로 백엔드를 기동하지 않는다, 운영 DB에 쓰기(INSERT/UPDATE/DELETE/DDL)를 일으키는
  테스트를 하지 않는다, SQL은 작성만 하고 실행하지 않는다. 검증은 `./mvnw compile`까지.
- 마이그레이션 도구가 없고 `ddl-auto: update`다. 컬럼 추가는 자동 반영되지만 **컬럼 삭제·타입 변경·FK 제거는
  반영되지 않는다.** 그런 변경은 SQL을 따로 작성해 사용자에게 전달한다. (예: `tbl_layer_user_access`의 옛 `tbl_user` FK 제거 SQL —
  설계문서 `2026-09-23-map-module-restructure.md` B1, 실행은 사용자)
- 설정은 `application.yml`(추적됨)과 `application-local.yml`(gitignore). yml에 비밀값 기본값을 넣지 않는다.
- `@Scheduled`는 `wind/service/WindDataService.scheduledRefresh` 하나. 같은 클래스의 `@Transactional`
  메서드를 직접 부르면(self-invocation) 트랜잭션이 걸리지 않는다 — 스케줄러에서 트랜잭션이 필요하면
  별도 빈으로 분리한다.
- 테스트 코드는 없다(`src/test/java` 비어 있음). 최소한 `./mvnw compile`로 검증한다.
- Windows 로컬에서 `"""` 텍스트 블록 컴파일 에러가 나면 `JAVA_HOME`이 Java 17 미만을 가리키는지 확인한다.
