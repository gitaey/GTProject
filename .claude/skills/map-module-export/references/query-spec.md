# 지도 백엔드 엔드포인트·쿼리 명세 (MyBatis 재구현용)

- 기준: 2026-09-30 작업트리(BK-1·BK-2 반영). 테이블 정의는 `ddl.md`.
- 목적: 전자정부(Spring 5 + MyBatis) 쪽에서 **같은 JSON을 돌려주는 API**를 다시 만들 수 있게, 엔드포인트마다
  요청·응답·권한·에러와 **SQL 등가물**을 적는다. 서비스 로직(트리 조립, 권한 판정, 좌표 변환)은 자바 그대로 재사용하고
  Repository 계층만 매퍼로 바꾸는 것을 전제로 한다.
- **SQL 캡처는 하지 않았다.** 로컬 DB가 운영 DB라 백엔드 기동·DB 접속을 하지 않았다. 아래 SQL은 JPA 파생 쿼리·JPQL·코드를 읽고
  사람이 옮긴 것이다(= 추론). JPA가 실제로 내는 SQL과 순서·부가 SELECT가 다를 수 있는 곳은 "확인 필요"로 표시했다.
- 표기: 파라미터는 MyBatis 식 `#{param}`. 경로의 `…/`는 `backend/src/main/java/com/gtp/`. **코드 확인** / **추론** / **확인 필요**.

---

## 1. 공통 계약

### 1.1 응답 봉투

모든 JSON 응답(예외 2개 제외)은 `ApiResponse<T>`다(코드 확인: `…/global/response/ApiResponse.java`).

```json
{ "success": true,  "message": "success", "data": <T> }      // ApiResponse.ok(data)
{ "success": false, "message": "<한국어 메시지>", "data": null } // ApiResponse.fail(msg)
```

봉투가 **없는** 응답: `GET /api/mymap/{id}/geojson`(원본 FeatureCollection 스트리밍), `GET /api/geotiff/tiles/...png`(PNG 바이트).

### 1.2 에러

| 상황 | HTTP | 본문 | 근거 |
|---|---|---|---|
| `CustomException(GisErrorCode.X)` | X의 상태 | `{"success":false,"message":"X의 메시지","data":null}` | 코드 확인: `…/global/exception/GlobalExceptionHandler.java:14-20` |
| 그 밖의 모든 예외(검증 실패 `@Valid` 포함, DB 제약 위반 포함) | 500 | `{"success":false,"message":"서버 오류가 발생했습니다.","data":null}` | 같은 파일 `:22-28`. 검증 전용 핸들러가 없어 `@NotBlank` 실패도 500이다 |
| Spring Security 거부(비로그인으로 `authenticated()` 경로 호출 등) | 403 | **빈 본문**(봉투 아님) | 추론: formLogin/httpBasic 끔 → 기본 403 entry point (`02_backend_BK-2.md` 6절과 같음) |

에러 코드 이름은 응답에 나가지 않고 **메시지만** 나간다. 지도 도메인이 쓰는 코드(코드 확인: `…/global/gis/GisErrorCode.java:16-34`):

| GisErrorCode | HTTP | 메시지 | 던지는 곳 |
|---|---|---|---|
| `NOT_FOUND` | 404 | 리소스를 찾을 수 없습니다. | 바람 latest(프레임 0개), frames/{id} |
| `LAYER_NOT_FOUND` | 404 | 레이어를 찾을 수 없습니다. | 레이어 수정·삭제·재정렬, 권한/개인 설정 저장 시 없는 layerId |
| `LAYER_GROUP_NOT_FOUND` | 404 | 레이어 그룹을 찾을 수 없습니다. | 그룹 수정·삭제, 레이어 저장·재정렬 시 없는 groupId/parentId |
| `GEOTIFF_NOT_FOUND` | 404 | GeoTIFF 파일을 찾을 수 없습니다. | geotiff status / delete / reprocess-bounds |
| `INVALID_FILE_TYPE` | 400 | GeoTIFF(.tif, .tiff) 파일만 업로드 가능합니다. | geotiff upload |
| `FILE_UPLOAD_FAILED` | 500 | 파일 업로드에 실패했습니다. | geotiff upload, mymap shp upload, excel preview (IOException) |
| `USER_MAP_NOT_FOUND` | 404 | 나만의지도를 찾을 수 없습니다. | mymap `/{id}/...` 전부(권한 검사보다 먼저) |
| `USER_MAP_FORBIDDEN` | 403 | 이 나만의지도에 대한 권한이 없습니다. | 열람 권한 없음 / 소유자 아님 |
| `USER_MAP_NOT_READY` | 409 | 아직 처리 중인 나만의지도입니다. | geojson (status != READY) |
| `INVALID_SHP_FILE` | 400 | shp 파일 세트(.shp/.shx/.dbf)가 올바르지 않습니다. | shp upload (.shp 또는 .dbf 없음) |
| `INVALID_EXCEL_FILE` | 400 | 엑셀(.xlsx) 파일만 업로드 가능합니다. | excel preview (확장자, 헤더 행 없음) |
| `EXCEL_UPLOAD_NOT_FOUND` | 404 | 엑셀 업로드 세션을 찾을 수 없습니다(만료되었을 수 있습니다). | excel confirm |
| `INVALID_COORDINATE_COLUMN` | 400 | 선택한 위도/경도 컬럼에서 좌표를 읽을 수 없습니다. | excel confirm (헤더에 컬럼 없음) |

### 1.3 JSON 직렬화

- 날짜: `LocalDateTime`은 ISO 문자열(예: `"2026-09-23T10:11:12.123456"`, 시간대 표시 없음)로 나간다(추론: Spring Boot 기본
  `WRITE_DATES_AS_TIMESTAMPS=false` + JavaTimeModule). **Boot 없는 Spring 5에선 기본이 숫자 배열**이 될 수 있으니 이식 시 맞춘다
  (`egov-jdk11-checklist.md` 3절).
- boolean 필드는 Lombok `isXxx()` 게터 → JSON 키는 `visible`, `owner`(추론: Jackson 기본 규칙).
- null 필드도 키가 나간다(`"layerName": null`). 프론트는 `null`을 기대한다(코드 확인: `frontend/packages/gis-map/src/core/types/layer.ts`).

### 1.4 사용자 컨텍스트

컨트롤러는 `GisUserContext`로만 사용자를 안다(코드 확인: `…/global/gis/GisUserContext.java`).
`currentUserId()` = 비로그인이면 `null`, `currentRoleCodes()` = `ROLE_` 접두사를 뗀 역할 코드 목록(비로그인이면 빈 목록).
GTProject 구현은 JWT principal 문자열을 읽는다(`SecurityContextGisUserContext.java`). eGov 구현 예시는 `egov-jdk11-checklist.md` 8절.

---

## 2. 엔드포인트 한눈 표

권한은 **현재 SecurityConfig 그대로**다(코드 확인: `…/global/config/SecurityConfig.java:42-58`). 마지막 규칙이 `anyRequest().permitAll()`이라
목록에 없는 경로는 익명에게 열려 있다. "프론트" 열: **A** = 지도 패키지 어댑터(`frontend/packages/gis-map/src/adapters/rest`)가 호출,
**M** = GTProject 앱의 관리 화면이 호출, **-** = 프론트 호출 없음.

| # | 메서드 · 경로 | 권한(현재) | 프론트 | 이식 구분 |
|---|---|---|---|---|
| L1 | GET `/api/layers/tree` | 익명 | A (권한 키 없을 때), M | **필수** |
| L2 | GET `/api/layers/tree/permission/{permission}` | 익명 | A (권한 키 있을 때) | **필수**(권한 트리 쓰면) |
| L3 | GET `/api/layers/user-access` | 로그인 | A | 선택: 개인 레이어 설정 |
| L4 | PUT `/api/layers/user-access` | 로그인 | A | 선택: 개인 레이어 설정 |
| L5 | DELETE `/api/layers/user-access` | 로그인 | A | 선택: 개인 레이어 설정 |
| L6 | GET `/api/layers` | 익명 | - | 관리(미사용) |
| L7 | POST `/api/layers` | 로그인 | M | 관리 |
| L8 | PUT `/api/layers/{id}` | 로그인 | M | 관리 |
| L9 | DELETE `/api/layers/{id}` | 로그인 | M | 관리 |
| L10 | PUT `/api/layers/reorder` | 로그인 | M | 관리 |
| L11 | GET `/api/layers/permissions/{permission}` | 로그인 | M | 관리 |
| L12 | PUT `/api/layers/permissions/{permission}` | 로그인 | M | 관리 |
| G1 | GET `/api/layer-groups` | 익명 | - | 관리(미사용) |
| G2 | POST `/api/layer-groups` | 로그인 | M | 관리 |
| G3 | PUT `/api/layer-groups/{id}` | 로그인 | M | 관리 |
| G4 | DELETE `/api/layer-groups/{id}` | 로그인 | M | 관리 |
| U1 | GET `/api/mymap` | 로그인 | A | 선택: 나만의지도 보기 |
| U2 | GET `/api/mymap/{id}/status` | 로그인 | A | 선택: 나만의지도 보기 |
| U3 | GET `/api/mymap/{id}/geojson` | 로그인 | A | 선택: 나만의지도 보기 |
| U4 | DELETE `/api/mymap/{id}` | 로그인 | A | 선택: 나만의지도 보기 |
| U5 | POST `/api/mymap/upload/shp` | 로그인 | A | 선택: 업로드 |
| U6 | POST `/api/mymap/upload/excel/preview` | 로그인 | A | 선택: 업로드 |
| U7 | POST `/api/mymap/upload/excel/confirm` | 로그인 | A | 선택: 업로드 |
| U23 | POST `/api/mymap/upload/excel/convert` | 로그인 | A | 선택: 주소 변환(엑셀로만 받기) |
| U24 | GET `/api/mymap/{id}/export` | 로그인 | A | 선택: 내보내기(엑셀·GeoJSON) |
| U8 | GET `/api/mymap/{id}/share` | 로그인 | A | 선택: 공유 |
| U9 | PUT `/api/mymap/{id}/share` | 로그인 | A | 선택: 공유 |
| U10 | PATCH `/api/mymap/{id}` | 소유자만 | A | 선택: 스타일·이름·표시 수정 |
| U14 | GET `/api/mymap/quota` | 로그인 | A | 선택: 업로드 한도·적재 범위 |
| U15 | GET `/api/mymap/samples/{kind}` | 로그인 | A | 선택: 샘플 엑셀 |
| U16 | GET `/api/mymap/{id}/import-report` | 소유자만 | A | 선택: 업로드 결과 보고서 |
| U17 | GET `/api/mymap/{id}/import-report.xlsx` | 소유자만 | A | 선택: 실패 행 엑셀 |
| U18 | GET `/api/mymap/{id}/columns` | 볼 수 있는 사람 | A | 선택: 스타일 컬럼 통계 |
| U19 | GET `/api/mymap/shares?ids=` | 소유자만(소유한 것만) | A | 선택: 일괄 공유(현재 대상) |
| U20 | POST `/api/mymap/shares/bulk` | 소유자만(소유한 것만) | A | 선택: 일괄 공유 |
| U21 | GET `/api/gis/share-directory/users` | 로그인 | A | 선택: 공유 상대 사용자 검색 |
| U22 | GET `/api/gis/share-directory/groups` | 로그인 | A | 선택: 공유 대상 역할 목록 |
| U11 | GET `/api/mymap/srid-options` | 로그인 | - | 미사용(프론트는 자체 목록 `ui/mymap/sridOptions.ts`) |
| U12 | GET `/api/admin/mymap` | SUPER_ADMIN | M | 관리 |
| U13 | DELETE `/api/admin/mymap/{id}` | SUPER_ADMIN | M | 관리 |
| T1 | GET `/api/geotiff` | **익명(규칙 없음)** | A | 선택: 항공영상 보기 |
| T2 | GET `/api/geotiff/{id}/status` | 익명(규칙 없음) | A | 선택: 항공영상 보기 |
| T3 | GET `/api/geotiff/tiles/{id}/{z}/{x}/{y}.png` | 익명(규칙 없음) | A (OL 타일) | 선택: 항공영상 보기 |
| T4 | POST `/api/geotiff/upload` | **익명(규칙 없음)** | A | 선택: 업로드 |
| T5 | DELETE `/api/geotiff/{id}` | **익명(규칙 없음)** | A | 선택: 업로드 |
| T6 | POST `/api/geotiff/{id}/reprocess-bounds` | **익명(규칙 없음)** | A | 선택: 업로드 |
| W1 | GET `/api/wind/latest` | 익명 | A | 선택: 바람길 |
| W2 | GET `/api/wind/frames` | 익명 | A | 선택: 바람지도 탭(패널) |
| W3 | GET `/api/wind/frames/{id}` | 익명 | A | 선택: 바람지도 탭(패널) |
| W5 | GET `/api/wind/fields/{id}` | 익명 | A | 선택: 기온·습도 오버레이 |
| W4 | POST `/api/wind/refresh` | SUPER_ADMIN·MAP_ADMIN | - | 운영용(수동 갱신) |
| S1 | `/api/geoserver/**` (13개) | 로그인(`GET /sld/**`만 익명) | M | 관리(지도 화면과 무관, 8절) |

보안 메모(발견만, 고치지 않음 — 설계문서 "발견한 범위 밖 문제"와 같음): T4~T6은 로그인 없이 업로드(최대 2GB)·삭제가 된다.
L7~L12, G2~G4는 로그인한 아무 사용자나 호출할 수 있다. **이식할 때는 관리 API에 관리자 권한을 거는 것을 권장**한다.

---

## 3. 전자정부(MyBatis) 쪽 최소 구현 목록 / 선택 목록

