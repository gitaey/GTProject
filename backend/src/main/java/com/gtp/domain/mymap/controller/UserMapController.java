package com.gtp.domain.mymap.controller;

import com.gtp.domain.mymap.dto.*;
import com.gtp.domain.mymap.service.*;
import com.gtp.global.gis.GisUserContext;
import com.gtp.global.response.ApiResponse;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;

/**
 * 나만의지도 API. 다른 도메인 컨트롤러를 참조하지 않는 독립 엔드포인트 —
 * 인증 정보(userId/role)는 GisUserContext로만 받는다.
 * 모든 경로가 /api/mymap/** 아래라 SecurityConfig의 authenticated() 규칙이 그대로 적용된다(새 경로를 이 밖에 만들지 말 것).
 */
@RestController
@RequestMapping("/api/mymap")
@RequiredArgsConstructor
public class UserMapController {

    private static final MediaType XLSX = MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

    private final UserMapService userMapService;
    private final UserMapUploadService uploadService;
    private final ImportReportService reportService;
    private final MyMapQuotaService quotaService;
    private final MyMapColumnService columnService;
    private final SampleService sampleService;
    private final GisUserContext gisUserContext;
    private final UserMapShareService shareService;

    @GetMapping
    public ApiResponse<List<UserMapListItem>> list() {
        return ApiResponse.ok(userMapService.findVisibleTo(currentUserId(), currentRoleCodes()));
    }

    @GetMapping("/srid-options")
    public ApiResponse<List<String>> sridOptions() {
        return ApiResponse.ok(uploadService.supportedSrids());
    }

    /** 업로드 한도·내 레이어 수·지적도 기준월 */
    @GetMapping("/quota")
    public ApiResponse<MyMapQuotaResponse> quota() {
        return ApiResponse.ok(quotaService.quota(currentUserId()));
    }

    /** 샘플 엑셀(kind = pnu | address | coord). 봉투 없이 파일 그대로. */
    @GetMapping("/samples/{kind}")
    public ResponseEntity<byte[]> sample(@PathVariable String kind) {
        SampleService.Sample sample = sampleService.load(kind);
        return xlsx(sample.bytes(), sample.filename(), CacheControl.maxAge(Duration.ofHours(1)).cachePrivate());
    }

    @GetMapping("/{id}/status")
    public ApiResponse<UserMapStatusResponse> status(@PathVariable Long id) {
        return ApiResponse.ok(userMapService.getStatus(id, currentUserId(), currentRoleCodes()));
    }

    /** 레이어 컬럼 통계(스타일 대화상자용) — 볼 수 있는 사람(소유자·공유 대상). 형식은 ColumnStatsCollector 주석 */
    @GetMapping("/{id}/columns")
    public ApiResponse<com.fasterxml.jackson.databind.JsonNode> columns(@PathVariable Long id) {
        return ApiResponse.ok(columnService.columnsFor(id, currentUserId(), currentRoleCodes()));
    }

    /** 엑셀 가져오기 결과 보고서(레이어 주인만) */
    @GetMapping("/{id}/import-report")
    public ApiResponse<ImportReportResponse> importReport(@PathVariable Long id,
                                                          @RequestParam(defaultValue = "0") int page,
                                                          @RequestParam(defaultValue = "100") int size,
                                                          @RequestParam(required = false) String reason) {
        return ApiResponse.ok(reportService.report(id, currentUserId(), page, size, reason));
    }

    /** 실패 행 엑셀(레이어 주인만) — 원본 컬럼 + 실패사유 + 후보 */
    @GetMapping("/{id}/import-report.xlsx")
    public ResponseEntity<byte[]> importReportXlsx(@PathVariable Long id) {
        byte[] bytes = reportService.failuresXlsx(id, currentUserId());
        return xlsx(bytes, "나만의지도_실패행_" + id + ".xlsx", CacheControl.noStore());
    }

