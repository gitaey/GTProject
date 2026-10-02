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
| U8 | GET `/api/mymap/{id}/share` | 로그인 | A | 선택: 공유 |
| U9 | PUT `/api/mymap/{id}/share` | 로그인 | A | 선택: 공유 |
| U10 | PATCH `/api/mymap/{id}` | 로그인 | - | 미사용 |
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
| W2 | GET `/api/wind/frames` | 익명 | - | 미사용 |
| W3 | GET `/api/wind/frames/{id}` | 익명 | - | 미사용 |
| W4 | POST `/api/wind/refresh` | 로그인 | - | 운영용(수동 갱신) |
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
| 선택: 바람길 | W1 + 스케줄러 | `tbl_wind_frame` | 기상청 API 키(`KMA_API_KEY`) 필요 |
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

### U8·U9. `/api/mymap/{id}/share` (소유자만)

| | 요청 | 응답 `data` | SQL |
|---|---|---|---|
| U8 GET | - | `{ "userIds": [...], "roleCodes": [...] }` | 존재·소유자 확인 → `SELECT user_id FROM tbl_user_map_user_access WHERE user_map_id = #{id}` / `SELECT role_code FROM tbl_user_map_permission_access WHERE user_map_id = #{id}` |
| U9 PUT | `{ "userIds": [...], "roleCodes": [...] }` | `null` | 존재·소유자 확인 → 두 테이블 `DELETE … WHERE user_map_id` → (flush) → 빈 문자열/NULL을 건너뛰고 INSERT (`UserMapPermissionService.java:64-81`) |

`userIds`/`roleCodes`가 `null`이면 그 종류는 "전부 해제"와 같다. 같은 값이 두 번 들어오면 UNIQUE 위반으로 500(추론). 사용자·역할이 실제로 있는지는 검사하지 않는다(도메인 독립).

### U10·U11·U12 (프론트 지도 화면 미사용)

- U10 PATCH `/{id}`: `{ name, description, styleConfig, visible }` → 소유자 확인 → `UPDATE tbl_user_map SET name, description, style_config, visible, updated_at = now() WHERE id`.
  네 필드를 모두 덮어쓴다(`name` 누락 시 NOT NULL 위반 500).
- U11 GET `/srid-options`: 상수 `["EPSG:5186","EPSG:4326","EPSG:5179","EPSG:3857"]`, DB 없음.
- U12 GET `/api/admin/mymap`: `SELECT * FROM tbl_user_map ORDER BY created_at DESC`, 모든 항목 `owner = false`.

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

| # | 요청 | 응답 `data` | SQL 등가물 / 주의 |
|---|---|---|---|
| W1 GET `/latest` | - | grib2json 배열 `[{header:{…}, data:[…]}, {…}]` (U, V) | 아래 |
| W2 GET `/frames` | - | `[{ "id", "forecastHour", "validTime" }]` | JPA는 `SELECT * FROM tbl_wind_frame ORDER BY forecast_hour ASC`로 **data_json까지 읽는다** → 매퍼는 `SELECT id, forecast_hour, valid_time …`만 |
| W3 GET `/frames/{id}` | - | W1과 같은 형식 | `SELECT data_json FROM tbl_wind_frame WHERE id = #{id}` → 없으면 404 `NOT_FOUND` |
| W4 POST `/refresh` | - | `null` | 스케줄러와 같은 갱신 로직(아래) |

W1 동작(코드 확인: `WindController.java:43-53`, `WindFrameRepository.java:19-26`): 지금(UTC) 이하의 유효시각 중 가장 최근 프레임, 없으면 가장 이른 프레임, 그것도 없으면 404.

```sql
-- JPA 실제(추론): 후보를 전부 엔티티로 읽는다 = data_json(수 MB) × 최대 6행
SELECT * FROM tbl_wind_frame WHERE valid_time <= #{nowUtc} ORDER BY valid_time DESC;
-- 비었으면 (findFirstByOrderByValidTimeAsc)
SELECT * FROM tbl_wind_frame ORDER BY valid_time ASC FETCH FIRST 1 ROWS ONLY;

-- 매퍼 권장: 한 행, 필요한 컬럼만
SELECT data_json FROM tbl_wind_frame WHERE valid_time <= #{nowUtc} ORDER BY valid_time DESC LIMIT 1;
SELECT data_json FROM tbl_wind_frame ORDER BY valid_time ASC LIMIT 1;
```

`#{nowUtc}`는 **UTC 기준 LocalDateTime**이어야 한다(`valid_time`이 UTC 값). 컨트롤러는 `data_json`을 `JsonNode`로 파싱해 봉투에 넣는다 —
이식할 때 문자열을 그대로 `data` 자리에 이어 쓰면 파싱 비용과 메모리를 줄일 수 있다(추론). 로컬에서 이 API가 한 건에 수 MB·수십 초가
걸려 OOM까지 간 기록이 있다(`.claude/rules/map.md` 함정 절).

갱신(스케줄러 `cron 0 30 4,10,16,22 * * *`, `Asia/Seoul` / W4) — 코드 확인: `WindDataService.java:72-133`:

```sql
-- 최근 사이클부터: 이미 저장된 사이클이면 중단 (existsByCycleDateAndCycleHour)
SELECT 1 FROM tbl_wind_frame WHERE cycle_date = #{cycleDate} AND cycle_hour = #{cycleHour} LIMIT 1;
-- 새 사이클 프레임 저장 (leadHour 0 ~ forecast-hours-1, 실패한 leadHour는 건너뜀)
INSERT INTO tbl_wind_frame (cycle_date, cycle_hour, forecast_hour, valid_time, data_json, created_at)
VALUES (#{cycleDate}, #{cycleHour}, #{forecastHour}, #{validTimeUtc}, #{dataJson}, now());
-- 그 사이클 외 전부 삭제 (deleteAllExceptCycle, JPQL 벌크)
DELETE FROM tbl_wind_frame WHERE cycle_date <> #{cycleDate} OR cycle_hour <> #{cycleHour};
```

트랜잭션 주의: `refresh()`에 `@Transactional`이 있지만 스케줄러 `scheduledRefresh()`가 **같은 클래스 안에서 직접 호출**해 트랜잭션이 걸리지 않는다
(`.claude/rules/backend.md` self-invocation 경고). 이때 벌크 DELETE가 트랜잭션 없이 실행되면 실패할 수 있다(추론).
이식할 때는 갱신 로직을 **별도 빈의 `@Transactional` 메서드**로 두고, 수 MB INSERT 6건을 한 트랜잭션에 넣을지(롤백 가능)
프레임마다 커밋할지(부분 성공 허용) 정한다.

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
