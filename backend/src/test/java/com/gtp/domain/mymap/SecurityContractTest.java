package com.gtp.domain.mymap;

import com.gtp.domain.mymap.controller.UserMapAdminController;
import com.gtp.domain.mymap.controller.UserMapController;
import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.*;

import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * SecurityConfig의 마지막 규칙은 anyRequest().permitAll()이라 새 경로가 /api/mymap/** 밖에 생기면 로그인 없이 열린다.
 * 새 API를 이 아래에만 두는지, 그리고 그 아래가 authenticated()인지 소스로 확인한다.
 */
class SecurityContractTest {

    static final Path SECURITY = Path.of("src/main/java/com/gtp/global/config/SecurityConfig.java");

    @Test
    void mymap_경로는_authenticated이고_관리자_경로는_SUPER_ADMIN() throws Exception {
        List<String> lines = Files.readAllLines(SECURITY);
        assertThat(lines).anyMatch(l -> l.contains("\"/api/mymap/**\"") && l.contains(".authenticated()") && !l.contains("HttpMethod"));
        assertThat(lines).anyMatch(l -> l.contains("\"/api/admin/mymap/**\"") && l.contains("hasRole(\"SUPER_ADMIN\")"));
        // 마지막 규칙이 permitAll이라는 전제(이 전제가 바뀌면 이 시험도 다시 봐야 한다)
        assertThat(lines).anyMatch(l -> l.contains("anyRequest().permitAll()"));
        // mymap 규칙에 permitAll이 섞이지 않았다
        assertThat(lines).noneMatch(l -> l.contains("/api/mymap") && l.contains("permitAll"));
    }

    @Test
    void 모든_엔드포인트는_api_mymap_아래에_있다() {
        assertThat(UserMapController.class.getAnnotation(RequestMapping.class).value()).containsExactly("/api/mymap");
        assertThat(UserMapAdminController.class.getAnnotation(RequestMapping.class).value()).containsExactly("/api/admin/mymap");

        for (Method m : UserMapController.class.getDeclaredMethods()) {
            for (String p : pathsOf(m)) {
                assertThat(p).as(m.getName()).doesNotStartWith("/api");   // 절대 경로로 /api/mymap 밖에 나가지 않는다
            }
        }
    }

    @Test
    void 새_엔드포인트가_설계_계약대로_있다() {
        Map<String, String> expected = Map.of(
                "GET /quota", "quota",
                "GET /samples/{kind}", "sample",
                "GET /{id}/import-report", "importReport",
                "GET /{id}/import-report.xlsx", "importReportXlsx",
                "POST /upload/excel/preview", "previewExcel",
                "POST /upload/excel/confirm", "confirmExcel",
                "GET /{id}/status", "status",
                "GET /{id}/columns", "columns",
                "PATCH /{id}", "update");
        expected = new java.util.HashMap<>(expected);
        expected.put("POST /upload/excel/convert", "convertExcel");   // 주소 변환(엑셀로만 받기)
        expected.put("GET /{id}/export", "export");                   // 레이어 내보내기
        for (Map.Entry<String, String> e : expected.entrySet()) {
            String[] parts = e.getKey().split(" ", 2);
            boolean found = false;
            for (Method m : UserMapController.class.getDeclaredMethods()) {
                if (!m.getName().equals(e.getValue())) continue;
                found = pathsOf(m).contains(parts[1]) && verbOf(m).equals(parts[0]);
                if (found) break;
            }
            assertThat(found).as(e.getKey()).isTrue();
        }
    }

    @Test
    void 공유_엔드포인트가_계약대로_있고_gis_경로는_permitAll보다_앞에서_authenticated() throws Exception {
        Map<String, String> expected = Map.of(
                "GET /{id}/share", "getShare",
                "PUT /{id}/share", "share",
                "GET /shares", "shares",
                "POST /shares/bulk", "bulkShare");
        for (Map.Entry<String, String> e : expected.entrySet()) {
            String[] parts = e.getKey().split(" ", 2);
            boolean found = false;
            for (Method m : UserMapController.class.getDeclaredMethods()) {
                if (!m.getName().equals(e.getValue())) continue;
                found = pathsOf(m).contains(parts[1]) && verbOf(m).equals(parts[0]);
                if (found) break;
            }
            assertThat(found).as(e.getKey()).isTrue();
        }

        // /api/gis/** 는 anyRequest().permitAll() 앞에서 authenticated() — 새 디렉터리 경로가 로그인 없이 열리지 않는다
        List<String> lines = Files.readAllLines(SECURITY);
        int gis = -1, any = -1;
        for (int i = 0; i < lines.size(); i++) {
            String l = lines.get(i);
            if (l.contains("\"/api/gis/**\"") && l.contains(".authenticated()") && !l.contains("HttpMethod")) gis = i;
            if (l.contains("anyRequest().permitAll()")) any = i;
        }
        assertThat(gis).as("/api/gis/** authenticated 규칙").isGreaterThanOrEqualTo(0);
        assertThat(gis).isLessThan(any);
        assertThat(lines).noneMatch(l -> l.contains("/api/gis") && l.contains("permitAll"));
        // 컨트롤러는 /api/gis/ 아래에만 있다
        assertThat(com.gtp.global.gis.share.GisShareDirectoryController.class.getAnnotation(RequestMapping.class).value())
                .containsExactly("/api/gis/share-directory");
    }

    private static List<String> pathsOf(Method m) {
        if (m.isAnnotationPresent(GetMapping.class)) return List.of(m.getAnnotation(GetMapping.class).value());
        if (m.isAnnotationPresent(PostMapping.class)) return List.of(m.getAnnotation(PostMapping.class).value());
        if (m.isAnnotationPresent(PatchMapping.class)) return List.of(m.getAnnotation(PatchMapping.class).value());
        if (m.isAnnotationPresent(PutMapping.class)) return List.of(m.getAnnotation(PutMapping.class).value());
        if (m.isAnnotationPresent(DeleteMapping.class)) return List.of(m.getAnnotation(DeleteMapping.class).value());
        return List.of();
    }

    private static String verbOf(Method m) {
        if (m.isAnnotationPresent(GetMapping.class)) return "GET";
        if (m.isAnnotationPresent(PostMapping.class)) return "POST";
        if (m.isAnnotationPresent(PatchMapping.class)) return "PATCH";
        if (m.isAnnotationPresent(PutMapping.class)) return "PUT";
        if (m.isAnnotationPresent(DeleteMapping.class)) return "DELETE";
        return "";
    }
}