    // StreamingResponseBody(비동기 디스패치)로 만들면 Spring Security 필터 체인과의 상호작용에서
    // 응답이 끝까지 안 쓰이고 잘리는 문제(ERR_INCOMPLETE_CHUNKED_ENCODING)가 있어서,
    // 컨테이너 스레드를 그대로 점유하는 동기 방식으로 직접 응답 스트림에 쓴다.
    @GetMapping(value = "/{id}/geojson", produces = MediaType.APPLICATION_JSON_VALUE)
    public void geojson(@PathVariable Long id, HttpServletResponse response) throws IOException {
        // 응답 Writer를 열기 전에 먼저 검증한다 — 열고 나서 예외가 나면 응답이 이미 커밋돼
        // GlobalExceptionHandler가 정상적으로 에러를 못 만든다 (스택트레이스가 그대로 노출됨).
        userMapService.assertCanStreamGeoJson(id, currentUserId(), currentRoleCodes());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        userMapService.streamGeoJson(id, response.getWriter());
    }

    @PostMapping(value = "/upload/shp", consumes = "multipart/form-data")
    public ApiResponse<UserMapUploadResponse> uploadShp(
            @RequestParam("files") List<MultipartFile> files,
            @RequestParam("name") String name,
            @RequestParam(value = "description", required = false) String description,
            @RequestParam(value = "sourceSrid", required = false) String sourceSrid) {
        return ApiResponse.ok(uploadService.uploadShp(files, name, description, sourceSrid, currentUserId()));
    }

    @PostMapping(value = "/upload/excel/preview", consumes = "multipart/form-data")
    public ApiResponse<ExcelPreviewResponse> previewExcel(@RequestParam("file") MultipartFile file) {
        return ApiResponse.ok(uploadService.previewExcel(file, currentUserId()));
    }

    /** 이제 비동기 — 곧바로 {id, name, status: PROCESSING}을 돌려주고 진행률은 목록·상태 API로 본다. */
    @PostMapping("/upload/excel/confirm")
    public ApiResponse<UserMapUploadResponse> confirmExcel(@RequestBody ExcelConfirmRequest req) {
        return ApiResponse.ok(uploadService.confirmExcel(req, currentUserId()));
    }

    @PatchMapping("/{id}")
    public ApiResponse<Void> update(@PathVariable Long id, @RequestBody UserMapUpdateRequest req) {
        userMapService.update(id, currentUserId(), req);
        return ApiResponse.ok(null);
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        userMapService.delete(id, currentUserId());
        return ApiResponse.ok(null);
    }

    /** 현재 공유(소유자만) — 옛 필드 userIds·roleCodes + 이름·상태 users·roles */
    @GetMapping("/{id}/share")
    public ApiResponse<UserMapShareResponse> getShare(@PathVariable Long id) {
        return ApiResponse.ok(shareService.get(id, currentUserId()));
    }

    /** 통째로 바꾸기(소유자만) — 중복 제거·본인 제외·새 대상만 존재 검사·100개 상한 */
    @PutMapping("/{id}/share")
    public ApiResponse<Void> share(@PathVariable Long id, @RequestBody UserMapShareRequest req) {
        shareService.replace(id, currentUserId(), req.getUserIds(), req.getRoleCodes());
        return ApiResponse.ok(null);
    }

    /** 여러 레이어의 현재 공유(ids=1,2,3, 최대 50). 없거나 내 것이 아닌 id는 결과에서 빠진다. */
    @GetMapping("/shares")
    public ApiResponse<List<ShareSnapshotResponse>> shares(@RequestParam(required = false) String ids) {
        return ApiResponse.ok(shareService.snapshots(ids, currentUserId()));
    }

    /** 일괄 공유 더하기/빼기(mode = ADD | REMOVE) — 레이어별 소유자 검사, 한 트랜잭션 */
    @PostMapping("/shares/bulk")
    public ApiResponse<BulkShareResponse> bulkShare(@RequestBody BulkShareRequest req) {
        return ApiResponse.ok(shareService.bulk(currentUserId(), req));
    }

    private static ResponseEntity<byte[]> xlsx(byte[] bytes, String filename, CacheControl cache) {
        return ResponseEntity.ok()
                .contentType(XLSX)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(filename, StandardCharsets.UTF_8).build().toString())
                .cacheControl(cache)
                .contentLength(bytes.length)
                .body(bytes);
    }

    private String currentUserId() {
        return gisUserContext.currentUserId();
    }

    /** 공유 판정에 쓰는 그룹 코드 — 역할 + (있으면) "역할:세부권한" */
    private List<String> currentRoleCodes() {
        return gisUserContext.currentShareGroupCodes();
    }
}
