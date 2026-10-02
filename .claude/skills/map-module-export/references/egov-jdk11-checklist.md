# 전자정부(JDK 11 · Spring 5 · MyBatis · Maven · JSP) 이식 체크리스트

- 기준: 2026-09-30 작업트리(BK-1·BK-2 반영). 테이블은 `ddl.md`, API·SQL은 `query-spec.md`.
- 전제: 업무 쪽은 **JDK 11, 전자정부 표준프레임워크 4.x 계열(Spring 5.x, `javax.*`), MyBatis, Maven, JSP**다. 전자정부 최신 메이저가
  Spring Boot 3/jakarta로 넘어갔는지는 이 저장소에서 확인할 수 없다 — 대상 프로젝트 `pom.xml`로 버전 조합을 먼저 확인한다.
- 표기: **코드 확인**(파일:라인) / **추론** / **확인 필요**. 경로의 `…/`는 `backend/src/main/java/com/gtp/`.
- 이 문서의 코드 조각은 **문서 안 예시**다. 저장소 코드에 추가하지 않았다.

---

## 0. 가져갈 것 / 새로 쓸 것

| 구분 | 대상 | 이식 방법 |
|---|---|---|
| 그대로(문법만 손봄) | `…/domain/{map,mymap,geotiff,wind,geoserver}`의 `controller`, `dto`, `service`, `mymap/util` | 패키지명 변경 + 1·2절 치환 |
| 그대로 | `…/global/response/ApiResponse`, `…/global/exception/{BaseErrorCode, CustomException}`, `…/global/gis/{GisErrorCode, GisUserContext}` | 5파일. 9절 참고 |
| 새로 씀 | `GisUserContext` 구현 1개 | 8절 스켈레톤 |
| 새로 씀 | `entity` → VO(어노테이션 제거), `repository` → MyBatis Mapper 인터페이스 + XML | 7절 예시, SQL은 `query-spec.md` 10절 |
| 새로 씀 | 예외 핸들러(`@RestControllerAdvice`, 지도 패키지로 범위 제한) | 9절 |
| 새로 씀 | 호스트 프록시 5종(VWorld 검색·데이터·범례, WFS, 지역명) | `query-spec.md` 9절 |
| 버림 | `SecurityContextGisUserContext`(JWT 전용), JPA 엔티티 어노테이션, `EntityManager.flush()` 호출, Spring Data Auditing | |

지도 도메인이 GTProject의 다른 도메인을 참조하는 곳은 0건이다(코드 확인: BK-2 검사, `02_backend_BK-2.md` 5절).

---

## 1. Java 17 문법 → JDK 11 (grep 결과)

검색 범위: `…/domain/{map,mymap,geotiff,wind,geoserver}` + `…/global/{gis,exception,response}`.

| 문법 (도입 버전) | 위치 (코드 확인) | JDK 11 대체 |
|---|---|---|
| `record` (16) | `mymap/util/CoordinateTransformUtil.java:73` `TransverseMercator` | `private static final class` + final 필드 + 생성자 (`implements ToWgs84` 유지) |
| 텍스트 블록 `"""` (15) | `geotiff/service/GeoTiffProcessor.java:85, 155` (파이썬 스크립트 문자열) | 문자열 연결 + `"\n"`. **들여쓰기가 파이썬 문법이므로 공백을 정확히 유지** |
| 텍스트 블록 `"""` (15) | `wind/repository/WindFrameRepository.java:19` (JPQL) | MyBatis로 가면 파일째 사라짐 |
| switch 식 / 화살표 case / `yield` (14) | `mymap/service/UserMapUploadService.java:244` (`cellToString`), `mymap/util/CoordinateTransformUtil.java:27` (`buildTransform`), `mymap/util/PrjParser.java:51` (화살표 case 문), `:78` (`isSupported`) | 전통 `switch` + `case X: … break;` / `return` |
| `Stream.toList()` (16) | 16회 / 7파일: `map/service/LayerGroupService.java:24`, `map/service/LayerService.java:34, 80, 188, 208`, `mymap/service/UserMapPermissionService.java:57, 60, 61, 85, 90`, `mymap/service/UserMapService.java:36, 158`, `wind/controller/WindController.java:38`, `geoserver/service/GeoServerService.java:154, 158`, `global/gis/SecurityContextGisUserContext.java:33` | `.collect(Collectors.toList())`. 결과 리스트를 수정하는 코드는 없어 의미 차이(불변/가변) 영향 없음(코드 확인: 위 호출처) |
| `instanceof` 패턴, `var`, `sealed`/`permits`, `String.formatted`, `strip`, `repeat` | 0건 | - |