프론트 소스는 전부 선택형이다(`GisMapSources`의 필드가 없으면 그 기능이 조용히 꺼진다). `restSources()`는 layerTree·myMap·geoTiff·wind를
**한꺼번에** 만들므로, 백엔드에 일부만 구현했다면 호스트에서 필요한 것만 조립한다(코드 확인: `adapters/rest/index.ts:12-26`가
`restLayerTree`, `restMyMap`, `restGeoTiff`, `restWind`를 따로 export).

| 단계 | 구현할 엔드포인트 | 테이블 | 프론트 조립 |
|---|---|---|---|
| **최소** (레이어 트리 표시) | L1 (+ 권한 트리 쓰면 L2) | `tbl_layer`, `tbl_layer_group` (+ `tbl_layer_permission_access`) | `sources: ctx => ({ layerTree: restLayerTree(ctx, { getPermissionKey: () => null }) })` 처럼 권한 키를 끄면 L1만 필요 |
| 선택: 개인 레이어 설정 | L3~L5 | `tbl_layer_user_access` | 기본 `restLayerTree`는 `userSelection`을 항상 제공 → 미구현이면 설정 버튼이 실패한다. 미구현 시 `userSelection` 없는 소스로 감싼다. `loadTree`는 L3가 404여도 건너뛰고 동작(코드 확인: `layerTree.ts:36-47`, `uaRes.ok` 검사) |
| 선택: 레이어 관리 | L6~L12, G1~G4 | 위 + 그룹 | 관리 화면은 지도 패키지에 없다(GTProject 앱 `/map-admin/layer`). 업무 쪽 관리 화면을 새로 만들거나 SQL로 관리 |
| 선택: 나만의지도 보기 | U1~U4 | `tbl_user_map*` 4개 | `restMyMap` |
| 선택: 나만의지도 업로드 | U5~U7 | 같음 + 업로드 폴더 | GeoTools·POI 의존성 필요(`egov-jdk11-checklist.md` 4·5절) |
| 선택: 나만의지도 공유 | U8, U9 | 공유 2개 테이블 | |
| 선택: 항공영상 | T1~T3 (보기), T4~T6 (업로드) | `geo_tiff_files` | GDAL + titiler 인프라 필요 |
| 선택: 바람길 | W1~W3·W5 + 스케줄러 | `tbl_wind_frame`, `tbl_wind_scalar` | 기상청 API 키(`KMA_API_KEY`) 필요 |
| 선택: VWorld 검색·필지·지역명·WFS·범례 | 호스트 프록시 5종(9절) | 없음 | `proxySources()`. 백엔드 API가 아니라 **호스트가 제공하는 프록시** |

---

## 4. 레이어 (`domain/map`)

### L1. GET `/api/layers/tree`

- 요청: 없음. 응답 `data` = `LayerTreeResponse`

```json
{
  "groups": [ { "id": 1, "name": "…", "parentId": null, "sortOrder": 0,
                "children": [ /* 같은 모양 */ ],
                "layers":   [ /* LayerResponse */ ] } ],
  "ungroupedLayers": [ /* LayerResponse */ ]
}
```

`LayerResponse` 필드(코드 확인: `…/domain/map/dto/LayerResponse.java:11-30`): `id, name, type, sourceType, url, layerName, styleName,
styleConfig, format, projection, minZoom, maxZoom, opacity, visible, sortOrder, groupId, groupName, description, createdAt, updatedAt`.

SQL 등가물:

```sql
-- layer.selectAllOrdered  (LayerRepository.findAllByOrderBySortOrderAscIdAsc)
SELECT id, name, type, source_type, url, layer_name, style_name, style_config, format, projection,
       min_zoom, max_zoom, opacity, visible, sort_order, group_id, group_name, description, created_at, updated_at
FROM tbl_layer
ORDER BY sort_order ASC, id ASC;

-- layerGroup.selectAllOrdered  (LayerGroupRepository.findAllByOrderBySortOrderAscIdAsc)
SELECT id, name, parent_id, sort_order, created_at, updated_at
FROM tbl_layer_group
ORDER BY sort_order ASC, id ASC;
```

트리 조립은 자바(코드 확인: `LayerService.java:37-71`) — **그대로 옮긴다**:
1. 그룹을 정렬 순서대로 `LinkedHashMap<id, node>`에 넣는다(순서 유지가 중요).
2. 레이어를 순서대로 돌며 `group_id`가 맵에 있으면 그 그룹의 `layers`에, 없거나 NULL이면 `ungroupedLayers`에.
3. 그룹을 순서대로 돌며 `parent_id`가 NULL이면 루트, 맵에 있으면 부모의 `children`에, **부모가 없으면 루트로**.

### L2. GET `/api/layers/tree/permission/{permission}`

- 요청: 경로 변수 `permission`(권한 키). 응답: L1과 같은 모양.
- 동작(코드 확인: `LayerService.java:73-113`): 허용 id 집합을 구해 레이어를 거른 뒤 L1과 같이 조립하고, **레이어도 자식도 없는 그룹을 재귀로 제거**한다
  (`filterEmptyGroups`, `:226-237`). `ungroupedLayers`는 걸러진 레이어만 들어간다.

```sql
-- layerPermission.selectLayerIdsByPermission  (findByPermission → a.getLayer().getId())
SELECT layer_id FROM tbl_layer_permission_access WHERE permission = #{permission};
-- 이어서 L1의 두 SELECT. (SQL 한 번으로 거를 수도 있다:)
SELECT l.* FROM tbl_layer l
WHERE l.id IN (SELECT layer_id FROM tbl_layer_permission_access WHERE permission = #{permission})
ORDER BY l.sort_order ASC, l.id ASC;
```

JPA 쪽 확인 필요: `findByPermission`은 엔티티를 읽고 `a.getLayer().getId()`로 id를 꺼낸다. 지연 로딩 프록시에서 id만 꺼내면
추가 SELECT가 없다고 BK-1이 적었지만 SQL 캡처로 확인하지 않았다. 행마다 `tbl_layer` SELECT가 나간다면 N+1이다. MyBatis는 `layer_id`만 읽으므로 상관없다.

### L3~L5. `/api/layers/user-access` (개인 레이어 설정)

| | 요청 | 응답 `data` | 동작(코드 확인: `LayerService.java:203-224`) |
|---|---|---|---|
| L3 GET | - | `number[]` 또는 **`null`** | 행이 0개면 `null` = "개인 설정 없음" |
| L4 PUT | JSON 배열 `[1, 5, 9]` | `null` | 전부 삭제 후 id마다 INSERT. 없는 id가 하나라도 있으면 `LAYER_NOT_FOUND`(404)로 전체 롤백 |
| L5 DELETE | - | `null` | 전부 삭제 |

```sql
-- layerUser.selectLayerIdsByUser  (findByUserId → getLayer().getId())
SELECT layer_id FROM tbl_layer_user_access WHERE user_id = #{userId};
-- 결과 0행이면 서비스가 null 반환 (빈 배열 아님!)

-- layerUser.deleteByUser  (deleteByUserId: JPA는 SELECT 후 건별 DELETE → 한 문장으로)
DELETE FROM tbl_layer_user_access WHERE user_id = #{userId};

-- layer.existsById  (findById로 존재 확인 — 없으면 LAYER_NOT_FOUND)
SELECT COUNT(*) FROM tbl_layer WHERE id = #{layerId};

-- layerUser.insert  (save, id마다)
INSERT INTO tbl_layer_user_access (user_id, layer_id) VALUES (#{userId}, #{layerId});
```

트랜잭션: L4는 한 트랜잭션에서 "DELETE → INSERT들" 순서여야 한다. JPA는 `entityManager.flush()`로 DELETE를 먼저 내보낸다
(`LayerService.java:213-214`, UNIQUE(user_id, layer_id) 충돌 방지). MyBatis는 같은 `@Transactional` 안에서 순서대로 실행하면 된다.
**`PUT []`(빈 배열)은 결과적으로 초기화와 같다** — 다음 GET이 `null`을 준다.
같은 id를 배열에 두 번 넣으면 UNIQUE 위반으로 500(추론).

### L6~L12. 레이어 관리 API

| # | 요청 | 응답 `data` | SQL 등가물 / 주의 |
|---|---|---|---|
| L6 GET `/api/layers` | - | `LayerResponse[]` | L1의 layer SELECT |
| L7 POST | `LayerRequest` JSON | `LayerResponse` | groupId가 있으면 그룹 존재 확인(`LAYER_GROUP_NOT_FOUND`) → `INSERT INTO tbl_layer (…, group_name = 그룹 이름, created_at = now(), updated_at = now())`. `type`, `sourceType`은 **대문자로 바꿔 저장** |
| L8 PUT `/{id}` | `LayerRequest` | `LayerResponse` | 레이어 존재 확인(`LAYER_NOT_FOUND`) → 그룹 확인 → `UPDATE tbl_layer SET <모든 컬럼>, group_name = 그룹 이름, updated_at = now() WHERE id = #{id}`. 요청에 없는 필드는 null/기본값으로 **덮어쓴다**(부분 수정 아님) |
| L9 DELETE `/{id}` | - | `null` | 존재 확인 → `DELETE FROM tbl_layer_permission_access WHERE layer_id = #{id}` → `DELETE FROM tbl_layer_user_access WHERE layer_id = #{id}` → `DELETE FROM tbl_layer WHERE id = #{id}` (한 트랜잭션) |
| L10 PUT `/reorder` | `{"layers":[{"id","sortOrder","groupId"}], "groups":[{"id","sortOrder","parentId"}]}` | `null` | 항목마다 존재 확인 후 `UPDATE tbl_layer SET sort_order, group_id, group_name = (그룹 이름 또는 NULL), updated_at = now() WHERE id` / `UPDATE tbl_layer_group SET parent_id, sort_order, updated_at = now() WHERE id`. 하나라도 없으면 404로 전체 롤백 |
| L11 GET `/permissions/{p}` | - | `number[]` (행 없으면 `[]`, **null 아님**) | `SELECT layer_id FROM tbl_layer_permission_access WHERE permission = #{p}` |
| L12 PUT `/permissions/{p}` | JSON 배열 | `null` | L4와 같은 "전부 삭제 → 재삽입" (`DELETE … WHERE permission = #{p}` → id마다 존재 확인 + INSERT) |

`LayerRequest`(코드 확인: `…/domain/map/dto/LayerRequest.java`): `name`*, `type`*, `sourceType`*, `url`*(*=`@NotBlank`, 실패 시 **500**),
`layerName, styleName, styleConfig, format, projection, minZoom, maxZoom, opacity(기본 1.0), visible(기본 true), sortOrder(기본 0), groupId, description`.

JPA 참고: L8·L10은 `save()` 호출 없이 **변경 감지(dirty checking)**로 커밋 때 UPDATE가 나간다(`LayerService.java:141-182`).
Hibernate 기본은 바뀐 컬럼만이 아니라 **모든 컬럼**을 UPDATE한다(추론: `@DynamicUpdate` 없음).

### G1~G4. 레이어 그룹 관리 API

| # | 요청 | 응답 `data` | SQL 등가물 / 주의 |
|---|---|---|---|
| G1 GET | - | `LayerGroupResponse[]`(평면, `children`/`layers`는 빈 배열) | L1의 group SELECT |
| G2 POST | `{"name"*, "parentId", "sortOrder"}` | `LayerGroupResponse` | parentId 존재 확인 → `INSERT INTO tbl_layer_group (name, parent_id, sort_order, created_at, updated_at) VALUES (…, now(), now())` |
| G3 PUT `/{id}` | 같음 | `LayerGroupResponse` | 존재 확인 → `UPDATE tbl_layer_group SET name, parent_id, sort_order, updated_at = now() WHERE id`. **`tbl_layer.group_name`은 갱신 안 함**(`ddl.md` 3절) |
| G4 DELETE `/{id}` | - | `null` | 존재 확인 → `DELETE FROM tbl_layer_group WHERE id`. **자식 그룹·소속 레이어 정리 없음**(`ddl.md` 3절) |

`parentId`에 자기 자신이나 자손을 넣어도 막지 않는다(코드 확인: `LayerGroupService.java:39-45`에 순환 검사 없음). 순환이 생기면 트리 조립에서
그 그룹들이 어느 루트에도 안 붙어 **화면에서 사라진다**(추론).

---

## 5. 나만의지도 (`domain/mymap`)

모든 `/api/mymap/**`는 로그인 필요. userId·roleCodes는 `GisUserContext`에서 온다.

### U1. GET `/api/mymap` — 내가 볼 수 있는 목록

응답 `data` = `UserMapListItem[]`(코드 확인: `…/domain/mymap/dto/UserMapListItem.java:10-20`):
`id, name, description, sourceType, geomType, status, visible, featureCount, owner(내가 소유자인지), styleConfig, createdAt`. 최신순.

현재 동작(코드 확인: `UserMapService.java:30-37`, `UserMapPermissionService.java:54-62`): 공유받은 id 목록을 구하고, **전체 지도를 읽어서**
자바에서 "소유자이거나 공유 id에 포함"인 것만 남긴다. MyBatis에선 한 SQL로 줄이는 것을 권장:

```sql
-- userMap.selectVisibleTo   (결과 동일, 전체 로드 없음)
SELECT m.id, m.name, m.description, m.source_type, m.geom_type, m.status, m.visible, m.feature_count,
       m.style_config, m.created_at,
       CASE WHEN m.owner_id = #{userId} THEN 1 ELSE 0 END AS owner
FROM tbl_user_map m
WHERE m.owner_id = #{userId}
   OR m.id IN (SELECT ua.user_map_id FROM tbl_user_map_user_access ua WHERE ua.user_id = #{userId})
   <if test="roleCodes != null and roleCodes.size() > 0">
   OR m.id IN (SELECT pa.user_map_id FROM tbl_user_map_permission_access pa
               WHERE pa.role_code IN <foreach item="r" collection="roleCodes" open="(" separator="," close=")">#{r}</foreach>)
   </if>
ORDER BY m.created_at DESC;
```

