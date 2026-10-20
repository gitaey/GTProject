package com.gtp.domain.mymap.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gtp.domain.mymap.dto.ImportReportResponse;
import com.gtp.domain.mymap.entity.UserMap;
import com.gtp.domain.mymap.entity.UserMapImportFailure;
import com.gtp.domain.mymap.model.ImportFailureReason;
import com.gtp.domain.mymap.repository.UserMapFeatureRepository;
import com.gtp.domain.mymap.repository.UserMapImportFailureRepository;
import com.gtp.domain.mymap.repository.UserMapRepository;
import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import lombok.RequiredArgsConstructor;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.*;

/** 엑셀 가져오기 결과 보고서(U16)와 실패 행 엑셀(U17). 둘 다 레이어 주인만 볼 수 있다. */
@Service
@RequiredArgsConstructor
public class ImportReportService {

    static final int MAX_PAGE_SIZE = 500;
    private static final int XLSX_PAGE = 1000;
    static final String COL_REASON = "실패사유";
    static final String COL_CANDIDATES = "후보";

    private final UserMapRepository userMapRepository;
    private final UserMapImportFailureRepository failureRepository;
    private final UserMapFeatureRepository featureRepository;
    private final UserMapPermissionService permissionService;
    private final ObjectMapper om = new ObjectMapper();

    @Transactional(readOnly = true)
    public ImportReportResponse report(Long id, String userId, int page, int size, String reason) {
        UserMap map = ownedMap(id, userId);
        int p = Math.max(page, 0);
        int s = Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
        PageRequest pr = PageRequest.of(p, s, Sort.by("rowNo").ascending().and(Sort.by("id").ascending()));
        Page<UserMapImportFailure> rows = reason == null || reason.isBlank()
                ? failureRepository.findByUserMapId(id, pr)
                : failureRepository.findByUserMapIdAndReasonCode(id, reason.strip(), pr);

        Map<String, Long> byReason = new LinkedHashMap<>();
        failureRepository.countByReason(id).stream()
                .sorted((a, b) -> Long.compare((Long) b[1], (Long) a[1]))
                .forEach(r -> byReason.put((String) r[0], (Long) r[1]));

        return ImportReportResponse.builder()
                .total(map.getMatchedCount() + map.getFailedCount())
                .matched(map.getMatchedCount())
                .failed(map.getFailedCount())
                .byReason(byReason)
                .rows(rows.getContent().stream().map(this::toRow).toList())
                .page(p)
                .size(s)
                .totalRows(rows.getTotalElements())
                .duplicatePnuCount(featureRepository.countDuplicatePnu(id))
                .build();
    }

    /** 원본 컬럼 그대로 + 실패사유 + 후보. 고친 행만 새 파일로 올릴 수 있게 행 번호 같은 덧붙임 열은 두지 않는다. */
    @Transactional(readOnly = true)
    public byte[] failuresXlsx(Long id, String userId) {
        ownedMap(id, userId);

        List<String> columns = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        List<UserMapImportFailure> all = new ArrayList<>();
        for (int p = 0; ; p++) {
            Page<UserMapImportFailure> page = failureRepository.findByUserMapId(id,
                    PageRequest.of(p, XLSX_PAGE, Sort.by("rowNo").ascending().and(Sort.by("id").ascending())));
            for (UserMapImportFailure f : page.getContent()) {
                all.add(f);
                for (String k : keysOf(f.getRowJson())) {
                    if (seen.add(k)) columns.add(k);
                }
            }
            if (!page.hasNext()) break;
        }

        try (SXSSFWorkbook wb = new SXSSFWorkbook(100); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = wb.createSheet("실패 행");
            Row header = sheet.createRow(0);
            int c = 0;
            for (String col : columns) header.createCell(c++).setCellValue(col);
            header.createCell(c++).setCellValue(COL_REASON);
            header.createCell(c).setCellValue(COL_CANDIDATES);

            int r = 1;
            for (UserMapImportFailure f : all) {
                JsonNode json = parse(f.getRowJson());
                Row row = sheet.createRow(r++);
                int cc = 0;
                for (String col : columns) {
                    JsonNode v = json == null ? null : json.get(col);
                    row.createCell(cc++).setCellValue(v == null || v.isNull() ? "" : v.asText()); // 문자열 셀 — 수식으로 해석되지 않는다
                }
                row.createCell(cc++).setCellValue(ImportFailureReason.messageOf(f.getReasonCode()));
                row.createCell(cc).setCellValue(String.join(" | ", candidatesOf(f.getCandidatesJson())));
            }
            wb.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private UserMap ownedMap(Long id, String userId) {
        UserMap map = userMapRepository.findById(id).orElseThrow(() -> new CustomException(GisErrorCode.USER_MAP_NOT_FOUND));
        permissionService.assertOwner(map, userId);
        return map;
    }

    private ImportReportResponse.Row toRow(UserMapImportFailure f) {
        List<String> candidates = candidatesOf(f.getCandidatesJson());
        return ImportReportResponse.Row.builder()
                .rowNo(f.getRowNo())
                .reason(f.getReasonCode())
                .message(ImportFailureReason.messageOf(f.getReasonCode()))
                .input(f.getInputValue())
                .candidates(candidates.isEmpty() ? null : candidates)
                .build();
    }

    private List<String> keysOf(String rowJson) {
        JsonNode n = parse(rowJson);
        if (n == null) return List.of();
        List<String> keys = new ArrayList<>();
        n.fieldNames().forEachRemaining(keys::add);
        return keys;
    }

    private JsonNode parse(String json) {
        try {
            return json == null ? null : om.readTree(json);
        } catch (IOException e) {
            return null;
        }
    }

    private List<String> candidatesOf(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return om.readValue(json, new TypeReference<List<String>>() {
            });
        } catch (IOException e) {
            return List.of();
        }
    }
}