설계문서 B3 표의 "`toList()` 11회/4파일"은 일부 파일(`UserMapService`, `GeoServerService`, `global/gis`)을 빠뜨린 수치였다.
감사 스크립트 14번이 세는 16회(geotiff 1회 포함)와도 다르다 — geotiff의 1회는 `Collectors.toList()`라서 Java 16 API가 아니다(`GeoTiffService.java:98`).

JDK 11에서 **문제없는** API(참고): `String.isBlank()`, `List.of`, `InputStream.readAllBytes()`, `java.net.http.HttpClient`
(`GeoServerService`, `WindDataService`), `CompletableFuture`. JDK 8이면 `isBlank`·`HttpClient`에서 막힌다.

치환 예(문서용):

```java
// record → final class (CoordinateTransformUtil.java:73)
private static final class TransverseMercator implements ToWgs84 {
    private final double a, f, lat0, lon0, k0, falseEasting, falseNorthing;
    TransverseMercator(double a, double f, double lat0, double lon0, double k0,
                       double falseEasting, double falseNorthing) {
        this.a = a; this.f = f; this.lat0 = lat0; this.lon0 = lon0; this.k0 = k0;
        this.falseEasting = falseEasting; this.falseNorthing = falseNorthing;
    }
    @Override public double[] toLonLat(double x, double y) { /* 본문 그대로 */ }
}

// switch 식 → 전통 switch (UserMapUploadService.java:244)
switch (cell.getCellType()) {
    case STRING:  return cell.getStringCellValue();
    case NUMERIC: { double v = cell.getNumericCellValue();
                    return (v == Math.floor(v)) ? String.valueOf((long) v) : String.valueOf(v); }
    case BOOLEAN: return String.valueOf(cell.getBooleanCellValue());
    case FORMULA: return cell.getCellFormula();
    default:      return "";
}
```

---

## 2. `jakarta.*` → `javax.*`

| import | 파일 (코드 확인) | 이식 후 |
|---|---|---|
| `jakarta.persistence.*` (10) + `jakarta.persistence.EntityManager` (2) | 엔티티 9개, `LayerService`, `UserMapPermissionService` | **MyBatis면 삭제**(엔티티 → VO, `flush()` 호출 삭제) |
| `jakarta.servlet.http.HttpServletResponse` | `mymap/controller/UserMapController.java` (geojson 스트리밍) | `javax.servlet.http.HttpServletResponse` |
| `jakarta.servlet.http.HttpServletRequest` | `global/exception/GlobalExceptionHandler.java` | 새로 쓰는 예외 핸들러에서 `javax.servlet` |
| `jakarta.validation.Valid` (2) | `LayerController`, `LayerGroupController` | `javax.validation.Valid` (hibernate-validator 6.x 필요 — 전자정부 기본 포함 여부 확인 필요) |
| `jakarta.validation.constraints.NotBlank` (2) | `LayerRequest`, `LayerGroupRequest` | `javax.validation.constraints.NotBlank` |

---

## 3. Spring Boot 3 자동 설정 → 전자정부 XML 설정