JPA가 실제로 내는 SQL(추론): `SELECT … FROM tbl_user_map_user_access WHERE user_id = ?`, `SELECT … FROM tbl_user_map_permission_access WHERE role_code IN (…)`,
`SELECT … FROM tbl_user_map ORDER BY created_at DESC`(전체).

### U2. GET `/api/mymap/{id}/status`

응답 `data` = `{ "id", "status", "errorMessage", "featureCount" }`. 에러: 404 `USER_MAP_NOT_FOUND` → 403 `USER_MAP_FORBIDDEN` 순.

```sql
-- userMap.selectById
SELECT * FROM tbl_user_map WHERE id = #{id};
-- 열람 권한 (UserMapPermissionService.canView, :30-39): 소유자면 통과, 아니면
SELECT COUNT(*) FROM tbl_user_map_user_access WHERE user_map_id = #{id} AND user_id = #{userId};
-- 0이고 roleCodes가 있으면
SELECT COUNT(*) FROM tbl_user_map_permission_access
WHERE user_map_id = #{id} AND role_code IN (<foreach …>);
```

JPA는 두 번째·세 번째를 "그 지도의 공유 행 전부 SELECT 후 자바에서 비교"로 한다(`findAllByUserMap`). 결과는 같다.

### U3. GET `/api/mymap/{id}/geojson` — 봉투 없는 FeatureCollection

1. 검증을 **응답 스트림을 열기 전에** 끝낸다: U2와 같은 존재·권한 검사 + `status = 'READY'`가 아니면 409 `USER_MAP_NOT_READY`
   (코드 확인: `UserMapController.java:48-56`, `UserMapService.java:63-70`). 스트림을 연 뒤 예외가 나면 봉투 에러를 못 만든다.
2. 피처를 커서로 한 행씩 읽어 문자열을 이어 붙여 바로 쓴다(코드 확인: `UserMapService.java:79-118`):

```sql
-- userMapFeature.streamByMap   (JdbcTemplate, fetchSize 500)
SELECT geometry_json, properties_json FROM tbl_user_map_feature WHERE user_map_id = #{id};
```

출력 형식: `{"type":"FeatureCollection","features":[{"type":"Feature","geometry":<geometry_json>,"properties":<properties_json 또는 {}>}, …]}`.
- `ORDER BY`가 없다 → 피처 순서는 보장되지 않는다(보통 삽입 순). 순서가 필요하면 `ORDER BY id`(인덱스 권장).
- PostgreSQL은 **자동 커밋이 꺼진 트랜잭션 안에서만** fetchSize 커서가 동작한다(추론: PG JDBC 규칙). 서비스 메서드가 `@Transactional(readOnly = true)`인 이유.
  MyBatis는 `ResultHandler` + `fetchSize="500"` + `resultSetType="FORWARD_ONLY"`로(예시: `egov-jdk11-checklist.md` 6절).
- `feature` 속성은 파싱하지 않는다. DB의 JSON 텍스트가 곧 응답이다 → 저장할 때 유효한 JSON이어야 한다.

### U4. DELETE `/api/mymap/{id}` (소유자만) · U13. DELETE `/api/admin/mymap/{id}` (SUPER_ADMIN, 소유자 검사 없음)

```sql
SELECT * FROM tbl_user_map WHERE id = #{id};                              -- 404
-- (U4만) owner_id = #{userId} 아니면 403
DELETE FROM tbl_user_map_user_access       WHERE user_map_id = #{id};     -- JPA: SELECT 후 건별 DELETE
DELETE FROM tbl_user_map_permission_access WHERE user_map_id = #{id};     -- JPA: SELECT 후 건별 DELETE
DELETE FROM tbl_user_map_feature           WHERE user_map_id = #{id};     -- JPA도 벌크 DELETE (@Modifying JPQL)
DELETE FROM tbl_user_map                   WHERE id = #{id};
```

한 트랜잭션(코드 확인: `UserMapService.java:127-134, 161-167`). 피처가 많으면 오래 걸리므로 `user_map_id` 인덱스가 필요하다(`ddl.md` 6절).

### U5. POST `/api/mymap/upload/shp` (multipart)

- 요청 파트: `files`(여러 개: .shp/.shx/.dbf/.prj, 필수 .shp·.dbf), `name`(필수 파라미터), `description`(선택), `sourceSrid`(선택, 기본 `EPSG:5186`).
- 응답 `data` = `{ "id", "name", "status": "PROCESSING" }`. 처리는 **비동기**라 프론트가 U2로 폴링한다.
- 순서(코드 확인: `UserMapUploadService.java:62-119`, `UserMapProcessor.java:44-94`):
  1. 파일을 `MYMAP_UPLOAD_DIR`(기본 `./mymap-uploads`)에 `UUID.확장자`로 저장. `.prj`가 있으면 `PrjParser`로 좌표계 판별 → 판별되면 사용자 선택보다 우선.
  2. `INSERT INTO tbl_user_map (name, description, owner_id, source_type='SHP', source_srid, status='PROCESSING', visible=true, feature_count=0, created_at=now(), updated_at=now())`
     — **트랜잭션 없이 즉시 커밋**(메서드에 `@Transactional`을 일부러 안 붙임: 비동기 스레드가 커밋 전 행을 못 보는 문제).
  3. `@Async processShp`: `SELECT * FROM tbl_user_map WHERE id` → GeoTools로 피처를 읽으며 4326 변환 → **1000건 단위 배치 INSERT**:
     `INSERT INTO tbl_user_map_feature (user_map_id, geometry_json, properties_json) VALUES (?, ?, ?)` (`FeatureBatchInserter.java:16-18, 37-42`)
  4. 성공: `UPDATE tbl_user_map SET status='READY', geom_type=<첫 피처 타입>, feature_count=<건수>, error_message=NULL, updated_at=now() WHERE id`
     실패: `UPDATE … SET status='FAILED', error_message=<예외 메시지>, updated_at=now() WHERE id`. 임시 파일은 끝나면 삭제.
- 주의: 비동기 처리에 트랜잭션이 없어 **실패해도 이미 들어간 피처 배치는 남는다**(추론). 이식할 때 실패 시 `DELETE … WHERE user_map_id` 정리를 권장.
  JPA의 `save(map)`은 분리된 엔티티라 merge → `SELECT` 후 **모든 컬럼 UPDATE**(추론).

### U6. POST `/api/mymap/upload/excel/preview` (multipart `file`)

- DB 접근 없음. `.xlsx`만(아니면 400). 파일을 `MYMAP_UPLOAD_DIR/{uploadId}.xlsx`에 저장하고 `uploadId → 경로`를 **서버 메모리 맵**에 보관
  (코드 확인: `UserMapUploadService.java:48-49, 127-165`).
- 응답 `data` = `{ "uploadId", "headers": [첫 행], "sampleRows": [최대 5행, 문자열] }`.
- 메모리 보관이라 **서버 재시작·다중 인스턴스에서 confirm이 404**가 된다(코드 주석이 "단일 인스턴스 배포 기준"이라고 명시).

### U7. POST `/api/mymap/upload/excel/confirm` (JSON)

- 요청: `{ "uploadId", "name", "description", "latColumn", "lonColumn", "titleColumn", "sourceSrid" }`
  (`titleColumn`은 DTO에만 있고 쓰이지 않음, 프론트는 `description`·`titleColumn`을 안 보냄).
- 응답 `data` = `{ "id", "name", "status" }` — **처리가 끝난 상태**(동기 처리).
- 순서(코드 확인: `UserMapUploadService.java:167-240`, 메서드 전체 `@Transactional`):
  1. 메모리 맵에 uploadId 없음 → 404 `EXCEL_UPLOAD_NOT_FOUND`
  2. `INSERT INTO tbl_user_map (… source_type='EXCEL', source_srid=<요청 또는 EPSG:5186>, status='PROCESSING' …)`
  3. 헤더에서 위도/경도 컬럼을 못 찾으면 400 `INVALID_COORDINATE_COLUMN` → **트랜잭션 전체 롤백**이라 2의 행도 사라진다(FAILED로 남지 않음, 추론)
  4. 행마다 좌표 → 4326 변환 → Point GeoJSON + 모든 컬럼을 문자열 속성으로 → 배치 INSERT(U5와 같은 SQL, 같은 트랜잭션 — 추론: JdbcTemplate이 JPA 트랜잭션 커넥션을 공유)
  5. `UPDATE tbl_user_map SET status='READY', geom_type='POINT', feature_count=<건수> …`
  6. 그 밖의 예외는 잡아서 `status='FAILED'`로 **커밋하고 200 성공 응답**(이미 넣은 피처도 커밋, 추론). 임시 파일·메모리 항목은 항상 삭제.

### U7a. 주소 모드(`mode=ADDRESS`, `addressColumn`) — 도로명·지번 주소 → PNU 매칭 규칙·쿼리 (구현: `mymap/util/AddressNormalizer` + `mymap/infra/TableAddressResolver` + `JdbcAddressRefReader`)

확정 요청 `{uploadId, name, mode:"ADDRESS", addressColumn}` — 검사·한도(5,000행)·비동기 처리·보고서는 PNU 모드와 같고, 행의 키(PNU)를 **주소로 만드는 단계**만 다르다. 주소 자료(`ti_spbd_buld`·`ti_sprd_stret`)의 적재 기록(`ref.load_meta`)이 `READY`가 아니면 확정은 503 `MYMAP_REF_UNAVAILABLE`(처리를 시작하지 않음), 주소 컬럼이 없으면 400 `MYMAP_COLUMN_REQUIRED`("주소에 쓸 컬럼을 선택하세요."). 레이어 `source_kind='EXCEL_ADDRESS'`. 미리보기 `suggestions.mode`는 PNU → 좌표 → **주소** 순으로 먼저 맞는 것(주소 컬럼 = 값의 60% 이상이 도로명/지번 모양, 또는 머리글에 주소·소재지·지번·도로명·address가 있고 하나라도 주소 모양).

**1) 정규화·분류(순수 함수, DB 없음)** — 한 칸에 도로명/지번이 섞여도 이름 토큰의 끝 글자로 가른다.

| 처리 | 규칙 |
|---|---|
| 정리 | NFKC(전각→반각), `(…)`·`[…]` 제거, 쉼표→공백, 대시 변형→`-`, `12 - 3`→`12-3`, `12번지 3호`→`12-3`, `12번지`→`12`, 앞 5자리 우편번호 제거 |
| 붙여 쓴 토큰 | `산12-3`→`산 12-3`, `지하110`→`지하 110`, `세종대로110`→`세종대로 110`(이름이 로·길·동·읍·면·리·가로 끝날 때) |
| 떨어져 쓴 이름 조각 | `중앙로 1길`·`보수대로 289번길`→`중앙로1길`·`보수대로289번길`(길 조각), `종로 1가`→`종로1가`(가 조각) — 건물DB의 도로명엔 공백이 없다 |
| 시도 | 첫 토큰이 약칭이면 현행·옛 정식명 후보로 확장(서울→서울특별시, 경기→경기도, 강원→강원특별자치도·강원도, 전북→전북특별자치도·전라북도, 전남→전라남도·전남광주통합특별시, 광주→광주광역시·전남광주통합특별시 등). `광주`는 다음 토큰이 `…구`일 때만 시도(`광주시`는 경기도의 시). 시도처럼 생겼는데 모르는 이름(…특별시/광역시/특별자치시/특별자치도, 3자 이상 …도)이면 `SIDO_UNKNOWN` |
| 번호 | 시도 뒤 첫 순수 숫자 토큰(`본번[-부번]`). 그 앞 토큰이 `지하`면 지하, `산`이면 산. 번호 뒤는 전부 버림(건물명·동·호·층·`외 N필지`). 지번 본번·부번 ≤ 9999(PNU 4자리), 도로 건물본번 ≤ 99999, 본번 ≥ 1, 아니면 `PARSE_FAILED` |
| 분류 | 번호 앞 이름 토큰이 `로`·`길`로 끝나면 **도로명**, `동`·`읍`·`면`·`리`·`가`로 끝나면 **지번**, 아니면 `PARSE_FAILED`. 번호가 없으면: 이름이 로·길 → `BUILDING_NO_NOT_FOUND`, 동·읍·면·리·가 → `JIBUN_MISSING`, 그 외 `PARSE_FAILED` |
| 같은 주소 | 정리한 문장이 같으면 한 번만 푼다(호출 안에서, 그리고 가져오기 작업 안에서) |

**2) 지번 주소 — 메모리 사전(DB 조회 없음)**: 사전은 건물정보의 distinct 행정구역을 한 번 읽어 만든다(약 1.9만 건, 기준월=`load_meta`의 `ti_spbd_buld` version이 바뀌면 다시 만든다). 새 표·인덱스 없음.
```sql
SELECT DISTINCT adm_cd, ctp_kor_nm, sig_kor_nm, emd_kor_nm, li_kor_nm FROM ref.ti_spbd_buld;   -- 전국 약 3초
```
사전 키 = 리가 있으면 리 이름, 없으면 읍면동 이름. 입력 이름 토큰으로 후보를 모은 뒤 ① 시도(확장된 정식명 중 하나) ② 읍면동 토큰(리가 있는 법정동이면 앞 토큰이 그 읍면동일 때 먹음) ③ 남은 토큰은 전부 그 법정동의 시군구(`수원시 장안구`의 각 토큰, `수원`처럼 시·군·구를 뺀 약칭 허용)에 맞아야 한다. 법정동코드 중복 없이 1개 → PNU, 여럿 → `AMBIGUOUS`(후보 문장 `시도 시군구 읍면동 [리] [산] 번지`, 최대 5개), 0개 → `LEGAL_DONG_NOT_FOUND`(행정동 `상계1동`·옛 이름·리 없이 쓴 면 포함).

