package com.gtp.domain.mymap.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.gtp.domain.mymap.dto.*;
import com.gtp.domain.mymap.entity.UserMap;
import com.gtp.domain.mymap.repository.UserMapRepository;
import com.gtp.domain.mymap.util.CoordinateTransformUtil;
import com.gtp.domain.mymap.util.FeatureBatchInserter;
import com.gtp.domain.mymap.util.PrjParser;
import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.geotools.geojson.geom.GeometryJSON;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Point;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.io.StringWriter;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserMapUploadService {

    private final UserMapRepository userMapRepository;
    private final JdbcTemplate jdbcTemplate;
    private final UserMapProcessor userMapProcessor;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final GeometryFactory geometryFactory = new GeometryFactory();
    private final GeometryJSON geometryJSON = new GeometryJSON(9);

    // 엑셀 프리뷰(uploadId -> 임시 파일 경로). 단일 인스턴스 배포 기준 인메모리 보관.
    private final Map<String, Path> pendingExcelUploads = new ConcurrentHashMap<>();

    @Value("${mymap.upload-dir:./mymap-uploads}")
    private String uploadDir;

    private static final List<String> DEFAULT_SRID_OPTIONS = List.of("EPSG:5186", "EPSG:4326", "EPSG:5179", "EPSG:3857");

    public List<String> supportedSrids() {
        return DEFAULT_SRID_OPTIONS;
    }

    // ---------- SHP 업로드 ----------

    // 주의: @Transactional을 걸면 안 된다 — 아래에서 @Async인 processShp()를 호출하는데,
    // 이 메서드가 트랜잭션 안에 있으면 UserMap insert가 아직 커밋되기 전에 비동기 스레드가
    // 먼저 그 행을 조회하게 돼 findById가 빈 값을 반환하고 조용히 종료해버린다(재현: 대용량
    // shp일수록 잘 걸림). userMapRepository.save()는 트랜잭션이 없어도 자체적으로 커밋되므로
    // 이 메서드는 non-transactional로 두고, processShp 호출 시점엔 이미 UserMap이 커밋된 상태여야 한다.
    public UserMapUploadResponse uploadShp(List<MultipartFile> files, String name, String description,
                                            String sourceSrid, String ownerId) {
        MultipartFile shp = null, shx = null, dbf = null, prj = null;
        for (MultipartFile f : files) {
            String n = f.getOriginalFilename();
            if (n == null) continue;
            String lower = n.toLowerCase();
            if (lower.endsWith(".shp")) shp = f;
            else if (lower.endsWith(".shx")) shx = f;
            else if (lower.endsWith(".dbf")) dbf = f;
            else if (lower.endsWith(".prj")) prj = f;
        }
        if (shp == null || dbf == null) {
            throw new CustomException(GisErrorCode.INVALID_SHP_FILE);
        }

        try {
            Path dir = Paths.get(uploadDir);
            Files.createDirectories(dir);
            String base = UUID.randomUUID().toString();
            Path shpPath = dir.resolve(base + ".shp");
            saveTo(shp, shpPath);
            if (shx != null) saveTo(shx, dir.resolve(base + ".shx"));
            saveTo(dbf, dir.resolve(base + ".dbf"));
            String resolvedSrid = sourceSrid != null && !sourceSrid.isBlank() ? sourceSrid : "EPSG:5186";
            if (prj != null) {
                saveTo(prj, dir.resolve(base + ".prj"));
                String detected = PrjParser.detect(new String(prj.getBytes(), java.nio.charset.StandardCharsets.UTF_8));
                if (detected != null) {
                    // .prj가 실제 정답이므로 사용자가 드롭다운에서 고른 값보다 우선한다
                    resolvedSrid = detected;
                } else {
                    log.warn("나만의지도(shp) .prj 좌표계 자동 인식 실패 — 사용자 선택값({})으로 진행", resolvedSrid);
                }
            }

            UserMap map = UserMap.builder()
                    .name(name != null && !name.isBlank() ? name : shp.getOriginalFilename())
                    .description(description)
                    .ownerId(ownerId)
                    .sourceType("SHP")
                    .sourceSrid(resolvedSrid)
                    .build();
            UserMap saved = userMapRepository.save(map);

            userMapProcessor.processShp(saved.getId(), shpPath, saved.getSourceSrid());

            return UserMapUploadResponse.builder()
                    .id(saved.getId()).name(saved.getName()).status(saved.getStatus()).build();
        } catch (IOException e) {
            throw new CustomException(GisErrorCode.FILE_UPLOAD_FAILED);
        }
    }

    private void saveTo(MultipartFile file, Path target) throws IOException {
        Files.copy(file.getInputStream(), target, StandardCopyOption.REPLACE_EXISTING);
    }

    // ---------- 엑셀 업로드 (프리뷰 -> 컬럼 선택 -> 확정) ----------

    public ExcelPreviewResponse previewExcel(MultipartFile file) {
        String name = file.getOriginalFilename();
        if (name == null || !name.toLowerCase().endsWith(".xlsx")) {
            throw new CustomException(GisErrorCode.INVALID_EXCEL_FILE);
        }
        try {
            Path dir = Paths.get(uploadDir);
            Files.createDirectories(dir);
            String uploadId = UUID.randomUUID().toString();
            Path stored = dir.resolve(uploadId + ".xlsx");
            Files.copy(file.getInputStream(), stored, StandardCopyOption.REPLACE_EXISTING);
            pendingExcelUploads.put(uploadId, stored);

            try (InputStream is = Files.newInputStream(stored); Workbook wb = WorkbookFactory.create(is)) {
                Sheet sheet = wb.getSheetAt(0);
                Row headerRow = sheet.getRow(0);
                if (headerRow == null) throw new CustomException(GisErrorCode.INVALID_EXCEL_FILE);
                List<String> headers = new ArrayList<>();
                for (Cell cell : headerRow) headers.add(cellToString(cell));

                List<List<String>> sample = new ArrayList<>();
                int last = Math.min(sheet.getLastRowNum(), 5);
                for (int r = 1; r <= last; r++) {
                    Row row = sheet.getRow(r);
                    if (row == null) continue;
                    List<String> values = new ArrayList<>();
                    for (int c = 0; c < headers.size(); c++) {
                        values.add(cellToString(row.getCell(c)));
                    }
                    sample.add(values);
                }

                return ExcelPreviewResponse.builder()
                        .uploadId(uploadId).headers(headers).sampleRows(sample).build();
            }
        } catch (IOException e) {
            throw new CustomException(GisErrorCode.FILE_UPLOAD_FAILED);
        }
    }

    @Transactional
    public UserMapUploadResponse confirmExcel(ExcelConfirmRequest req, String ownerId) {
        Path stored = pendingExcelUploads.get(req.getUploadId());
        if (stored == null || !Files.exists(stored)) {
            throw new CustomException(GisErrorCode.EXCEL_UPLOAD_NOT_FOUND);
        }

        UserMap map = UserMap.builder()
                .name(req.getName() != null && !req.getName().isBlank() ? req.getName() : "엑셀 업로드")
                .description(req.getDescription())
                .ownerId(ownerId)
                .sourceType("EXCEL")
                .sourceSrid(req.getSourceSrid() != null && !req.getSourceSrid().isBlank() ? req.getSourceSrid() : "EPSG:5186")
                .build();
        UserMap saved = userMapRepository.save(map);

        try (InputStream is = Files.newInputStream(stored); Workbook wb = WorkbookFactory.create(is)) {
            Sheet sheet = wb.getSheetAt(0);
            Row headerRow = sheet.getRow(0);
            List<String> headers = new ArrayList<>();
            for (Cell cell : headerRow) headers.add(cellToString(cell));

            int latIdx = headers.indexOf(req.getLatColumn());
            int lonIdx = headers.indexOf(req.getLonColumn());
            if (latIdx < 0 || lonIdx < 0) {
                throw new CustomException(GisErrorCode.INVALID_COORDINATE_COLUMN);
            }

            CoordinateTransformUtil.ToWgs84 transform = CoordinateTransformUtil.buildTransform(saved.getSourceSrid());

            int count = 0;
            try (FeatureBatchInserter inserter = new FeatureBatchInserter(jdbcTemplate, saved.getId())) {
                for (int r = 1; r <= sheet.getLastRowNum(); r++) {
                    Row row = sheet.getRow(r);
                    if (row == null) continue;
                    Double lat = cellToDouble(row.getCell(latIdx));
                    Double lon = cellToDouble(row.getCell(lonIdx));
                    if (lat == null || lon == null) continue;

                    Coordinate transformed = CoordinateTransformUtil.transformPoint(lon, lat, transform);
                    Point point = geometryFactory.createPoint(transformed);
                    StringWriter geomWriter = new StringWriter();
                    geometryJSON.write(point, geomWriter);

                    ObjectNode properties = objectMapper.createObjectNode();
                    for (int c = 0; c < headers.size(); c++) {
                        properties.put(headers.get(c), cellToString(row.getCell(c)));
                    }

                    inserter.add(geomWriter.toString(), properties.toString());
                    count++;
                }
            }
            saved.markReady("POINT", count);
            userMapRepository.save(saved);
        } catch (CustomException e) {
            saved.markFailed(e.getMessage());
            userMapRepository.save(saved);
            throw e;
        } catch (Exception e) {
            log.error("나만의지도(엑셀) 처리 실패 id={}: {}", saved.getId(), e.getMessage(), e);
            saved.markFailed(e.getMessage());
            userMapRepository.save(saved);
        } finally {
            pendingExcelUploads.remove(req.getUploadId());
            try {
                Files.deleteIfExists(stored);
            } catch (IOException ignored) {
            }
        }

        return UserMapUploadResponse.builder()
                .id(saved.getId()).name(saved.getName()).status(saved.getStatus()).build();
    }

    private String cellToString(Cell cell) {
        if (cell == null) return "";
        return switch (cell.getCellType()) {
            case STRING -> cell.getStringCellValue();
            case NUMERIC -> {
                double v = cell.getNumericCellValue();
                yield (v == Math.floor(v)) ? String.valueOf((long) v) : String.valueOf(v);
            }
            case BOOLEAN -> String.valueOf(cell.getBooleanCellValue());
            case FORMULA -> cell.getCellFormula();
            default -> "";
        };
    }

    private Double cellToDouble(Cell cell) {
        if (cell == null) return null;
        try {
            if (cell.getCellType() == CellType.NUMERIC) return cell.getNumericCellValue();
            return Double.parseDouble(cell.getStringCellValue().trim());
        } catch (Exception e) {
            return null;
        }
    }
}