| Boot에서 쓰는 것 (코드 확인) | 전자정부(Spring 5, XML)에서 할 일 |
|---|---|
| `@Value` 키: `geoserver.url`, `geoserver.admin.user`, `geoserver.admin.password`, `geoserver.legend-layer`(모두 **기본값 없음**), `kma.api-key`, `wind.forecast-hours`(**기본값 없음**), `kma.base-url`, `wind.output.resolution-deg`, `wind.source-stride`, `titiler.url`, `titiler.container-name`, `geotiff.upload-dir`, `mymap.upload-dir`(기본값 있음) | `globals.properties`(또는 프로젝트 설정 파일) + `<context:property-placeholder>`. 기본값 없는 키가 빠지면 **기동 실패**. 비밀 값(비밀번호·API 키)은 저장소에 넣지 않고 서버 환경 변수·암호화 설정으로 |
| `@EnableJpaAuditing` (`GtpApplication`) | 불필요. `created_at`/`updated_at`/`uploaded_at`은 INSERT·UPDATE SQL에서 `now()`(Oracle `SYSTIMESTAMP`) |
| `@EnableAsync` (`GtpApplication`) + `@Async` 2곳 | `<task:annotation-driven executor="gisExecutor"/>` + `<task:executor id="gisExecutor" pool-size="2-4" queue-capacity="50"/>`. Boot는 스레드 풀을 자동으로 만들지만, 순수 Spring 기본(`SimpleAsyncTaskExecutor`)은 **요청마다 새 스레드**를 만든다(추론) |
| `@EnableScheduling` + `@Scheduled` 1곳 (`WindDataService.java:72`) | `<task:annotation-driven scheduler="gisScheduler"/>` + `<task:scheduler id="gisScheduler" pool-size="1"/>` 또는 `<task:scheduled-tasks>`. WAS가 여러 대면 **중복 실행** → 한 대에서만 켜기 |
| `JdbcTemplate` 빈 자동 생성 (`FeatureBatchInserter`) | MyBatis 배치(7.4절)로 바꾸거나 `JdbcTemplate` 빈을 직접 등록. 트랜잭션 매니저는 `DataSourceTransactionManager` 하나로 MyBatis·JdbcTemplate 공유 |
| `spring.servlet.multipart.max-file-size/max-request-size: 2GB`, `server.tomcat.max-swallow-size: -1` (`application.yml`) | `CommonsMultipartResolver`(`maxUploadSize`) 또는 `StandardServletMultipartResolver` + `web.xml`의 `<multipart-config>`. Tomcat은 `server.xml` Connector `maxSwallowSize="-1"`. JEUS/WebLogic 등은 WAS별 업로드 제한 확인 필요 |
| Jackson 날짜 형식(Boot가 `WRITE_DATES_AS_TIMESTAMPS` 끔) | `jackson-datatype-jsr310` 등록 + `WRITE_DATES_AS_TIMESTAMPS` 끄기(예: `Jackson2ObjectMapperFactoryBean`의 `featuresToDisable`). 안 하면 `createdAt`이 `[2026,9,23,…]` 배열로 나가거나 직렬화 오류(추론) |
| `@RestController` 스캔 | `<context:component-scan>`에 지도 패키지 포함. `@ResponseBody` JSON 변환기(`MappingJackson2HttpMessageConverter`) 등록 확인 |
| DispatcherServlet 매핑 | 전자정부 기본 예제는 `*.do` 매핑이 흔하다 → `/api/*`(또는 프로젝트 규칙 경로)를 받는 매핑이 필요. 경로를 바꾸면 프론트 `apiBaseUrl`로 맞춘다 |
| 타일 경로 `…/tiles/{id}/{z}/{x}/{y}.png` | `.png` 확장자를 정적 리소스 매핑·보안 필터가 먼저 가로채지 않는지 확인 필요. Spring 5.2 이하는 suffix pattern match 기본 켜짐(패턴에 `.png`가 명시돼 동작은 할 것, 추론) |
| Lombok (`@Getter`, `@Builder`, `@RequiredArgsConstructor`, `@Slf4j`) | 업무 프로젝트에 Lombok이 없으면 추가(1.18.x, JDK 11 지원)하거나 delombok |

---

## 4. 의존성