**3) 도로명 주소 — 쿼리 2번(묶음)**
```sql
-- (a) 도로명 → road_cd 후보. 호출 한 번에 서로 다른 도로명 500개씩. 사용 중(use_yn='0')이고 말소일자가 없는 것이 active
SELECT road_cd, ctp_kor_nm, sig_kor_nm, rn,
       bool_or(coalesce(use_yn,'0') = '0' AND coalesce(ersr_de,'') = '') AS active
FROM ref.ti_sprd_stret WHERE rn = ANY(?::varchar[]) GROUP BY road_cd, ctp_kor_nm, sig_kor_nm, rn;

-- (b) 건물번호 → 대표 지번. 키 500개씩(지하여부 0/1 + 건물본번·부번), (road_cd, udgd_yn, buld_mnnm, buld_slno) 인덱스를 탄다. 폐지 제외
SELECT b.road_cd, b.udgd_yn, b.buld_mnnm, b.buld_slno, b.adm_cd, b.mntn_yn, b.lnbr_mnnm, b.lnbr_slno,
       b.ctp_kor_nm, b.sig_kor_nm, b.emd_kor_nm, b.li_kor_nm, b.rn
FROM unnest(?::varchar[], ?::varchar[], ?::int[], ?::int[]) AS k(road_cd, udgd_yn, buld_mnnm, buld_slno)
JOIN ref.ti_spbd_buld b ON b.road_cd = k.road_cd AND b.udgd_yn = k.udgd_yn AND b.buld_mnnm = k.buld_mnnm AND b.buld_slno = k.buld_slno
WHERE coalesce(b.mv_rs_cd,'') NOT IN ('63','72');
```
- (a) 후보를 시도·시군구 토큰(`…시`·`…군`·`…구`로 끝나는 지역 토큰, 읍면동 토큰은 쓰지 않음)으로 좁힌다. 좁힌 뒤 `active`가 하나라도 있으면 active만. 시군구가 없는 도로(세종)는 시군구 토큰 검사를 건너뛴다. 0개면 **지번으로 한 번 더**(세종로처럼 `로`로 끝나는 법정동) 풀어 보고 안 되면 `ROAD_NOT_FOUND`.
- (b) 좁힌 `road_cd`마다 건물번호 키를 만들어 조회. 같은 도로명주소에 건물이 여럿(건물군)이어도 PNU가 다른 경우는 전체 약 10건뿐 — **PNU가 가장 작은 것**을 대표로 쓴다(실행마다 같은 결과).
- 판정: 건물이 한 곳에도 없음 → `BUILDING_NO_NOT_FOUND`. 건물이 있는 도로가 **하나뿐**이고 **시도를 적었거나** 후보 도로가 한 시도·시군구에만 있으면 → 확정(시도를 적었으면 도로명이 그 시도의 여러 구에 걸쳐도 해당 번호 건물이 한 곳이면 확정). **시도도 없고** 후보 도로가 둘 이상의 시도·시군구에 걸쳤으면(건물이 한 곳뿐이어도 — 오타 하나로 다른 도에 찍히는 위험), 또는 **같은 범위에 같은 번호 건물이 둘 이상**이면 → **고르지 않고 `AMBIGUOUS`**(건물이 있는 후보만, `시도 시군구 도로명 [지하] 번호 (법정동)`, 최대 5개, 정렬; 후보가 1개일 수도 있다).
- 번호 뒤에 숫자만 남은 꼬리(`226 12`·`422 5`)는 부번인지 알 수 없어 `PARSE_FAILED`. `422번지 5`·`422번지 5호`는 `422-5`, `12번지 3호`는 `12-3`. 상세주소(`101동 202호`·`3층`·괄호)는 번호 뒤라서 버린다. 주소 한 칸이 300자를 넘으면 읽지 않고 `PARSE_FAILED`(정규식 처리 시간 상한).
- 사유 문구(백엔드 `ImportFailureReason`·프론트 `ui/mymap/format.ts`·이 문서가 같아야 한다): `AMBIGUOUS` = "같은 이름이 여러 곳에 있어 정하지 못했습니다(시도·시군구를 붙여 주세요)"(후보가 1개여도 맞는 문장), `LEGAL_DONG_NOT_FOUND` = "법정동을 찾지 못했습니다(행정동·옛 이름이면 법정동 이름으로 바꿔 주세요)".

**4) PNU 공식**: `adm_cd(10) || (산이면 '2' 아니면 '1') || lpad(본번,4,'0') || lpad(부번,4,'0')` (건물DB: `adm_cd || (mntn_yn::int + 1) || lpad(lnbr_mnnm,4,'0') || lpad(lnbr_slno,4,'0')`). 그 뒤는 PNU 모드와 같다: 허용 시도 검사 → `PnuParcelProvider.findByPnus`(500개씩, 시도 파티션) → 없으면 `PARCEL_NOT_FOUND`(보고서 입력값은 **주소 원문**).

**5) 실패 사유와 보고서**: `PARSE_FAILED`·`SIDO_UNKNOWN`·`LEGAL_DONG_NOT_FOUND`·`JIBUN_MISSING`·`ROAD_NOT_FOUND`·`BUILDING_NO_NOT_FOUND`·`AMBIGUOUS`·`OUT_OF_COVERAGE`·`PARCEL_NOT_FOUND`·`EMPTY`. `AMBIGUOUS`는 `tbl_user_map_import_failure.candidates_json`(문자열 JSON 배열)에 후보 문장을 남기고 보고서 `rows[].candidates`·실패 행 엑셀에 나온다. 실패 행의 `input_value`는 주소 원문(500자 절단).

**6) 성능(실측, 2026-09 자료·운영 DB 읽기 전용 확인)**: 사전 만들기 약 3초(한 번), 무작위 도로명주소 5,000건 해석 0.8초(500건 묶음 10회), 폴리곤 조회 4.7초 — 5,000행 가져오기가 십여 초. 도로명주소 98.6%·지번 99.6%가 지적도 폴리곤을 찾는다(나머지는 `PARCEL_NOT_FOUND`).

**7) 이식 방법**: 해석 규칙은 `AddressRefReader`(좁은 인터페이스: `readyVersion()`·`legalDongs()`·`findRoadCodes(names)`·`findBuildings(keys)` 4개) 뒤에 있다. 업무 프로젝트(MyBatis/Oracle)는 이 인터페이스만 다시 구현하면 `AddressNormalizer`·`TableAddressResolver`를 그대로 쓴다. 주소 API(juso.go.kr 등)를 쓰려면 `AddressResolver` 포트 구현을 통째로 바꾼다.

### U8·U9. `/api/mymap/{id}/share` (소유자만) — 공유 대상 조회·저장(통째로 바꾸기)

- U8 GET → `{ users:[{userId, name, state}], roles:[{code, label, state}] }`. `state`는 `ACTIVE`·`INACTIVE`(비활성 사용자)·`MISSING`(없는 대상 — 예전에 세부권한 코드 단독으로 저장돼 죽은 공유 등). 소유자가 아니면 403.
- U9 PUT `{ userIds:[…], roleCodes:[…] }` → `null`. 두 목록을 통째로 바꾼다. **같은 값이 중복돼도 500이 아니라 한 번만 저장**, 본인(소유자)은 조용히 제외, **새로 추가하는 대상만** 존재를 검사(이미 있던 대상은 검사하지 않음), 대상은 사용자+역할 합쳐 100개까지(초과 400), 잘못된 대상은 400이고 아무것도 바꾸지 않는다.
- 저장 구조: `tbl_user_map_user_access(user_map_id, user_id)`·`tbl_user_map_permission_access(user_map_id, role_code)`. 역할 칸의 값은 `역할코드` 또는 `역할코드:세부권한`(예: `MAP_USER:DEPT_A`)이다. **세부권한 코드에는 `:`를 쓸 수 없다**(400).
- 공유받은 쪽의 보임 판정은 현재 사용자의 그룹 코드 `[역할, 역할:세부]`(`GisUserContext.currentShareGroupCodes()`)로 한다. 이식할 때 이 메서드가 호스트의 "역할·부서" 체계에 맞는 코드 목록을 돌려주면 된다(기본 구현은 `currentRoleCodes()`만).

### U19·U20. 일괄 공유 `GET /api/mymap/shares?ids=` · `POST /api/mymap/shares/bulk`

- GET: 선택한 레이어들(최대 50개, 중복 제거 후 초과·비었거나 숫자가 아니면 400 `SHARE_BULK_INVALID`)의 현재 공유를 레이어별로 `[{ id, users:[{userId, name, state}], roles:[{code, label, state}] }]`(요청 순서)로 준다 — 항목 모양은 U8과 같다. 프론트가 "2/3개 레이어" 같은 표시를 이 목록에서 센다. 남의 레이어나 없는 레이어는 응답에서 제외(존재 여부를 드러내지 않는다).
- POST `{ ids:[…], mode:"ADD"|"REMOVE", userIds:[…], roleCodes:[…] }` → `{ succeededIds:[…], failed:[{id, reason:"NOT_AVAILABLE"|"LIMIT_EXCEEDED"}] }`. **더하기/빼기만 있고 덮어쓰기는 없다.** ADD는 새 대상의 존재를 검사하고(틀리면 400·무변경), REMOVE는 검사하지 않는다. 레이어 50개·대상 100개 상한, 소유한 레이어만 처리(남의/없는 레이어는 `NOT_AVAILABLE`로 건너뜀), 전체를 한 트랜잭션으로 처리한다.
- 목록 `GET /api/mymap` 항목에 `ownerName`(**공유받은 항목에만**, 이름을 못 찾으면 null — 목록은 그대로 나간다)과 `shareCount`(**내 레이어에만**, 공유가 없으면 0, 공유받은 레이어는 null)가 붙는다.

### U21·U22. 공유 상대 검색 — `GET /api/gis/share-directory/users` · `/groups` (로그인만, 지도 도메인 밖 `global/gis/share`)

- `users?q=&limit=`: 이름·아이디 부분 일치(**2~50자**, 아이디는 앞부분 일치만, LIKE 특수문자 이스케이프), 최대 20건, **본인과 비활성 사용자 제외**, 사용자별 분당 60회 제한(넘으면 429 `SHARE_DIRECTORY_RATE_LIMITED` "잠시 후 다시 검색하세요."), 검색어가 2~50자가 아니면 400 `SHARE_QUERY_INVALID`. 응답 `[{userId, name, groupLabel}]` — **이메일·역할은 주지 않는다**(개인정보 최소화).
- `groups`: 공유 대상으로 고를 역할 목록 `[{code, label, parentCode?}]`(한글 이름은 DB의 label, 세부권한은 `역할:세부` 코드 + `parentCode`), **슈퍼관리자 역할은 제외**.
- 구현은 인터페이스 `GisShareDirectory`(`global/gis/share`)와 GTProject용 `JdbcGisShareDirectory`(SQL로만 조회, member 도메인 import 없음)다. **이식할 때 이 구현 하나를 호스트의 사용자·역할 저장소에 맞게 다시 쓴다**(전자정부 스켈레톤: `egov-jdk11-checklist.md` 8절).
- 보안: `/api/gis/**`는 `SecurityConfig`에서 `authenticated()`로 등록해야 한다(빠뜨리면 `anyRequest().permitAll()`로 로그인 없이 열린다). 같은 설정에서 `/api/users/**`는 `hasAnyRole(SUPER_ADMIN, ADMIN, MAP_ADMIN)`로 제한한다(예전에는 로그인만 하면 사용자 쓰기까지 열려 있었다).

### U10. PATCH `/api/mymap/{id}` — 부분 수정(스타일 저장에 쓴다)

- 요청 `{ name?, description?, styleConfig?, visible? }` — **보낸 필드만 바꾼다**(안 보낸 값·`null`은 그대로). 공백 `name`은 무시, `name` 100자·`description` 300자는 잘라 저장, `styleConfig`가 `""`이면 비워서 기본 스타일로 돌린다. `styleConfig`는 **JSON 문자열**이다.
- **소유자만**(공유받은 사용자·타인·비소유 SUPER_ADMIN은 403 `이 나만의지도에 대한 권한이 없습니다.`). 소유자 확인이 스키마 검사보다 먼저다. 위반은 400 `스타일 설정이 올바르지 않습니다: <항목 경로> — <이유>`.
- 엔티티는 `@DynamicUpdate`(바뀐 칸만 UPDATE) — 이식할 때도 전체 칸을 덮어쓰면 통계(`column_schema`)·진행률이 옛 값으로 되돌아간다(실제 결함이었다).

#### styleConfig 스키마 v1 (서버가 저장 전에 검사, 모르는 키는 거절, 전체 16KB 이하)

| 키 | 형식·범위 |
|---|---|
| `v` | 필수, 정수 1 |
| `display` | `"polygon"` | `"point"` |
| `fill`·`stroke`·`pointColor`·`pointStroke` | 색 `#rrggbb[aa]`만. `pointColor` 없으면 `stroke`를 따르고 `pointStroke` 없으면 흰색 |
| `fillOpacity` 0~1 · `strokeWidth` 0~20 · `pointRadius` 1~50 · `pointStrokeWidth` 0~10 | 숫자 |
| `classify` | `null` 또는 범주형 `{type:"categorical", field, classes:[{value,color}] 1~12개, otherColor?}` 또는 구간형 `{type:"graduated", field(숫자 컬럼), method:"quantile"|"equal"|"manual", breaks(색 개수−1개, 오름차순, 각 절댓값 < 1e15), colors 3~7개(알파 없는 #rrggbb)}` |
| `label` | `null` 또는 `{field, size 8~40, color, halo, minZoom 정수 0~28}` |
| `popup` | `null`/없음 = 기본(앞 5개 컬럼), `{fields:[…]}` 0~30개, `fields: []` = 팝업 끔 |

