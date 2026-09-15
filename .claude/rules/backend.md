---
paths:
  - "backend/**"
---

# Backend 아키텍처

## 구조
```
com.gtp/
├── global/
│   ├── config/     CorsConfig(허용 Origin), SecurityConfig
│   ├── jwt/        JwtUtil, JwtFilter (principal=userId, authority=ROLE_<role>)
│   ├── exception/  CustomException, ErrorCode(enum), GlobalExceptionHandler
│   └── response/   ApiResponse<T>  ← 모든 API 응답 래퍼
└── domain/
    ├── blog/       게시글, 카테고리, slug 기반 조회
    ├── bot/        command / room / schedule / log / message / discord
    ├── geoserver/  GeoServer REST API 연동 (SLD 스타일, 레이어 publish)
    ├── geotiff/    GeoTIFF 업로드 → COG 변환 → titiler 타일 서빙
    ├── log/        접속 로그(access-log)
    ├── lostark/    캐릭터 조회 API, 레이드 일정 (구글시트 연동)
    ├── map/        레이어 트리 CRUD (Layer, LayerGroup, User/Permission Access)
    ├── member/
    │   ├── auth/       JWT 로그인
    │   ├── role/       동적 역할/권한 (RoleEntity/PermissionEntity, DB 기반 — enum 아님)
    │   └── user/       회원 CRUD
    ├── menu/       메뉴 가시성 — 역할별 노출 메뉴 ID 화이트리스트 (menu-visibility)
    ├── mymap/      나만의지도 (shp/엑셀 업로드 → GeoJSON 저장)
    └── wind/       바람길 (기상청 LDAPS 바람 데이터, 스케줄 갱신)
```

모든 비즈니스 예외는 `throw new CustomException(ErrorCode.XXX)` 형식.
`GlobalExceptionHandler`의 일반 `Exception` 핸들러는 반드시 `log.error(msg, e)`처럼 예외 객체를
같이 넘겨서 스택트레이스가 로그에 남게 할 것 — 메시지만 찍으면 원인 추적이 불가능해진다
(과거 이 문제로 프로덕션 500 에러 원인을 한참 못 찾은 적 있음).

## Security 규칙 (SecurityConfig)

- permitAll: `POST /api/auth/login`, `GET /api/posts`(+`/{slug}`), `GET /api/categories`,
  `GET /api/geoserver/sld/**`, `GET /api/layers`/`tree`/`tree/**`, `GET /api/layer-groups`,
  `GET /api/wind/**`, `GET /api/bot-log/**`
- authenticated: `/api/categories/**`, `/api/users/**`, `/api/auth/me`, `/api/posts/**`,
  `/api/geoserver/**`, `/api/layers/**`, `/api/layer-groups/**`, `/api/wind/refresh`,
  `/api/bot/**`, `/api/access-log/**`, `/api/mymap/**`, `/api/menu-visibility`,
  `GET /api/roles`(+`/**`)
- SUPER_ADMIN 전용: `/api/admin/mymap/**`, `/api/roles/**`(GET 제외)
- 나머지 `anyRequest()` → `permitAll()` (폴백)
- JwtFilter: principal=userId(String), authority=`ROLE_<role>` — 컨트롤러에서
  `SecurityContextHolder`로 꺼내 쓸 때 `ROLE_` 접두사 잘라내야 role 코드와 일치함

## 독립 도메인 설계 원칙 (mymap 참고)

지도 관련 신규 기능은 다른 프로젝트로 옮겨도 그 기능만 재사용 가능하도록 독립 모듈로 만든다.
- 다른 도메인 엔티티(User, Role, Layer)를 import하지 않음
- 소유자/공유 대상은 `ownerId`/`roleCode`를 순수 `String`으로만 저장 (FK 없음)
- 권한 판단은 문자열 비교만 (다른 도메인 테이블 조인 없음)

## 의존성 특이사항 (pom.xml)
- GeoTools 32.1(`gt-shapefile`, `gt-geojson`)는 shp 파싱/GeoJSON 인코딩용으로만 쓰고,
  **CRS.decode()/EPSG 조회는 쓰지 않음** — 폐쇄망/샌드박스에서 외부 네트워크를 타려다
  응답 없이 멈추는 문제가 있어서, EPSG:4326/3857/5186/5179 변환은 표준 투영 공식을 직접
  구현했다 (`domain/mymap/util/CoordinateTransformUtil`). `.prj` 파일도 GeoTools 없이
  정규식으로 직접 파싱해서 판별한다 (`domain/mymap/util/PrjParser`).
- Apache POI(`poi-ooxml`)는 엑셀 업로드 파싱용
- grib2json(`com.github.davidmoten`)은 과거 GFS 바람 데이터용 — 현재는 기상청 LDAPS로
  교체되어 미사용이지만 의존성은 남아있음
- 대량 데이터(피처 수만~수십만 건) INSERT는 JPA `saveAll()` 대신
  `domain/mymap/util/FeatureBatchInserter`(JdbcTemplate 배치)처럼 직접 배치 insert할 것 —
  IDENTITY 채번 전략에서는 JPA saveAll이 배치가 안 걸려 건별 insert/커밋이 된다
- `@Async` 메서드를 `@Transactional` 메서드 안에서 호출하지 말 것 — 트랜잭션 커밋 전에
  비동기 스레드가 먼저 조회해서 빈 값을 받고 조용히 종료해버리는 레이스가 생긴다