| 의존성 (GTProject `backend/pom.xml`) | JDK 11 | 이식 메모 |
|---|---|---|
| GeoTools 32.1 `gt-shapefile`, `gt-geojson` (+ `gt-main`, `gt-api`) | **OK** — 로컬 `~/.m2` jar 클래스 버전 55(= Java 11) 확인(2026-09-30, gt-main·gt-shapefile·gt-geojson·gt-api) | 저장소 `repo.osgeo.org` 필요 → 폐쇄망이면 사내 Nexus 미러. 패키지가 `org.geotools.api.*`(30 이상)라 업무 쪽에 옛 GeoTools(`org.opengis.*`)가 있으면 **충돌**. `CRS.decode()` 금지(EPSG DB 조회로 폐쇄망에서 멈춤, `.claude/rules/map.md`) |
| JTS (`org.locationtech.jts`, GeoTools가 끌어옴) | OK — 클래스 버전 52(Java 8) 확인 | 업무 쪽 JTS 버전과 맞추기 |
| Apache POI `poi-ooxml` 5.3.0 | OK — 클래스 버전 52 확인 | 업무 쪽(엑셀 공통 기능)에 POI 3.x/4.x가 있으면 **버전 충돌**. 한쪽으로 통일 |
| Jackson (`ObjectMapper`, `JsonNode`, `ObjectNode`) | OK | 업무 쪽 버전 사용 |
| `java.net.http.HttpClient` | OK (Java 11 표준) | JDK 8이면 불가 |
| `grib2json` 0.8.3 + `unidata-all` 저장소 | - | **미사용**(바람길은 LDAPS JSON을 직접 가공). 가져가지 않는다 |
| `jjwt` | - | JWT 인증은 GTProject 전용. 가져가지 않는다 |
| PostgreSQL 드라이버 | - | 업무 DB 드라이버로(Oracle/Tibero면 `ddl.md` 9절) |

---

## 5. 업로드·외부 프로세스

| 항목 | 현재 동작 (코드 확인) | 이식 시 확인 |
|---|---|---|
| shp 업로드 | `files` 여러 개 → `MYMAP_UPLOAD_DIR`에 `UUID.확장자` 저장 → `.prj`를 정규식으로 판별(`PrjParser`) → `@Async` 파싱·4326 변환·1000건 배치 INSERT → 임시 파일 삭제 (`UserMapUploadService.java:67-119`, `UserMapProcessor.java:44-94`) | 업로드 폴더 권한·용량, 한글 파일명(`.dbf` 인코딩 — `.cpg` 처리 없음, 확인 필요), 실패 시 남는 피처 정리 |
| 엑셀 업로드 | preview에서 파일 저장 + `uploadId → 경로`를 **서버 메모리 맵**에 보관 → confirm에서 읽어 동기 처리 (`UserMapUploadService.java:48-49, 127-240`) | WAS가 여러 대이거나 세션 고정이 없으면 confirm이 404. DB나 공유 스토리지로 바꾸는 것을 권장. 방치된 preview 파일 정리 없음 |
| GeoTIFF 업로드 | 최대 2GB → `GEOTIFF_UPLOAD_DIR` 저장 → `@Async`: `gdal_translate -of COG`, `gdalinfo -json`(PATH에 GDAL 필요). 없으면 `docker exec <TITILER_CONTAINER_NAME> python …` (`GeoTiffProcessor.java:29-197`) | 공공기관 서버에 GDAL 설치·Docker 허용 여부. titiler 컨테이너가 업로드 폴더를 `/data`로 마운트해야 함. 타일은 백엔드가 `TITILER_URL`로 대리 요청 |
| 파일 검사 | 확장자만 검사(`.tif/.tiff`, `.xlsx`, `.shp`·`.dbf` 존재) | 기관 보안 점검 기준에 따라 매직 넘버·용량·악성코드 검사 추가 검토 |
| 좌표 변환 | `CoordinateTransformUtil`이 4326/3857/5186/5179를 공식으로 직접 변환(EPSG DB 없음) | 다른 좌표계(예: 5174, 5181)가 필요하면 여기에 추가 |

---

## 6. `@Async` · 트랜잭션 · 스케줄러 규칙

1. **`@Async` 메서드를 `@Transactional` 안에서 부르지 않는다.** 커밋 전에 비동기 스레드가 조회해서 빈 값을 받고 조용히 끝난다.
   `uploadShp`에 `@Transactional`이 일부러 없다(코드 확인: `UserMapUploadService.java:62-66` 주석). MyBatis로 옮겨도 같다 —
   INSERT 매퍼 호출 → 커밋 → 그 다음에 `processShp(id, …)`.
2. `@Async`·`@Transactional`은 프록시로 동작한다. **같은 클래스 안에서 부르면 적용되지 않는다**(self-invocation). 현재 `WindDataService.scheduledRefresh()` →
   `refresh()`가 이 경우다(`.claude/rules/backend.md`). 이식할 때 갱신 로직을 별도 빈으로 분리한다.