`field`·`label.field`·`popup.fields`는 그 레이어의 컬럼 이름이어야 한다(레이어가 처리 중이라 컬럼을 모르면 이름 검사만 건너뜀).

### U14. GET `/api/mymap/quota` — 한도와 적재 범위

레이어 수·행 수 한도(PNU·주소·좌표 각 5,000행, 레이어 20개, shp 10만 피처/300MB)와 `coverage`(연속지적도 적재 시도 `sidoCodes`·`nationwide`·`loaded[{sido,version}]`, `ref.load_meta` 기준)를 준다. 적재가 없으면 비어 있고 PNU 모드는 503.

### U15. GET `/api/mymap/samples/{kind}` — 샘플 엑셀(`pnu`·`address`·`coord`, 봉투 없는 xlsx, `Content-Disposition: attachment`)

### U16·U17. GET `/api/mymap/{id}/import-report`(`?page&size&reason`) · `/import-report.xlsx` — 업로드 결과 보고서와 실패 행 엑셀(소유자만)

응답: 전체·매칭·실패 건수, 사유별 건수, `duplicatePnuCount`, 실패 행 `{rowNo, inputValue, reason, candidates}` 쪽 넘김. 실패 사유 코드 13종(PNU_FORMAT·PNU_NOT_FOUND·EMPTY·…). 실패 행 원본은 30일 뒤 삭제(개인 주소 보호). 실패 행 엑셀은 셀이 `=` `+` `-` `@`로 시작하면 수식으로 실행되지 않게 글자 칸으로 저장한다.

### U18. GET `/api/mymap/{id}/columns` — 컬럼 통계(스타일 대화상자용)

`{v, rowCount, truncated, columns:[{name, kind:"number"|"text", filled, numericCount, distinct, distinctCapped, min?, max?, quantiles?(21개), top[{value,count}] 20개}]}`. 볼 수 있는 사람만, 처리 중·실패 레이어는 409. 업로드가 끝날 때 `column_schema`에 기록한다.
**숫자 판정 규칙**(서버 `NumericText`와 프론트 `readNumber`가 같아야 함): NFKC·JS `trim` 공백 정리 뒤 `^[+-]?(d+(.d*)?|.d+)([eE][+-]?d+)?$` 또는 올바르게 묶은 천 단위 쉼표만 숫자. 앞자리 0 코드(`007`)·`12%`·`NaN`·**절댓값 1e15 이상**은 숫자가 아니다. 컬럼은 값 있는 칸의 90% 이상이 숫자면 `number`. 공유 시험 표 `backend/src/test/resources/mymap/numeric-cases.json`(138건).

### U23. POST `/api/mymap/upload/excel/convert` — 주소 변환("엑셀로만 받기"): 지도에 올리지 않고 결과 엑셀만 (구현: `mymap/service/AddressConvertService`)

요청 JSON `{ uploadId, addressColumn, include:{pnu, roadAddress, jibunAddress, lonLat, area}, srid: 4326|5186|5179|3857 }`(include 생략 시 area만 끈 기본, srid 생략 시 4326). 응답 `ApiResponse<{ total, matched, failed, fileName, fileBase64, preview:{columns:[], rows:[[]]} }>` — `fileBase64`는 결과 .xlsx, `preview`는 앞 5행(결과 파일과 같은 열·값, 모두 문자열).

1. **지도 레이어를 만들지 않는다(`tbl_user_map`·`tbl_user_map_feature` 쓰기 0), 결과를 서버에 저장하지 않는다.** 올린 임시 파일(uploadId)은 **변환이 성공한 직후에만** 지운다(성공 뒤 같은 uploadId는 404). 실패하면 — 검사 단계 거절(컬럼·좌표계·한도·503·429)이든 변환 도중 오류(503·413·500 등)든 — 지우지 않고 남겨 **같은 uploadId로 다시 시도**할 수 있게 하며, 남은 파일은 만료 정리(미리보기 TTL 30분, `PendingUploadRegistry.sweepExpired`·고아 파일 정리)가 지운다. **개인정보 안내 문구(정확한 표현)**: "엑셀로만 받기는 결과를 저장하지 않으며, 올린 임시 파일은 변환 성공 직후 지우고 실패하면 30분 만료 때 지운다." 사용자 락(`ImportGuard`)과 전체 동시 실행 칸(2)은 어느 경로에서도 `finally`로 돌려준다.
2. 검사(순서): 업로드 없음·남의 업로드 404 `EXCEL_UPLOAD_NOT_FOUND` → 주소 컬럼이 머리글에 없음 400 `MYMAP_COLUMN_REQUIRED` → srid가 네 가지 밖 400 `MYMAP_SRID_UNSUPPORTED` → 행 수 > 5,000 400 `MYMAP_ROW_LIMIT`(읽는 도중에도 다시 검사) → 지적도·주소 자료 준비 안 됨 503 `MYMAP_REF_UNAVAILABLE` → 같은 사용자의 가져오기·변환이 돌고 있거나 전체 동시 2건 초과 429 `MYMAP_IMPORT_BUSY`. 결과 파일이 `limits.maxConvertResultMb`(25)를 넘으면 413 `MYMAP_FILE_TOO_LARGE`("변환 결과가 너무 큽니다(최대 25MB). 행을 나눠 올려 주세요").
   **배포 주의(운영 프록시)**: 처음 보는 PNU 묶음은 대표점 쿼리가 묶음(500개)당 3.5~5.3초라(실측), 5,000행이 차가운 DB에서는 35~50초가 걸릴 수 있다. 프록시(nginx) 읽기 제한 시간을 **최소 120초**로 둔다 — 변환 경로 `/api/mymap/upload/excel/convert`에 `proxy_read_timeout 120s;`(기본 60초면 504로 끊긴다).
3. 처리: 시트 읽기(셀 보이는 값, 한 번) → 주소 풀기(U7a, 같은 주소 한 번·500개씩) → 표준 주소 → 필지 대표점·면적(PNU 묶음 500) → 결과 엑셀(SXSSF). **필지를 지적도에서 못 찾으면 PNU·표준 주소는 보여 주되 실패(PARCEL_NOT_FOUND)로 센다**(가져오기와 같은 판정, 열 선택과 관계없이 항상 확인).
4. 결과 열: **원본 열(보이는 값, 문자열)** + `매칭상태`(성공/실패) + `PNU`·`법정동코드`(PNU의 앞 10자리) + `표준_도로명주소` + `표준_지번주소` + `경도`·`위도`(srid 4326, 소수 7자리) 또는 `X좌표`·`Y좌표`(그 밖, m, 소수 2자리) + `필지면적_㎡`(소수 1자리) + 마지막 `실패사유/후보`(`ImportFailureReason` 한글 라벨, 후보가 있으면 `라벨 (후보: 가 / 나)`). 원본에 같은 이름이 있으면 `이름 (2)`. 실패 행도 지우지 않는다. 시트 `결과`·`열설명`(붙은 열의 뜻 + 지적도 기준월(load_meta parcel version) + 건물DB 기준월(ti_spbd_buld version) + 좌표계 + 처리 결과). 머리글 굵게·첫 행 고정·열 폭 자동(글자 수 기준, 최대 60). `열설명` 시트에는 "필지면적_㎡는 지구 표면 기준 계산값이라 토지대장 면적과 다를 수 있습니다", "지적도에 없는 필지는 실패로 세지만 PNU·표준 주소는 채워질 수 있습니다" 두 줄이 있다. **수식 주입 방지**: 문자열이 `= + - @`(또는 탭·CR·LF)로 시작하는 셀은 — 제어문자를 공백으로 바꾸기 전 원본과 바꾼 뒤 둘 다 검사 — **머리글 칸도 포함** 텍스트 서식 + quotePrefix로 쓴다(값은 그대로).
5. **표준 도로명주소 규칙**(「도로명주소 활용 가이드(건물DB)」 붙임 2, 구현 `mymap/infra/StandardAddressFormatter`): `시도 + 시군구 + [법정읍면동(법정리명이 있을 때)] + 도로명 + [지하·공중·수상] + 건물본번[-건물부번(0이면 생략)] + (참고항목)`. 지하 `udgd_yn` 1·2·3 = "지하"·"공중"·"수상"을 본번 앞에 붙여 쓴다(`왕산로 지하205`). 참고항목은 도로명코드 표의 읍면동구분(`ti_sprd_stret.emd_gb`, 건물정보의 `emd_no`로 이어 붙임) 0 읍면 / 1 동 과 공동주택(`apt_yn`=1)으로: 읍면+비공동 → 없음, 읍면+공동 → `(시군구용건물명)`, 동+비공동 → `(법정동명)`, 동+공동 → `(법정동명, 시군구용건물명)`(건물명이 비면 있는 것만). 구분을 모르면(2 미부여·없음) 법정동 이름이 읍·면으로 끝나면 읍면, 아니면 동으로 본다. 시군구가 없으면(세종) 생략하고 공백은 하나. 지번주소는 `시도 시군구 법정동 [리] [산 ]본번[-부번]`(법정동 사전, DB 조회 없음).
6. **도로명주소를 채우는 법**: 도로명 입력 행은 해석 때 찾은 건물(`AddressMatch.building`)로 → 키 묶음 쿼리 1회(500개씩):

```sql
-- addressRef.standardByRoad   (도로명코드+건물번호 인덱스 ix_ti_spbd_buld_road, 도로명코드 PK)
SELECT DISTINCT ON (k.n) k.n, b.udgd_yn, b.buld_mnnm, b.buld_slno, b.ctp_kor_nm, b.sig_kor_nm, b.emd_kor_nm, b.li_kor_nm, b.rn, b.apt_yn, b.sgg_buld_nm, s.emd_gb
FROM unnest(#{roadCds}::varchar[], #{udgds}::varchar[], #{mains}::int[], #{subs}::int[]) WITH ORDINALITY AS k(road_cd, udgd_yn, buld_mnnm, buld_slno, n)
JOIN ref.ti_spbd_buld b ON b.road_cd = k.road_cd AND b.udgd_yn = k.udgd_yn AND b.buld_mnnm = k.buld_mnnm AND b.buld_slno = k.buld_slno
LEFT JOIN ref.ti_sprd_stret s ON s.sgg_cd = substr(b.road_cd, 1, 5) AND s.road_no = substr(b.road_cd, 6, 7) AND s.emd_no = b.emd_no
WHERE coalesce(b.mv_rs_cd, '') NOT IN ('63', '72')
ORDER BY k.n, b.adm_cd, b.mntn_yn, b.lnbr_mnnm, b.lnbr_slno, b.bd_mgt_sn;   -- 건물군이면 지번이 가장 앞선 1건
```

   **지번 입력 행**은 건물정보를 `(adm_cd, mntn_yn, lnbr_mnnm, lnbr_slno)`(PNU에서 뽑음)로 찾는다(같은 모양, `JOIN … ON b.adm_cd = k.adm_cd AND b.mntn_yn = k.mntn_yn AND b.lnbr_mnnm = k.lnbr_mnnm AND b.lnbr_slno = k.lnbr_slno`, `ORDER BY k.n, b.buld_mnnm, b.buld_slno, b.udgd_yn, b.bd_mgt_sn` — 건물본번·부번 오름차순 첫 1건, 못 찾으면 빈 칸). **이 키의 색인 `ix_ti_spbd_buld_jibun`이 없으면 1,072만 행 전체 스캔**이라 앱은 `SELECT to_regclass('ref.ix_ti_spbd_buld_jibun') IS NOT NULL`로 색인이 있을 때만 이 쿼리를 하고(결과는 적재 기준월 단위로 기억, "없음"은 5분 뒤 재확인), 없으면 지번 입력 행의 도로명주소를 비운다(열설명 문구는 같다). 색인 만들기: `backend/scripts/mymap-ref/add-ix-juso-jibun.sql`(`CREATE INDEX IF NOT EXISTS ix_ti_spbd_buld_jibun ON ref.ti_spbd_buld (adm_cd, mntn_yn, lnbr_mnnm, lnbr_slno)`, 약 300MB 추정), `load-juso.sh`가 새 표에도 만든다.
7. **PNU 공식**: `adm_cd || (mntn_yn::int + 1) || lpad(lnbr_mnnm, 4, '0') || lpad(lnbr_slno, 4, '0')`(U7a와 같음, 코드는 `TableAddressResolver.pnu`). **필지 대표점·면적**(`PnuParcelProvider.findPointsByPnus`, 연속지적도는 pnu 인덱스뿐이라 항상 PNU 목록으로 — 이름·지번으로 찾지 않는다):

```sql
-- parcel.points   (#{sidos}는 PNU 앞 2자리 목록 = 파티션 가지치기, #{pnus} 500개씩)
SELECT pnu, ST_X(p) AS lon, ST_Y(p) AS lat, a FROM (
  SELECT pnu, (array_agg(ST_PointOnSurface(g) ORDER BY ST_Area(g) DESC))[1] AS p,
         sum(ST_Area(g::geography)) AS a            -- 면적을 끄면 NULL::float8 AS a
  FROM (SELECT pnu, geom AS g FROM ref.lsmd_cont_ldreg WHERE sido = ANY(#{sidos}::char(2)[]) AND pnu = ANY(#{pnus}::varchar[])) s
  GROUP BY pnu) t;
```
   대표점은 중심이 아니라 필지 **안쪽** 점(ST_PointOnSurface), 면적은 `ST_Area(geom::geography)`(㎡, 앱이 소수 1자리로 반올림). 4326이 아닌 좌표는 앱이 순변환한다(`CoordinateTransformUtil.buildFromWgs84` — 4326·3857·5186·5179, EPSG DB 조회 없음).
