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

    @Test
    void 필지_건물_엔드포인트는_api_mymap_아래에_계약대로_있다() {
        // /api/mymap/ref/** 는 /api/mymap/** authenticated 규칙 안(SecurityConfig 변경 없음) — 이 밖으로 나가면 permitAll로 열린다
        assertThat(com.gtp.domain.mymap.controller.ParcelRefController.class.getAnnotation(RequestMapping.class).value())
                .containsExactly("/api/mymap/ref");
        boolean found = false;
        boolean foundPnuAddresses = false;
        for (Method m : com.gtp.domain.mymap.controller.ParcelRefController.class.getDeclaredMethods()) {
            for (String p : pathsOf(m)) {
                assertThat(p).as(m.getName()).doesNotStartWith("/api");
                if (m.getName().equals("buildings") && p.equals("/parcels/{pnu}/buildings") && verbOf(m).equals("GET")) found = true;
                if (m.getName().equals("pnuAddresses") && p.equals("/pnu-addresses") && verbOf(m).equals("POST")) foundPnuAddresses = true;
            }
        }
        assertThat(found).as("GET /api/mymap/ref/parcels/{pnu}/buildings").isTrue();
        assertThat(foundPnuAddresses).as("POST /api/mymap/ref/pnu-addresses (U26)").isTrue();
    }

    @Test
    void 참조_상태와_시작_화면_엔드포인트는_api_mymap_아래에_계약대로_있고_앞선_규칙에_가려지지_않는다() throws Exception {
        // U27 GET /api/mymap/ref/status
        boolean status = false;
        for (Method m : com.gtp.domain.mymap.controller.ParcelRefController.class.getDeclaredMethods()) {
            if (m.getName().equals("status") && pathsOf(m).contains("/status") && verbOf(m).equals("GET")) status = true;
        }
        assertThat(status).as("GET /api/mymap/ref/status (U27)").isTrue();

        // U28~U30 /api/mymap/start-view — 클래스 매핑이 /api/mymap/start-view이고 메서드는 경로 없이 GET·PUT·DELETE 하나씩
        Class<?> c = com.gtp.domain.mymap.controller.StartViewController.class;
        assertThat(c.getAnnotation(RequestMapping.class).value()).containsExactly("/api/mymap/start-view");
        Map<String, String> verbToMethod = new java.util.HashMap<>();
        for (Method m : c.getDeclaredMethods()) {
            String verb = verbOf(m);
            if (verb.isEmpty()) continue;
            assertThat(pathsOf(m)).as(m.getName()).isEmpty();                    // 메서드에 따로 경로를 붙여 밖으로 나가지 않는다
            assertThat(verbToMethod.put(verb, m.getName())).as(verb + " 중복").isNull();
        }
        assertThat(verbToMethod).containsOnly(Map.entry("GET", "get"), Map.entry("PUT", "put"), Map.entry("DELETE", "delete"));

        // SecurityConfig: /api/mymap/** authenticated 규칙이 anyRequest().permitAll()보다 앞이고, 그보다 앞에 /api/mymap/start-view를
        // 먼저 가로채는 넓은 규칙(/api/**·/**)이나 permitAll이 없다 — 이 컨트롤러 때문에 SecurityConfig를 바꿀 필요가 없다는 전제
        List<String> lines = Files.readAllLines(SECURITY);
        int mymap = -1, any = -1;
        for (int i = 0; i < lines.size(); i++) {
            String l = lines.get(i);
            if (l.contains("\"/api/mymap/**\"") && l.contains(".authenticated()") && !l.contains("HttpMethod")) mymap = i;
            if (l.contains("anyRequest().permitAll()")) any = i;
        }
        assertThat(mymap).as("/api/mymap/** authenticated 규칙").isGreaterThanOrEqualTo(0);
        assertThat(mymap).isLessThan(any);
        for (int i = 0; i < mymap; i++) {
            String l = lines.get(i);
            if (!l.contains("requestMatchers")) continue;
            assertThat(l).as("앞선 규칙이 /api/mymap/start-view를 가로채지 않는다: " + l)
                    .doesNotContain("\"/api/**\"").doesNotContain("\"/**\"").doesNotContain("\"/api/mymap/start-view");
        }
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