3. 비동기 처리(`processShp`, GeoTIFF `process`)는 트랜잭션이 없어 부분 실패가 남는다 → 실패 시 정리 SQL(`DELETE FROM tbl_user_map_feature WHERE user_map_id = ?`)을 넣을지 결정.
4. geojson 스트리밍(`query-spec.md` U3)은 PostgreSQL에서 **트랜잭션(자동 커밋 끔) 안에서** fetchSize를 줘야 커서로 읽힌다(추론: PG JDBC 규칙). Oracle은 fetchSize만으로 동작.
5. "전부 삭제 → 재삽입"(개인 레이어 설정, 권한 매핑, 공유)은 한 `@Transactional` 안에서 순서대로 실행한다. JPA의 `entityManager.flush()`는 MyBatis에선 필요 없다.

---

## 7. MyBatis 매퍼 예시

VO는 엔티티에서 JPA 어노테이션만 뺀 모양(예: `LayerVO`에 `groupId` 필드 추가 — JPA는 `LayerGroup group` 연관이었음).

### 7.1 레이어 트리 (L1·L2) — `LayerMapper.xml`

```xml
<mapper namespace="gis.map.mapper.LayerMapper">

    <resultMap id="layerResultMap" type="gis.map.vo.LayerVO">
        <id     property="id"          column="id"/>
        <result property="name"        column="name"/>
        <result property="type"        column="type"/>
        <result property="sourceType"  column="source_type"/>
        <result property="url"         column="url"/>
        <result property="layerName"   column="layer_name"/>
        <result property="styleName"   column="style_name"/>
        <result property="styleConfig" column="style_config"/>   <!-- Oracle: jdbcType=CLOB -->
        <result property="format"      column="format"/>
        <result property="projection"  column="projection"/>
        <result property="minZoom"     column="min_zoom"/>
        <result property="maxZoom"     column="max_zoom"/>
        <result property="opacity"     column="opacity"/>
        <result property="visible"     column="visible"/>          <!-- Oracle NUMBER(1): TypeHandler -->
        <result property="sortOrder"   column="sort_order"/>
        <result property="groupId"     column="group_id"/>
        <result property="groupName"   column="group_name"/>
        <result property="description" column="description"/>
        <result property="createdAt"   column="created_at"/>
        <result property="updatedAt"   column="updated_at"/>
    </resultMap>

    <select id="selectAllOrdered" resultMap="layerResultMap">
        SELECT id, name, type, source_type, url, layer_name, style_name, style_config, format, projection,
               min_zoom, max_zoom, opacity, visible, sort_order, group_id, group_name, description, created_at, updated_at
        FROM tbl_layer
        ORDER BY sort_order ASC, id ASC
    </select>

    <select id="selectGroupsOrdered" resultType="gis.map.vo.LayerGroupVO">
        SELECT id, name, parent_id AS parentId, sort_order AS sortOrder, created_at AS createdAt, updated_at AS updatedAt
        FROM tbl_layer_group
        ORDER BY sort_order ASC, id ASC
    </select>

    <select id="selectLayerIdsByPermission" parameterType="string" resultType="long">
        SELECT layer_id FROM tbl_layer_permission_access WHERE permission = #{permission}
    </select>
</mapper>
```

서비스는 `LayerService.getTree()`/`getTreeForPermission()`의 조립 코드를 그대로 쓰고, `layer.getGroup().getId()`만 `layer.getGroupId()`로,
`LayerGroupResponse(g)`의 `g.getParentId()`는 VO 필드로 바꾼다.

### 7.2 개인 레이어 설정 (L3·L4·L5) — `LayerUserAccessMapper.xml`

```xml
<mapper namespace="gis.map.mapper.LayerUserAccessMapper">

    <select id="selectLayerIdsByUser" parameterType="string" resultType="long">
        SELECT layer_id FROM tbl_layer_user_access WHERE user_id = #{userId}
    </select>

    <delete id="deleteByUser" parameterType="string">
        DELETE FROM tbl_layer_user_access WHERE user_id = #{userId}
    </delete>

    <!-- PostgreSQL: 여러 행 VALUES. Oracle/Tibero는 id가 IDENTITY/시퀀스라 한 건씩 insert를 반복하는 쪽이 단순 -->
    <insert id="insertAll">
        INSERT INTO tbl_layer_user_access (user_id, layer_id) VALUES
        <foreach collection="layerIds" item="layerId" separator=",">
            (#{userId}, #{layerId})
        </foreach>
    </insert>
</mapper>
```