8. 보안: SQL은 전부 바인딩, 주소 원문을 로그·예외 메시지에 남기지 않는다(로그는 행·성공·실패 수뿐).

### U24. GET `/api/mymap/{id}/export?format=xlsx|geojson&srid=4326&includeFailed=false` — 레이어 내보내기(스트리밍 바이너리) (구현: `mymap/service/UserMapExportService`)

1. **권한은 U3과 같다**(`UserMapService.loadExportable` 공용): 없음 404 `USER_MAP_NOT_FOUND`, 소유자·공유받은 사람(사용자·역할) 아니면 403 `USER_MAP_FORBIDDEN`, `READY`가 아니면 409 `USER_MAP_NOT_READY`. 형식 밖 400 `MYMAP_EXPORT_FORMAT_INVALID`, 좌표계 네 가지(4326·5186·5179·3857, `EPSG:` 접두 허용) 밖 400 `MYMAP_SRID_UNSUPPORTED`. **모든 검사는 본문을 쓰기 전에** 끝나 오류는 JSON 봉투다.
2. 응답: `Content-Disposition: attachment; filename="=?UTF-8?Q?…?="; filename*=UTF-8''{레이어이름}_yyyyMMdd.{xlsx|geojson}`(Spring이 RFC 2047 `filename`과 RFC 5987 `filename*` **둘 다** 낸다 — 이식 환경은 `filename*`을 우선 읽게 한다. 이름에서 제어문자·따옴표·경로·`; % , &` 등을 `_`로, 앞뒤 점·공백·밑줄 제거, **코드포인트 기준** 80자 이하), `Cache-Control: no-store`, `Content-Type` = xlsx 표준 / `application/geo+json`. 브라우저가 읽는 헤더는 CORS `exposedHeaders`에 있어야 한다(`CorsConfig`: `Content-Disposition`·`X-Export-Failed-Skipped`).
3. **메모리에 전부 올리지 않는다**: 피처는 U3과 같은 JDBC 커서(fetchSize 500, `ORDER BY id`)로 한 행씩 읽어 바로 쓴다(엑셀 SXSSF 100행 창·임시 파일, GeoJSON `JsonGenerator`). 서비스 메서드는 `@Transactional(readOnly = true)`.
   **동시 실행 제한**: 커서 때문에 스트리밍하는 내내 DB 연결을 잡는다(이 한계는 그대로). 그래서 **전체 동시 2건**으로 제한해 연결 풀 고갈을 막는다 — 자리가 없으면 본문·헤더를 쓰기 전에 429 `MYMAP_EXPORT_BUSY`("내보내기가 많아 잠시 후 다시 시도해 주세요."). 자리는 본문을 다 쓰거나 예외가 나거나 클라이언트가 끊으면 `finally`에서 돌려준다(스트림이 끝나기 전에는 풀리지 않는다).
   **알려진 한계**: 본문을 쓰기 시작한 뒤 DB 오류가 나면 이미 200 응답이라 JSON 봉투를 못 돌려주고 **잘린 파일**(GeoJSON은 닫히지 않은 JSON)이 될 수 있다. 서버 로그에만 남는다 — 받는 쪽(프론트)은 GeoJSON 파싱 실패·엑셀 열기 실패를 오류로 안내한다.

```sql
-- export.features   (JdbcTemplate, fetchSize 500)
SELECT pnu, geometry_json, properties_json FROM tbl_user_map_feature WHERE user_map_id = #{id} ORDER BY id;
-- export.failures   (includeFailed=true, 1,000건씩 쪽 넘김)
SELECT * FROM tbl_user_map_import_failure WHERE user_map_id = #{id} ORDER BY row_no, id;     -- + 건수: SELECT count(*) … WHERE user_map_id = #{id}
```
4. **엑셀 열**: 속성 열(`column_schema.columns[].name` 순서) + [`PNU`·`표준_지번주소` — 레이어 `source_kind`가 EXCEL_PNU·EXCEL_ADDRESS일 때만, 지번주소는 PNU로 법정동 사전에서] + `경도`·`위도`(srid 4326) 또는 `X좌표`·`Y좌표`(m; 점은 그 점, 그 밖은 모양 안쪽 점 = JTS getInteriorPoint) + (`includeFailed`) `매칭상태`·`실패사유`. 이름이 겹치면 `이름 (2)`. 수식 주입 방지·머리글·첫 행 고정은 U23과 같다.
   `includeFailed=true`면 보관 중인 실패 행(`tbl_user_map_import_failure`, 30일)을 **성공 행 뒤에** 덧붙인다(원본 값 + `실패` + 사유 라벨(+ 후보)). 실패가 있었는데(`failed_count > 0`) 보관 기간이 지나 행이 없으면 건너뛰고(열도 붙이지 않음) 응답 헤더 `X-Export-Failed-Skipped: true`. GeoJSON에서는 `includeFailed`를 무시한다.
5. **GeoJSON**: 저장된 피처 그대로(`{"type":"Feature","geometry":<geometry_json>,"properties":<properties_json 또는 {}>}`). srid가 4326이 아니면 geometry의 모든 좌표를 순변환(미터 좌표계는 소수 3자리, 높이 값은 그대로)하고 `FeatureCollection`에 `"crs":{"type":"name","properties":{"name":"urn:ogc:def:crs:EPSG::5186"}}`를 넣는다(4326이면 생략).

### U19 이후(아직 없음) · U11·U12

- U11 GET `/srid-options`: 상수 `["EPSG:5186","EPSG:4326","EPSG:5179","EPSG:3857"]`, DB 없음.
- U12 GET `/api/admin/mymap`: `SELECT * FROM tbl_user_map ORDER BY created_at DESC`, 모든 항목 `owner = false`.

업로드 흐름(U6·U7 변경): 미리보기는 xlsx를 SAX 스트리밍으로 읽어 값 있는 행이 5,000을 넘으면 즉시 400(`MYMAP_ROW_LIMIT`), 같은 사용자 동시 1건·서버 전체 4건(429). 확정은 비동기 처리(PNU는 `ref.lsmd_cont_ldreg`에서 폴리곤을 찾아 **그 순간의 모양을 복사 저장**, 주소 모드는 U7a 참고). 같은 사용자의 가져오기(엑셀·shp)는 동시에 1건. PNU 조회는 `PnuParcelProvider` 인터페이스 뒤에 있고 기본 구현이 `ref.lsmd_cont_ldreg`(시도별 파티션)을 읽는다.

---

## 6. GeoTIFF (`domain/geotiff`)

응답 DTO(코드 확인: `…/domain/geotiff/dto/`):
- `GeoTiffListItem` / `GeoTiffUploadResponse`: `id, originalName, tileUrl, uploadedAt, fileSize, minLon, minLat, maxLon, maxLat, status`
- `GeoTiffStatusResponse`: `id, status, errorMessage, tileUrl(READY일 때만, 아니면 null), minLon, minLat, maxLon, maxLat`
- `tileUrl`은 DB 값이 아니라 **계산값** `"/api/geotiff/tiles/{id}/{z}/{x}/{y}.png"`(상대 경로, `GeoTiffService.java:152-154`). 프론트가 `apiBaseUrl`을 붙인다.

| # | 요청 | SQL 등가물 / 동작 |
|---|---|---|
| T1 GET | - | 로그인 사용자면 `SELECT * FROM geo_tiff_files WHERE uploaded_by = #{userId} ORDER BY uploaded_at DESC`, 익명이면 `SELECT * FROM geo_tiff_files ORDER BY uploaded_at DESC` (코드 확인: `GeoTiffController.java:34-37`, `GeoTiffService.java:81-99`) |
| T2 GET `/{id}/status` | - | `SELECT * FROM geo_tiff_files WHERE id` → 없으면 404 |
| T3 GET `/tiles/{id}/{z}/{x}/{y}.png` | - | **타일마다** `SELECT * FROM geo_tiff_files WHERE id` → `status = 'READY'`가 아니면 404 빈 본문 → titiler `{TITILER_URL}/cog/tiles/WebMercatorQuad/{z}/{x}/{y}.png?url=file:///data/{stored_name}`를 받아 PNG로 전달(실패도 404 빈 본문) (`GeoTiffService.java:135-150`). 이식 시 id→stored_name 캐시 권장 |
| T4 POST `/upload` (multipart `file`, 선택 `uploadedBy`) | `data` = `GeoTiffUploadResponse` | 확장자 `.tif/.tiff` 검사(400) → `GEOTIFF_UPLOAD_DIR`에 `UUID.확장자` 저장 → `INSERT INTO geo_tiff_files (original_name, stored_name, file_path, uploaded_by, file_size, status='PROCESSING', uploaded_at=now())` → `@Async` 처리: `SELECT` → `gdal_translate -of COG`(없으면 `docker exec <titiler 컨테이너> python …`) → `gdalinfo -json`의 `wgs84Extent`로 범위(없으면 titiler 폴백) → `UPDATE … SET min_lon…max_lat, status='READY'` / 실패 시 `status='FAILED', error_message` (`GeoTiffProcessor.java:29-48`) |
| T5 DELETE `/{id}` | `null` | `SELECT` → 파일 삭제(실패해도 진행) → `DELETE FROM geo_tiff_files WHERE id` |
| T6 POST `/{id}/reprocess-bounds` | `null` | `SELECT` → `UPDATE … SET status='PROCESSING', error_message=NULL` → T4의 비동기 처리 다시 실행 |

주의:
- `uploadedBy`는 **클라이언트가 보낸 폼 값**이다(코드 확인: `GeoTiffController.java:26-32`). 프론트는 로그인 사용자 id를 넣는다(`adapters/rest/geoTiff.ts:28-29`).
  이식 시 서버의 `GisUserContext.currentUserId()`로 바꾸는 것을 권장(위조 방지).
- titiler 컨테이너는 업로드 폴더를 `/data`로 마운트해야 한다(코드가 `file:///data/{stored_name}`을 요청). 인프라 요구사항.
- 서비스 메서드에 트랜잭션이 없다. 각 `save`/`findById`가 따로 커밋된다(추론: Spring Data 기본 트랜잭션).

---

## 7. 바람 (`domain/wind`)

| # | 권한 | 응답 `data` | SQL 등가물 / 주의 |
|---|---|---|---|
| W1 GET `/latest` | 익명 | grib2json 배열 `[{header:{…}, data:[…]}, {…}]` (U, V) | `Cache-Control: no-cache` + ETag(고른 프레임 id). 같으면 304이고 `data_json`을 읽지 않는다. 아래 |
| W2 GET `/frames` | 익명 | `[{ "id", "forecastHour", "validTime", "cycleDate", "cycleHour", "fields" }]` | **최신 "완전한" 사이클 하나**의 메타만(예보시간 오름차순). `fields`는 `{ "temp": 스칼라id, "humi": … }`이고 스칼라가 없으면 `{}`(null 아님) |
| W3 GET `/frames/{id}` | 익명 | W1과 같은 형식 | `public, max-age=86400, immutable`(프레임 내용은 안 바뀐다). 없으면 404 `NOT_FOUND` |
| W5 GET `/fields/{id}` | 익명 | 스칼라 한 장 `{header:{lo1,la1,lo2,la2,nx,ny,dx,dy,refTime,forecastTime,var,unit,scale}, data:[정수|null,…]}` | 값 = `data[i] × header.scale`, `null` = 자료 없음. 같은 캐시 헤더. 없으면 404 |
| W4 POST `/refresh` | **SUPER_ADMIN·MAP_ADMIN만** | `null` | 스케줄러와 같은 갱신 로직(아래). 호출이 겹치면 두 번째는 건너뛴다(ReentrantLock) |

데이터 의미(코드 확인: `WindDataService`, `LdapsRegridder`): 격자는 0.02° ≈ 2km로 다시 나눈 것(출력 칸마다 원본 1km 격자를 이중선형 보간). **원본 격자 밖은 JSON `null`** 이고 프론트는 이를 "자료 없음"으로 본다(0 m/s가 아니다). 바람은 소수 둘째 자리, 스칼라는 정수로 줄여 저장한다(기온 0.1℃, 습도 1%, 강수 0.1mm 단위 → `header.scale`).
`valid_time`은 UTC `LocalDateTime`이고 `cycle_date`/`cycle_hour`는 **KST**(03·09·15·21시)다.

W1 동작: 지금(UTC) 이하의 유효시각 중 가장 최근 프레임, 없으면 가장 이른 프레임, 그것도 없으면 404. 앱의 바람 패널은 W1이 아니라 W2+W3(+W5)를 쓴다.

```sql
-- W2: 최신 완전 사이클 키(예보시간이 서로 다른 프레임이 wind.forecast-hours개 이상), 없으면 가장 늦은 사이클
SELECT cycle_date, cycle_hour, COUNT(DISTINCT forecast_hour) FROM tbl_wind_frame
 GROUP BY cycle_date, cycle_hour HAVING COUNT(DISTINCT forecast_hour) >= #{minFrames}
 ORDER BY cycle_date DESC, cycle_hour DESC LIMIT 1;
-- 그 사이클의 메타(data_json은 읽지 않는다)
SELECT id, forecast_hour, valid_time, cycle_date, cycle_hour FROM tbl_wind_frame
 WHERE cycle_date = #{d} AND cycle_hour = #{h} ORDER BY forecast_hour ASC, id ASC;
-- 같은 사이클의 스칼라 키 → fields 조립
SELECT forecast_hour, var_code, id FROM tbl_wind_scalar
 WHERE cycle_date = #{d} AND cycle_hour = #{h} ORDER BY forecast_hour ASC, id ASC;

-- W3 / W5: 본문 한 장만
SELECT data_json FROM tbl_wind_frame  WHERE id = #{id};
SELECT data_json FROM tbl_wind_scalar WHERE id = #{id};

-- W1: 유효시각이 지금 이하인 가장 최근 프레임 id → 그 id의 data_json (id만 먼저 고르고 본문은 한 행)
SELECT id FROM tbl_wind_frame WHERE valid_time <= #{nowUtc}
 ORDER BY valid_time DESC, cycle_date DESC, cycle_hour DESC, id DESC LIMIT 1;
SELECT id FROM tbl_wind_frame ORDER BY valid_time ASC, id DESC LIMIT 1;   -- 비었을 때 대체
```