```java
// 서비스(문서용). 행이 0개면 null — 프론트 계약(query-spec.md 11절)
@Transactional(readOnly = true)
public List<Long> getUserLayerIds(String userId) {
    List<Long> ids = layerUserAccessMapper.selectLayerIdsByUser(userId);
    return ids.isEmpty() ? null : ids;
}

@Transactional
public void setUserLayers(String userId, List<Long> layerIds) {
    layerUserAccessMapper.deleteByUser(userId);                 // flush() 불필요
    for (Long id : layerIds) {
        if (layerMapper.countById(id) == 0) throw new CustomException(GisErrorCode.LAYER_NOT_FOUND);
    }
    if (!layerIds.isEmpty()) layerUserAccessMapper.insertAll(userId, layerIds);   // @Param("userId"), @Param("layerIds")
}
```

### 7.3 나만의지도 목록 (U1) — `UserMapMapper.xml`

```xml
<select id="selectVisibleTo" resultMap="userMapListResultMap">
    SELECT m.id, m.name, m.description, m.source_type, m.geom_type, m.status, m.visible, m.feature_count,
           m.style_config, m.created_at,
           CASE WHEN m.owner_id = #{userId} THEN 1 ELSE 0 END AS is_owner
    FROM tbl_user_map m
    WHERE m.owner_id = #{userId}
       OR m.id IN (SELECT ua.user_map_id FROM tbl_user_map_user_access ua WHERE ua.user_id = #{userId})
    <if test="roleCodes != null and roleCodes.size() > 0">
       OR m.id IN (SELECT pa.user_map_id FROM tbl_user_map_permission_access pa
                   WHERE pa.role_code IN
                   <foreach collection="roleCodes" item="r" open="(" separator="," close=")">#{r}</foreach>)
    </if>
    ORDER BY m.created_at DESC
</select>
```

JSON 키는 `owner`여야 한다(`query-spec.md` U1). `is_owner`를 VO의 `boolean owner`에 매핑하고 게터는 `isOwner()`.

### 7.4 피처 대량 INSERT와 스트리밍 (U3·U5·U7)

```java
// 배치 INSERT: FeatureBatchInserter(JdbcTemplate) 대신 MyBatis BATCH 실행기 (문서용)
try (SqlSession batch = sqlSessionFactory.openSession(ExecutorType.BATCH, false)) {
    UserMapFeatureMapper m = batch.getMapper(UserMapFeatureMapper.class);
    int n = 0;
    for (/* 피처 */;;) {
        m.insert(userMapId, geometryJson, propertiesJson);  // INSERT INTO tbl_user_map_feature (user_map_id, geometry_json, properties_json) VALUES (…)
        if (++n % 1000 == 0) { batch.flushStatements(); batch.commit(); batch.clearCache(); }
    }
    batch.flushStatements(); batch.commit();
}
// 기존 FeatureBatchInserter를 그대로 쓰고 JdbcTemplate 빈만 등록해도 된다(더 간단).
```

```xml
<!-- 스트리밍 SELECT: ResultHandler로 한 행씩 받아 Writer에 바로 쓴다 -->
<select id="streamByMap" parameterType="long" resultType="map" fetchSize="500" resultSetType="FORWARD_ONLY">
    SELECT geometry_json, properties_json FROM tbl_user_map_feature WHERE user_map_id = #{id}
</select>
```

```java
@Transactional(readOnly = true)   // PostgreSQL 커서 조건
public void streamGeoJson(Long id, Writer w) {
    // w.write("{\"type\":\"FeatureCollection\",\"features\":[") … 쉼표 처리는 UserMapService.java:79-118 그대로
    sqlSession.select("gis.mymap.mapper.UserMapFeatureMapper.streamByMap", id, ctx -> {
        Map<String, Object> row = (Map<String, Object>) ctx.getResultObject();
        // 컬럼 키 대소문자는 DB마다 다르다(Oracle은 대문자) — 확인 필요
        // w.write(geometry_json) / properties_json(없으면 "{}")
    });
}
```

Oracle/Tibero: `resultType="map"`에서 CLOB는 `Clob` 객체로 올 수 있다 → `resultMap`에 `javaType=String jdbcType=CLOB`로 받거나 `getCharacterStream`으로 흘려보낸다.

---

## 8. `GisUserContext` 전자정부 구현 (스켈레톤)

인터페이스(그대로 복사, 코드 확인: `…/global/gis/GisUserContext.java`): `String currentUserId()`(비로그인 null), `List<String> currentRoleCodes()`(`ROLE_` 제거, 비로그인 빈 목록).
**구현 빈은 하나만** 등록한다(여러 개면 주입 모호성 오류).

```java
// 문서용 예시 — 공통컴포넌트 EgovUserDetailsHelper 기반. 메서드·필드 이름은 대상 프로젝트 버전에서 확인(추론)
@Component
public class EgovGisUserContext implements GisUserContext {

    @Override
    public String currentUserId() {
        if (!Boolean.TRUE.equals(EgovUserDetailsHelper.isAuthenticated())) return null;
        Object user = EgovUserDetailsHelper.getAuthenticatedUser();
        if (!(user instanceof LoginVO)) return null;
        return ((LoginVO) user).getId();          // 또는 getUniqId() — tbl_*의 user_id/owner_id에 넣을 값과 일치시킬 것
    }

    @Override
    public List<String> currentRoleCodes() {
        if (!Boolean.TRUE.equals(EgovUserDetailsHelper.isAuthenticated())) return Collections.emptyList();
        List<String> auths = EgovUserDetailsHelper.getAuthorities();   // 예: ["ROLE_ADMIN", "ROLE_USER"]
        if (auths == null) return Collections.emptyList();
        List<String> out = new ArrayList<>();
        for (String a : auths) out.add(a.startsWith("ROLE_") ? a.substring(5) : a);
        return out;
    }
}
```

세션 방식이라면(스프링 시큐리티 없이) `RequestContextHolder`로 현재 요청의 세션에서 로그인 VO를 꺼내도 된다:

```java
HttpServletRequest req = ((ServletRequestAttributes) RequestContextHolder.currentRequestAttributes()).getRequest();
HttpSession session = req.getSession(false);
LoginVO vo = session == null ? null : (LoginVO) session.getAttribute("loginVO");   // 세션 키 이름은 프로젝트 규칙 확인
```

주의:
- `@Async` 스레드에서는 요청·세션 컨텍스트가 없다. 현재 코드는 컨트롤러에서 userId를 읽어 파라미터로 넘기므로 문제없다 — 이 구조를 유지한다.
- 레이어 트리의 **권한 키**는 백엔드가 아니라 프론트 호스트가 정한다(`restSources({ getPermissionKey })` 또는 `restLayerTree(ctx, { getPermissionKey })`). 전자정부 권한 코드(예: 권한 그룹 코드)를 키로 쓰려면
  JSP에서 `GisMapHost.getCurrentUser()`에 그 값을 넣고 `getPermissionKey`를 지정한다. `tbl_layer_permission_access.permission`이 `varchar(20)`인 점 주의.

### 인증 방식 차이 (JWT → 세션)

| 항목 | GTProject | 전자정부 |
|---|---|---|
| 인증 수단 | `Authorization: Bearer <JWT>` (Stateless) | 세션 쿠키(JSESSIONID) |
| 프론트 호스트 설정 | `getAuthToken`이 JWT 반환, `http.getHeaders`에 Bearer 추가 | `getAuthToken: () => null`, `http.credentials: 'same-origin'`(기본값), 헤더 불필요 |
| CSRF | 끔 | Spring Security CSRF가 켜져 있으면 PUT/POST/DELETE에 토큰 헤더 필요 → `http.getHeaders()`에서 JSP `<meta>`의 CSRF 토큰을 읽어 추가 |
| 401/403 | Security 기본(403 빈 본문) | 로그인 페이지로 리다이렉트(302 HTML)되면 프론트가 JSON 파싱에 실패 → `/api/**`는 리다이렉트 대신 401/403 + 봉투 JSON을 주도록 entry point 설정 권장 |
| 권한 규칙 | `SecurityConfig.java:42-58` | `query-spec.md` 2절 표의 권한을 `<intercept-url>` 또는 인터셉터로 옮긴다. **관리 API(L7~L12, G2~G4, T4~T6, W4)는 관리자 권한으로 좁히는 것을 권장** |