`#{nowUtc}`는 **UTC 기준 LocalDateTime**이어야 한다. 컨트롤러는 본문을 `RawValue`로 봉투에 이어 써서 파싱 비용을 피한다. `server.compression`(gzip)이 켜져 있어 프레임 한 장은 전송 약 2MB, 기온 한 장은 약 50KB다.
**`SELECT *`로 여러 행을 읽지 않는다** — 프레임 한 행의 `data_json`이 수 MB다(옛 구현은 994행을 한꺼번에 읽어 느렸다).

갱신(스케줄러 `cron 0 30 * * * *`, `Asia/Seoul`, 매시 30분 / W4) — 코드 확인: `WindDataService`:

1. 후보 사이클(최근 8개, 약 48시간 — 발표 후 자료가 올라오기까지 시간이 걸려서 여러 개를 본다)을 최신부터 보며 **데이터가 준비됐는지** 가볍게 확인(leadHour 0, Wspd 한 번)하고, 준비된 사이클의 `leadHour 0 ~ forecast-hours-1`(기본 9) 프레임을 받는다. **이미 있는 프레임은 건너뛰고 빠진 것만 채운다**(`existsBy…ForecastHour`). 다운로드는 트랜잭션 밖에서 하고 프레임마다 저장한다.
2. 스칼라(`wind.fields`, 기본 `temp,humi`)는 **완전 사이클 판정에 쓰지 않는다**(바람만 본다). 빠진 스칼라는 매시 회차에 그것만 다시 받고, 같은 (사이클, 예보시간, 변수)가 연속 3회 실패하면 서버가 다시 뜰 때까지 그 사이클에서는 포기한다. `wind.fields`를 비우면 호출 0이다.
3. 정리(`pruneOldCycles`): 완전한 사이클이 생긴 뒤에만, 같은 사이클 안의 중복 행(id 큰 쪽만 남김)과 **그 사이클보다 오래된** 사이클을 지운다(`<` 조건 — `<>`가 아니라서 다른 서버가 방금 저장한 더 새 사이클은 안 지운다). 새 사이클이 완전해지기 전에는 옛 완전 사이클을 지우지 않는다.

```sql
-- 이미 저장된 프레임이면 건너뜀
SELECT 1 FROM tbl_wind_frame WHERE cycle_date = #{d} AND cycle_hour = #{h} AND forecast_hour = #{f} LIMIT 1;
INSERT INTO tbl_wind_frame (cycle_date, cycle_hour, forecast_hour, valid_time, data_json, created_at)
VALUES (#{d}, #{h}, #{f}, #{validTimeUtc}, #{dataJson}, now());
SELECT 1 FROM tbl_wind_scalar WHERE cycle_date = #{d} AND cycle_hour = #{h} AND forecast_hour = #{f} AND var_code = #{var} LIMIT 1;
INSERT INTO tbl_wind_scalar (cycle_date, cycle_hour, forecast_hour, var_code, valid_time, data_json, created_at)
VALUES (#{d}, #{h}, #{f}, #{var}, #{validTimeUtc}, #{dataJson}, now());
-- 정리(둘 다 같은 기준 사이클 d,h)
DELETE FROM tbl_wind_frame w USING tbl_wind_frame x
 WHERE w.cycle_date = #{d} AND w.cycle_hour = #{h} AND x.cycle_date = #{d} AND x.cycle_hour = #{h}
   AND x.forecast_hour = w.forecast_hour AND w.id < x.id;          -- 중복(MySQL은 다중 테이블 DELETE 문법이 다름)
DELETE FROM tbl_wind_frame  WHERE cycle_date < #{d} OR (cycle_date = #{d} AND cycle_hour < #{h});
DELETE FROM tbl_wind_scalar WHERE cycle_date < #{d} OR (cycle_date = #{d} AND cycle_hour < #{h});
```

동시성 주의: 갱신 메서드 전체에는 `@Transactional`을 걸지 않는다(수 MB INSERT 9건을 한 트랜잭션에 넣지 않는다). 대신 인스턴스 안에서는 `ReentrantLock`으로 겹침을 막고, 정리는 `TransactionTemplate`으로 짧게 묶는다. 서버가 둘 이상이면 (사이클, 예보시간) 유니크 인덱스가 이중 저장을 막고, 서비스는 유니크 위반을 "다른 서버가 먼저 저장함"으로 받아들인다(`ddl.md` 5절).
이식할 때 갱신 로직은 별도 빈에 두고, 스케줄러 자체 호출(self-invocation)로 `@Transactional`이 안 걸리는 함정(`.claude/rules/backend.md`)을 피한다.

---

## 8. GeoServer (`domain/geoserver`) — DB 없음

지도 화면(패키지)은 이 API를 부르지 않는다. GeoServer 이미지 범례는 브라우저가 `geoserverUrl`로 GeoServer에 직접 요청한다
(코드 확인: `adapters/proxy/legend.ts:35-40`). 관리 화면용 외부 호출 목록(코드 확인: `GeoServerService.java`, 설정 키 `geoserver.url`,
`geoserver.admin.user`, `geoserver.admin.password`, `geoserver.legend-layer` ← 환경 변수 `GEOSERVER_URL`, `GEOSERVER_ADMIN_USER`,
`GEOSERVER_ADMIN_PASSWORD`, `GEOSERVER_LEGEND_LAYER`):

| 백엔드 경로 | GeoServer 호출(Basic 인증) |
|---|---|
| GET `/workspaces`, `/workspaces/{ws}/datastores`, `/workspaces/{ws}/layers`, `/workspaces/{ws}/datastores/{ds}/layers` | `GET {url}/rest/workspaces…`, featuretypes `?list=published|available`, 레이어별 상세(병렬 `CompletableFuture`) |
| POST `/publish` | `POST {url}/rest/workspaces/{ws}/datastores/{ds}/featuretypes` (레이어마다) |
| GET/POST/PUT/DELETE `/styles…` | `{url}/rest/styles…` (`.sld`, `?purge=true&recurse=true`) |
| PUT `/workspaces/{ws}/layers/{layer}/style` | `PUT {url}/rest/layers/{ws}:{layer}` |
| POST `/legend` (SLD 본문 → PNG) | `GET {url}/ows?…request=GetLegendGraphic&LAYER=<legend-layer>&SLD_BODY=…` |
| GET `/sld/{name}`, `/sld/{name}/{layers}` (익명) | `GET {url}/rest/styles/{name}.sld` (+ 레이어명 치환) |

---

## 9. 호스트 프록시 규약 (백엔드 API 아님)

`proxySources()`가 부르는 주소다. GTProject는 Next.js `frontend/src/app/proxy/**/route.ts`가 제공하고, 전자정부에선 **업무 백엔드가 같은 규약의
프록시 컨트롤러를 만들어야 한다**. API 키는 서버에서만 붙인다(키 값은 환경 변수/설정 파일, 문서에 쓰지 않음).

| 프론트가 부르는 주소 (`{proxyBaseUrl}` 기본 `/proxy`) | 서버가 할 일 | 프론트가 기대하는 응답 |
|---|---|---|
| GET `/vworld/search?query=&type=all&size=` | VWorld 검색 API를 도로명·지번·장소 3번 호출해 합치고 id로 중복 제거 | `{ "items": [{ "id", "title", "category", "address": {"road","parcel"}, "point": {"lon","lat"} }] }` (`adapters/proxy/vworld.ts:11-20`) |
| GET `/vworld/data?service=data&…&data=LP_PA_CBND_BUBUN&geomFilter=POINT(lon lat)` | 쿼리를 그대로 VWorld 데이터 API로 넘기고 키·도메인 파라미터 추가 | VWorld 원본 JSON. `response.status === "OK"`면 `response.result.featureCollection.features` 사용 |
| GET `/vworld/legend-style?layer=` | VWorld `GetLegendStyle`(XML) 전달 | SLD XML 텍스트 |
| GET `/wfs?TYPENAMES=&BBOX=minx,miny,maxx,maxy,EPSG:xxxx&SRSNAME=` | VWorld WFS 2.0 GetFeature(`outputFormat=application/json`)로 전달 | GeoJSON |
| GET `/region?lon=&lat=` | VWorld 주소 API(`getAddress`, `type=parcel`) 전달 | VWorld 원본 JSON. `response.result[0].text` 사용(번지는 프론트가 제거) |

---

## 10. Repository 메서드 ↔ SQL 대조표

### 10.1 선언 메서드 28개 (BK-1 후)

| # | Repository.method | 호출 위치 (코드 확인) | SQL 등가물 | 매퍼 id 제안 / 주의 |
|---|---|---|---|---|
| 1 | `LayerRepository.findAllByOrderBySortOrderAscIdAsc()` | `LayerService:33, 39, 79` | `SELECT * FROM tbl_layer ORDER BY sort_order, id` | `layer.selectAllOrdered` |
| 2 | `LayerGroupRepository.findAllByOrderBySortOrderAscIdAsc()` | `LayerGroupService:23, 54` | `SELECT * FROM tbl_layer_group ORDER BY sort_order, id` | `layerGroup.selectAllOrdered` |
| 3 | `LayerGroupRepository.findByParentIsNullOrderBySortOrderAscIdAsc()` | **미사용** | `… WHERE parent_id IS NULL ORDER BY sort_order, id` | 옮기지 않아도 됨 |
| 4 | `LayerPermissionAccessRepository.findByPermission(p)` | `LayerService:76, 187` | `SELECT id, permission, layer_id FROM tbl_layer_permission_access WHERE permission = #{p}` | `layerPermission.selectLayerIdsByPermission`(layer_id만). 지연 로딩 부가 SELECT 확인 필요 |
| 5 | `LayerPermissionAccessRepository.deleteByPermission(p)` | `LayerService:193` | JPA: 4번 SELECT 후 `DELETE … WHERE id = ?` 건별 → `DELETE FROM tbl_layer_permission_access WHERE permission = #{p}` | `layerPermission.deleteByPermission` |
| 6 | `LayerPermissionAccessRepository.findByLayer(layer)` | **미사용** | `… WHERE layer_id = #{layerId}` | 옮기지 않아도 됨 |
| 7 | `LayerPermissionAccessRepository.deleteByLayer(layer)` | `LayerService:159` | `DELETE FROM tbl_layer_permission_access WHERE layer_id = #{layerId}` (JPA는 SELECT + 건별) | `layerPermission.deleteByLayer` |
| 8 | `LayerUserAccessRepository.findByUserId(u)` | `LayerService:206` | `SELECT id, user_id, layer_id FROM tbl_layer_user_access WHERE user_id = #{u}` | `layerUser.selectLayerIdsByUser`. **0행 → 서비스가 null** |
| 9 | `LayerUserAccessRepository.deleteByUserId(u)` | `LayerService:213, 223` | `DELETE FROM tbl_layer_user_access WHERE user_id = #{u}` (JPA는 SELECT + 건별) | `layerUser.deleteByUser` |
| 10 | `LayerUserAccessRepository.deleteByLayer(layer)` | `LayerService:160` | `DELETE FROM tbl_layer_user_access WHERE layer_id = #{layerId}` | `layerUser.deleteByLayer` |
| 11 | `UserMapRepository.findAllByOwnerIdOrderByCreatedAtDesc(o)` | **미사용** | `… WHERE owner_id = #{o} ORDER BY created_at DESC` | U1 권장 SQL로 대체 |
| 12 | `UserMapRepository.findAllByOrderByCreatedAtDesc()` | `UserMapService:33, 156` | `SELECT * FROM tbl_user_map ORDER BY created_at DESC` | U1은 `userMap.selectVisibleTo`로, U12는 `userMap.selectAllForAdmin` |
| 13 | `UserMapFeatureRepository.findAllByUserMap(m)` | **미사용** | `… WHERE user_map_id = #{id}` | 스트리밍(U3)이 대신함 |
| 14 | `UserMapFeatureRepository.countByUserMap(m)` | **미사용** | `SELECT COUNT(*) … WHERE user_map_id` | `feature_count` 컬럼이 대신함 |
| 15 | `UserMapFeatureRepository.deleteByUserMap(m)` (`@Modifying` JPQL) | `UserMapService:132, 165` | `DELETE FROM tbl_user_map_feature WHERE user_map_id = #{id}` (JPA도 한 문장) | `userMapFeature.deleteByMap` |
| 16 | `UserMapPermissionAccessRepository.findAllByRoleCodeIn(list)` | `UserMapPermissionService:59` | `SELECT … WHERE role_code IN (…)` | U1 서브쿼리로 흡수 |
| 17 | `UserMapPermissionAccessRepository.findAllByUserMap(m)` | `UserMapPermissionService:37, 90` | `SELECT … WHERE user_map_id = #{id}` | `userMapShare.selectRoleCodes` / 권한 검사는 COUNT로 |
| 18 | `UserMapPermissionAccessRepository.deleteByUserMap(m)` | `UserMapPermissionService:67, 96` | `DELETE … WHERE user_map_id = #{id}` (JPA는 SELECT + 건별) | `userMapShare.deleteRolesByMap` |
| 19 | `UserMapUserAccessRepository.findAllByUserId(u)` | `UserMapPermissionService:56` | `SELECT … WHERE user_id = #{u}` | U1 서브쿼리로 흡수 |
| 20 | `UserMapUserAccessRepository.findAllByUserMap(m)` | `UserMapPermissionService:33, 85` | `SELECT … WHERE user_map_id = #{id}` | `userMapShare.selectUserIds` / 권한 검사는 COUNT로 |
| 21 | `UserMapUserAccessRepository.deleteByUserMap(m)` | `UserMapPermissionService:66, 95` | `DELETE … WHERE user_map_id = #{id}` (JPA는 SELECT + 건별) | `userMapShare.deleteUsersByMap` |
| 22 | `GeoTiffFileRepository.findAllByOrderByUploadedAtDesc()` | `GeoTiffService:84` | `SELECT * FROM geo_tiff_files ORDER BY uploaded_at DESC` | `geoTiff.selectAll` |
| 23 | `GeoTiffFileRepository.findAllByUploadedByOrderByUploadedAtDesc(u)` | `GeoTiffService:83` | `… WHERE uploaded_by = #{u} ORDER BY uploaded_at DESC` | `geoTiff.selectByUploader` |
| 24 | `WindFrameRepository.findAllByOrderByForecastHourAsc()` | `WindController:37` | `SELECT * … ORDER BY forecast_hour` | `wind.selectFrameMetas`(data_json 빼기) |
| 25 | `WindFrameRepository.findCurrentCandidates(now)` (JPQL) | `WindController:46` | `SELECT * … WHERE valid_time <= #{now} ORDER BY valid_time DESC` | `wind.selectCurrentData`(LIMIT 1, data_json만) |
| 26 | `WindFrameRepository.findFirstByOrderByValidTimeAsc()` | `WindController:48` | `SELECT * … ORDER BY valid_time ASC FETCH FIRST 1 ROWS ONLY` | `wind.selectEarliestData` |
| 27 | `WindFrameRepository.existsByCycleDateAndCycleHour(d, h)` | `WindDataService:89` | `SELECT 1 … WHERE cycle_date = #{d} AND cycle_hour = #{h} LIMIT 1` | `wind.existsCycle` |
| 28 | `WindFrameRepository.deleteAllExceptCycle(d, h)` (`@Modifying` JPQL) | `WindDataService:131` | `DELETE FROM tbl_wind_frame WHERE cycle_date <> #{d} OR cycle_hour <> #{h}` | `wind.deleteOtherCycles` |