### CORS

JSP 페이지와 API가 같은 도메인이면 CORS 설정이 필요 없다. 다른 도메인이면 `<mvc:cors>`로 허용 Origin을 명시하고,
세션 쿠키를 쓰려면 `allow-credentials="true"` + 프론트 `http.credentials: 'include'`. GTProject 설정은 `…/global/config/CorsConfig.java`.

---

## 9. 에러·응답 공통 조각 (그대로 복사 + 핸들러만 새로)

- `BaseErrorCode`, `GisErrorCode`, `CustomException`, `ApiResponse`는 `org.springframework.http.HttpStatus`와 Lombok만 쓴다 → Spring 5에서 그대로 컴파일된다(추론).
- `GlobalExceptionHandler`는 GTProject 전역 핸들러라 가져가지 않는다. 업무 쪽 전역 핸들러를 덮어쓰지 않도록 **지도 패키지로 범위를 제한**한 핸들러를 새로 둔다.

```java
// 문서용 예시
@RestControllerAdvice(basePackages = "gis")          // 지도 컨트롤러 패키지만
@Order(Ordered.HIGHEST_PRECEDENCE)
public class GisExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(GisExceptionHandler.class);

    @ExceptionHandler(CustomException.class)
    public ResponseEntity<ApiResponse<?>> handle(CustomException e) {
        return ResponseEntity.status(e.getErrorCode().getStatus()).body(ApiResponse.fail(e.getMessage()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<?>> handle(Exception e, HttpServletRequest req) {   // javax.servlet
        log.error("GIS unhandled {} {}", req.getMethod(), req.getRequestURI(), e);        // 예외 객체를 같이 넘긴다
        return ResponseEntity.status(500).body(ApiResponse.fail("서버 오류가 발생했습니다."));
    }
}
```

- 업무 쪽이 `EgovBizException` 등을 쓰더라도 지도 서비스는 `CustomException(GisErrorCode.X)`를 그대로 던지면 된다. 메시지·HTTP 상태는 `query-spec.md` 1.2절 표와 같아야 프론트가 같은 문구를 보여준다.
- (선택) `@Valid` 실패를 500 대신 400으로 주려면 `MethodArgumentNotValidException` 핸들러를 추가한다(현재 GTProject는 500 — `query-spec.md` 1.2절).

---

## 10. 이식 순서 체크리스트

- [ ] 대상 `pom.xml`로 JDK·Spring·전자정부 버전, 기존 GeoTools/JTS/POI/Jackson/Lombok 버전 확인(4절)
- [ ] DB에 `ddl.md` DDL 적용(Oracle/Tibero면 9절 변환) + 권장 인덱스
- [ ] 코드 복사 → 패키지명 변경 → 1절(문법)·2절(`javax`) 치환 → `mvn compile`
- [ ] 엔티티 → VO, Repository → Mapper(`query-spec.md` 10절 표의 매퍼 id 기준, 미사용 5개는 생략)
- [ ] 서비스에서 `EntityManager`·`flush()`·지연 로딩 호출(`getLayer().getId()` 등) 제거, 시각 컬럼 SQL로 채우기
- [ ] `GisUserContext` 구현 1개(8절), 지도 전용 예외 핸들러(9절)
- [ ] XML 설정: property-placeholder 키, 비동기 executor, 스케줄러, 멀티파트, Jackson 날짜, DispatcherServlet `/api/*` 매핑(3절)
- [ ] 보안 규칙: 권한 표 옮기기, `/api/**`의 401/403을 JSON으로, 관리 API 권한 좁히기(8절)
- [ ] 호스트 프록시 5종(`query-spec.md` 9절) — API 키는 서버 설정에서만
- [ ] 인프라: 업로드 폴더, GDAL 또는 titiler(`/data` 마운트), 기상청 API 키(`KMA_API_KEY`)
- [ ] 검증: `query-spec.md` 11절 계약을 curl로 확인 — 특히 L3가 행 없을 때 `data: null`, L1 정렬, U3 봉투 없음, 에러 봉투 메시지
- [ ] JSP 화면: `GisMap.create`/`GisMap.attach` + `adapters.rest`/`adapters.proxy`로 붙이고 레이어 패널·나만의지도·항공영상 조작 확인