### 10.2 서비스가 쓰는 내장 메서드

| 호출 (코드 확인) | 의미 | SQL 등가물 |
|---|---|---|
| `layerRepository.findById` `LayerService:240` / `layerGroupRepository.findById` `LayerGroupService:58` | 존재 확인 + 로드 | `SELECT * FROM tbl_layer(_group) WHERE id = #{id}` → 없으면 404 |
| `layerRepository.save` `LayerService:138` / `layerGroupRepository.save` `LayerGroupService:36` | 신규 INSERT | `INSERT … RETURNING id`(PG). MyBatis `useGeneratedKeys="true" keyProperty="id"` |
| `permissionAccessRepository.save` `LayerService:197`, `userAccessRepository.save` `LayerService:217` | 신규 INSERT | 4.L3~L5 / L12 |
| `layerRepository.delete` `LayerService:161`, `layerGroupRepository.delete` `LayerGroupService:50` | 삭제 | `DELETE … WHERE id` |
| 변경 감지 UPDATE: `Layer.update`/`updateSortOrderAndGroup`, `LayerGroup.update`, `UserMap.updateMeta` | 커밋 때 UPDATE | 모든 컬럼 UPDATE + `updated_at = now()` |
| `userMapRepository.save` `UserMapUploadService:110, 181` | 신규 INSERT | U5·U7 |
| `userMapRepository.save` `UserMapUploadService:221, 224, 229` | 같은 트랜잭션 안의 상태 UPDATE | `UPDATE tbl_user_map SET status, geom_type, feature_count, error_message, updated_at` |
| `userMapRepository.findById`/`save` `UserMapProcessor:46, 84, 89` | 비동기: 로드 / 분리 엔티티 merge | `SELECT` / `SELECT` + 모든 컬럼 UPDATE(추론) |
| `userMapRepository.findById` `UserMapService:41` / `delete` `:133, 166` | 로드 / 삭제 | U2 / U4 |
| `userAccessRepository.save` `UserMapPermissionService:72`, `permissionAccessRepository.save` `:78` | 공유 INSERT | U9 |
| `geoTiffFileRepository.save` `GeoTiffService:62` (신규), `:120` (재처리 상태), `GeoTiffProcessor:41, 46` (완료/실패) | INSERT / merge UPDATE | T4·T6 |
| `geoTiffFileRepository.findById` `GeoTiffService:102, 117, 125, 136`, `GeoTiffProcessor:31` | 로드 | `SELECT * FROM geo_tiff_files WHERE id` |
| `geoTiffFileRepository.delete` `GeoTiffService:132` | 삭제(분리 엔티티라 SELECT 한 번 더 가능, 추론) | `DELETE FROM geo_tiff_files WHERE id` |
| `windFrameRepository.findById` `WindController:58` / `save` `WindDataService:119` | 로드 / INSERT | W3 / 7절 |

### 10.3 JdbcTemplate 사용처 4곳 (SQL 2종)

| 파일:라인 | SQL |
|---|---|
| `UserMapService.java:88-96` | `SELECT geometry_json, properties_json FROM tbl_user_map_feature WHERE user_map_id = ?` (fetchSize 500, 스트리밍) |
| `FeatureBatchInserter.java:16-18, 37-42` | `INSERT INTO tbl_user_map_feature (user_map_id, geometry_json, properties_json) VALUES (?, ?, ?)` — 1000건 단위 `batchUpdate`, `RETURNING` 없음(생성 id 안 씀) |
| `UserMapProcessor.java:60` | 위 배치 INSERT를 사용(shp, 트랜잭션 없음) |
| `UserMapUploadService.java:198` | 위 배치 INSERT를 사용(엑셀, `@Transactional` 안) |

### 10.4 지연 로딩으로 생길 수 있는 부가 SELECT (확인 필요)

| 위치 | 코드 | 비고 |
|---|---|---|
| `LayerService:77, 188, 208` | `a.getLayer().getId()` | 프록시 id 접근. BK-1은 "추가 SELECT 없음"으로 봤으나 SQL 캡처 미확인 |
| `UserMapPermissionService:57, 60` | `a.getUserMap().getId()` | 같음 |
| `LayerResponse:48`, `LayerService:51-52, 90-91` | `l.getGroup().getId()` | 같음. 트리 조립에선 그룹 전체를 이어서 읽으므로 N+1이 나도 그룹 수만큼 |
| `LayerGroup.getParentId()` | `parent.getId()` | 같음 |

MyBatis로 옮기면 전부 `*_id` 컬럼을 직접 읽으므로 이 문제는 사라진다.

---

## 11. 매퍼로 옮길 때 깨지기 쉬운 계약

| 계약 | 어기면 | 근거 |
|---|---|---|
| L3: 행이 없으면 `data: null`(빈 배열 `[]` 아님) | 프론트가 "개인 설정 = 아무것도 안 보기"로 해석해 레이어 트리가 비어 보인다 | `LayerService.java:207`, `layerTree.ts:40-45`(`!== null` 검사) |
| L11: 행이 없으면 `[]` | 관리 화면 `new Set(ids)`가 실패 | `LayerService.java:186-189` |
| L1/L2: 정렬 `sort_order, id` + 그룹 삽입 순서 유지 + 부모 없는 그룹은 루트 | 트리 순서가 바뀌거나 그룹이 사라진다 | `LayerService.java:37-71` |
| L2: 빈 그룹 재귀 제거, `ungroupedLayers`도 권한으로 거름 | 권한 없는 레이어·빈 폴더 노출 | `LayerService.java:79-110` |
| U3: 봉투 없는 FeatureCollection, 검증은 스트림 열기 전 | 오류가 JSON 봉투로 안 나가거나 응답이 잘린다 | `UserMapController.java:48-56` |
| U5: 업로드 INSERT를 **커밋한 뒤** 비동기 처리 시작 | 비동기 스레드가 행을 못 찾고 조용히 끝나 영원히 PROCESSING | `UserMapUploadService.java:62-66` 주석 |
| U7: 응답 `status`가 처리 결과 | 프론트는 성공으로 보고 목록을 다시 읽는다 | `UserMapUploadService.java:238-239` |
| 대량 피처는 배치 INSERT(1000건) | 건별 INSERT로 수십 분 | `FeatureBatchInserter.java` |
| T1/T2: `tileUrl`은 상대 경로 `/api/geotiff/tiles/{id}/{z}/{x}/{y}.png` | 프론트가 `apiBaseUrl`을 앞에 붙이므로 절대 URL을 주면 주소가 두 번 붙는다 | `adapters/rest/geoTiff.ts:19-21` |
| W1: 데이터 없으면 `success:false`(404) | 프론트는 `success`만 보고 null 처리 — HTTP 200 + `data:null`도 동작 | `adapters/rest/wind.ts:9-14` |
| 에러 응답은 봉투 + `message` | 프론트가 `message`로 Error를 만든다(HTTP 상태는 안 봄) | `adapters/rest/envelope.ts:14-18` |

---

## 12. 프론트 어댑터 ↔ 백엔드 불일치 (발견만, 고치지 않음)

| # | 위치 | 프론트 기대 | 백엔드 실제 | 영향 |
|---|---|---|---|---|
| 1 | 레이어 트리 권한 키 | 기본 키 = `user.role`(역할 코드) (`layerTree.ts:15`) | 관리 화면은 세부 권한이 있는 역할이면 **세부 권한 코드**로 저장(`map-admin/layer/page.tsx:69-73`) | 세부 권한이 있는 역할의 사용자는 권한 트리가 **비어 보인다**. `GisMapUser.permission` 필드는 있으나 안 씀. 의도 확인 필요(설계문서 범위 밖 문제 4번과 같은 줄기) |
| 2 | Security 거부 응답 | 모든 응답이 JSON 봉투(`readEnvelope`가 `res.json()`) | 비로그인으로 `authenticated()` 경로 호출 시 **403 빈 본문** | 사용자 메시지 대신 JSON 파싱 오류 문구가 뜬다(예: 로그인 만료 중 나만의지도 패널). `layerTree.loadTree`의 L3만 `res.ok`를 먼저 봐서 안전 |
| 3 | `GET /api/geotiff` 범위 | 목록 = 내가 볼 항공영상 | 로그인하면 **내가 올린 것만**, 익명이면 전부. 익명 업로드(`uploaded_by` NULL)는 로그인 사용자에게 안 보인다 | 로그인 여부에 따라 목록이 달라짐. 업로더는 클라이언트 값 |
| 4 | U7 엑셀 확정 실패 | `readEnvelope` 성공 = 업로드 성공 | 처리 중 일반 예외는 `status:"FAILED"`로 **200 성공** 응답 | 성공 토스트 후 목록에 FAILED 항목이 생긴다 |
| 5 | `GeoTiffStatus`/`UserMapStatus` 타입 | `status`, (`tileUrl`, 범위) / `status`, `featureCount`만 | `id`, **`errorMessage`** 도 보냄 | 무해. 실패 이유가 화면에 안 나온다 |
| 6 | `GeoTiffItem.minLon` 등 | `number | undefined`(`?:`) | 처리 전·실패 시 `null` | 무해. 사용처가 `!= null`로 검사(`RasterOverlayController.ts:65`) |
| 7 | `LayerDef.createdAt/updatedAt` | `string`(NULL 아님) | Auditing 도입 전 행·수동 INSERT면 `null` 가능 | 표시에 안 쓰면 무해. MyBatis INSERT에서 `now()` 필수 |
| 8 | `LayerDef.type` / `sourceType` | 8종 / 5종 유니온 | 아무 문자열(대문자화만) 저장 | 모르는 타입은 코어가 그리지 않을 것(추론) |
| 9 | U5·U7 응답 | `void`(무시) | `{id, name, status}` | 무해 |
| 10 | U7 요청 | `description`, `titleColumn` 안 보냄 | DTO에 있음(`titleColumn`은 백엔드도 미사용) | 무해 |
| 11 | U3 geojson 오류 | `http.json` → `GisHttpError("HTTP 403 …")` | 403/404/409 + 봉투 `message` | 서버 메시지가 버려진다 |

---

## 13. 메서드명 grep 대조 결과 (빠짐없음 확인)

선언 메서드: `backend/src/main/java/com/gtp/domain/{map,mymap,geotiff,wind}/repository/*.java`를 읽어 28개(10.1 표 1~28과 1:1).
호출 위치: 메서드명마다 `grep -rn "\.<메서드명>(" backend/src/main/java/com/gtp/domain`으로 확인.

| 결과 | 메서드 |
|---|---|
| 사용 23개 | 10.1의 1, 2, 4, 5, 7, 8, 9, 10, 12, 15~28 |
| **미사용 5개** | `LayerGroupRepository.findByParentIsNullOrderBySortOrderAscIdAsc`, `LayerPermissionAccessRepository.findByLayer`, `UserMapRepository.findAllByOwnerIdOrderByCreatedAtDesc`, `UserMapFeatureRepository.findAllByUserMap`, `UserMapFeatureRepository.countByUserMap` |
| 이름이 겹쳐 주의 | `findAllByOrderByCreatedAtDesc`는 bot 도메인 리포지토리에도 있다(지도와 무관). `findAllByUserMap`·`deleteByUserMap`은 mymap 리포지토리 3개에 같은 이름 — 호출 객체로 구분해 표에 적음 |
| 내장 메서드 | `findById`, `save`, `delete` (10.2). `saveAll`, `deleteAll`, `existsById`, `count`, `findAll()` 사용 0건 |
| JdbcTemplate | 사용 파일 4개(`UserMapService`, `UserMapProcessor`, `UserMapUploadService`, `FeatureBatchInserter`), SQL 2종(10.3) |
