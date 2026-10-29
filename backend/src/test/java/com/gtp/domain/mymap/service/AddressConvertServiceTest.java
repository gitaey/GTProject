package com.gtp.domain.mymap.service;

import com.gtp.domain.mymap.config.MyMapProperties;
import com.gtp.domain.mymap.dto.ConvertRequest;
import com.gtp.domain.mymap.dto.ConvertResult;
import com.gtp.domain.mymap.infra.FakePnuParcelProvider;
import com.gtp.domain.mymap.infra.InMemoryAddressRefReader;
import com.gtp.domain.mymap.infra.TableAddressResolver;
import com.gtp.domain.mymap.infra.AddressRefReader.BuildingKey;
import com.gtp.domain.mymap.infra.AddressRefReader.StandardParts;
import com.gtp.domain.mymap.port.AddressMatch;
import com.gtp.domain.mymap.port.AddressResolver;
import com.gtp.domain.mymap.port.PnuParcelProvider;
import com.gtp.domain.mymap.repository.UserMapRepository;
import com.gtp.domain.mymap.util.CoordinateTransformUtil;
import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.UUID;

import static com.gtp.domain.mymap.XlsxTestUtil.row;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

/** 주소 변환(엑셀로만 받기): 열 구성·값·수식 방지·한도·임시 파일 삭제·색인 유무. DB 없이 메모리 주소 자료와 가짜 필지로 돈다. */
class AddressConvertServiceTest {

    static final String ALICE = "alice";
    static final String PNU_87 = "1121510300100160026";   // 구의동 16-26 (영화사로 87)
    static final String PNU_87_1 = "1121510300100160027";  // 구의동 16-27 (영화사로 87-1, 공동주택 "주택")
    static final String PNU_WANGSAN = "1123010400106200067";   // 전농동 620-67 (왕산로 지하 205)

    @TempDir
    Path dir;
    MyMapProperties props;
    PendingUploadRegistry registry;
    ImportGuard guard;
    InMemoryAddressRefReader reader;
    FakePnuParcelProvider parcels;
    AddressResolver resolver;
    AddressConvertService service;

    @BeforeEach
    void setUp() {
        props = new MyMapProperties();
        props.setUploadDir(dir.resolve("up").toString());
        registry = new PendingUploadRegistry(props, new PendingUploadRegistryTest.TestClock());
        guard = new ImportGuard();
        reader = new InMemoryAddressRefReader("2026-09");
        reader.legalDong("1121510300", "서울특별시", "광진구", "구의동", "");
        reader.road("112153104008", "서울특별시", "광진구", "영화사로", true)
                .building("112153104008", false, 87, 0, "1121510300", false, 16, 26, "서울특별시", "광진구", "구의동", "", "영화사로")
                .building("112153104008", false, 87, 1, "1121510300", false, 16, 27, "서울특별시", "광진구", "구의동", "", "영화사로");
        reader.standard(new BuildingKey("112153104008", "0", 87, 1),
                new StandardParts("서울특별시", "광진구", "구의동", "", "영화사로", "0", 87, 1, true, "주택", "1"));
        reader.legalDong("1123010400", "서울특별시", "동대문구", "전농동", "");
        reader.road("112303105008", "서울특별시", "동대문구", "왕산로", true)
                .building("112303105008", true, 205, 0, "1123010400", false, 620, 67, "서울특별시", "동대문구", "전농동", "", "왕산로");
        parcels = new FakePnuParcelProvider("2026-10")
                .addSquare(PNU_87, "16-26", 127.0830, 37.5400, 0.0002)
                .addSquare(PNU_87_1, "16-27", 127.0840, 37.5410, 0.0002)
                .addSquare(PNU_WANGSAN, "620-67", 127.0480, 37.5800, 0.0002);
        resolver = new TableAddressResolver(reader, 5);
        service = new AddressConvertService(registry, resolver, parcels, guard, props);
    }

    // ---------- 도우미 ----------

    private Path pendingFile;
    private String uploadId;

    /** 엑셀을 만들고 미리보기를 거친 것처럼 등록한다. 첫 열은 이름, 둘째 열은 주소 */
    private String register(String owner, List<List<Object>> rows) {
        uploadId = UUID.randomUUID().toString();
        pendingFile = com.gtp.domain.mymap.XlsxTestUtil.write(dir.resolve(uploadId + ".xlsx"), rows);
        List<String> headers = rows.get(0).stream().map(String::valueOf).toList();
        registry.register(new PendingUploadRegistry.Pending(uploadId, owner, pendingFile, registry.newExpiry(), headers, rows.size() - 1, "hash"));
        return uploadId;
    }

    private static ConvertRequest request(String uploadId, String column, boolean pnu, boolean road, boolean jibun, boolean lonLat,
                                          boolean area, Integer srid) {
        ConvertRequest r = new ConvertRequest();
        r.setUploadId(uploadId);
        r.setAddressColumn(column);
        ConvertRequest.Include inc = new ConvertRequest.Include();
        inc.setPnu(pnu);
        inc.setRoadAddress(road);
        inc.setJibunAddress(jibun);
        inc.setLonLat(lonLat);
        inc.setArea(area);
        r.setInclude(inc);
        r.setSrid(srid);
        return r;
    }

    private static ConvertRequest all(String uploadId, Integer srid) {
        return request(uploadId, "주소", true, true, true, true, false, srid);
    }

    private List<List<Object>> mixedRows() {
        return List.of(
                row("이름", "주소"),
                row("a", "서울특별시 광진구 영화사로 87"),                 // 도로명 성공
                row("b", "서울특별시 광진구 영화사로 87-1"),               // 공동주택 건물명
                row("c", "서울특별시 광진구 구의동 16-26"),                // 지번 성공(색인 있음 → 도로명주소도)
                row("d", "서울특별시 동대문구 왕산로 지하 205"),            // 지하
                row("e", "어디쯤"),                                      // 형식 오류
                row("f", ""),                                           // 빈 주소
                row("=1+1", "서울특별시 광진구 구의동 999"),               // 필지 없음 + 수식처럼 보이는 원본 값
                row("g", "서울특별시 광진구 영화사로 999"));               // 건물번호 없음
    }

    private static XSSFWorkbook open(ConvertResult r) throws IOException {
        return new XSSFWorkbook(new ByteArrayInputStream(Base64.getDecoder().decode(r.getFileBase64())));
    }

    private static String str(Row row, int col) {
        Cell c = row.getCell(col);
        if (c == null) return "";
        return switch (c.getCellType()) {
            case NUMERIC -> String.valueOf(c.getNumericCellValue());
            default -> c.getStringCellValue();
        };
    }

    private static CustomException caught(Runnable r) {
        try {
            r.run();
        } catch (CustomException e) {
            return e;
        }
        throw new AssertionError("CustomException이 나야 합니다");
    }

    // ---------- 성공·실패 혼합, 열 구성 ----------

    @Test
    void 성공_실패_혼합_열_구성과_값() throws Exception {
        ConvertResult res = service.convert(all(register(ALICE, mixedRows()), 4326), ALICE);

        assertThat(res.getTotal()).isEqualTo(8);
        assertThat(res.getMatched()).isEqualTo(4);
        assertThat(res.getFailed()).isEqualTo(4);
        assertThat(res.getFileName()).matches("주소변환_결과_\\d{8}\\.xlsx");
        assertThat(res.getPreview().getColumns()).containsExactly("이름", "주소", "매칭상태", "PNU", "법정동코드", "표준_도로명주소",
                "표준_지번주소", "경도", "위도", "실패사유/후보");
        assertThat(res.getPreview().getRows()).hasSize(5);   // 앞 5행
        List<String> first = res.getPreview().getRows().get(0);
        assertThat(first).containsExactly("a", "서울특별시 광진구 영화사로 87", "성공", PNU_87, "1121510300",
                "서울특별시 광진구 영화사로 87 (구의동)", "서울특별시 광진구 구의동 16-26", "127.0830000", "37.5400000", "");

        try (XSSFWorkbook wb = open(res)) {
            assertThat(wb.getSheetName(0)).isEqualTo("결과");
            assertThat(wb.getSheetName(1)).isEqualTo("열설명");
            Sheet s = wb.getSheet("결과");
            assertThat(s.getLastRowNum()).isEqualTo(8);   // 머리글 + 8행 — 실패 행도 지우지 않는다
            // 머리글 굵게·첫 행 고정
            assertThat(wb.getFontAt(s.getRow(0).getCell(0).getCellStyle().getFontIndex()).getBold()).isTrue();
            assertThat(s.getPaneInformation()).isNotNull();
            assertThat(s.getPaneInformation().getHorizontalSplitPosition()).isEqualTo((short) 1);

            assertThat(str(s.getRow(2), 5)).isEqualTo("서울특별시 광진구 영화사로 87-1 (구의동, 주택)");
            assertThat(str(s.getRow(3), 5)).as("지번 입력 행 — 색인이 있으면 건물정보에서 도로명주소").isEqualTo("서울특별시 광진구 영화사로 87 (구의동)");
            assertThat(str(s.getRow(4), 5)).isEqualTo("서울특별시 동대문구 왕산로 지하205 (전농동)");
            // 경도·위도는 숫자 셀
            assertThat(s.getRow(1).getCell(7).getCellType().name()).isEqualTo("NUMERIC");
            assertThat(s.getRow(1).getCell(7).getNumericCellValue()).isCloseTo(127.083, within(1e-9));

            // 실패 행: 사유 라벨(+후보), PNU 등은 빈 칸. 형식 오류·빈 값·건물번호 없음
            assertThat(str(s.getRow(5), 2)).isEqualTo("실패");
            assertThat(str(s.getRow(5), 9)).isEqualTo("주소 형식을 알 수 없습니다");
            assertThat(str(s.getRow(5), 3)).isEmpty();
            assertThat(str(s.getRow(6), 9)).isEqualTo("값이 비어 있습니다");
            assertThat(str(s.getRow(8), 9)).isEqualTo("건물번호를 찾지 못했습니다");
            // 지적도에 없는 필지: PNU·표준 지번주소는 보여 주되 실패로 센다, 좌표는 빈 칸
            assertThat(str(s.getRow(7), 2)).isEqualTo("실패");
            assertThat(str(s.getRow(7), 3)).isEqualTo("1121510300109990000");
            assertThat(str(s.getRow(7), 6)).isEqualTo("서울특별시 광진구 구의동 999");
            assertThat(str(s.getRow(7), 7)).isEmpty();
            assertThat(str(s.getRow(7), 9)).startsWith("지적도에 없는 필지입니다");

            // 수식 주입 방지: 값은 그대로, 텍스트 서식 + 인용 접두
            Cell evil = s.getRow(7).getCell(0);
            assertThat(evil.getStringCellValue()).isEqualTo("=1+1");
            assertThat(evil.getCellType().name()).isEqualTo("STRING");
            assertThat(evil.getCellStyle().getQuotePrefixed()).isTrue();
            assertThat(s.getRow(1).getCell(0).getCellStyle().getQuotePrefixed()).as("보통 글자는 그대로").isFalse();
        }
    }

    @Test
    void 열설명_시트에_붙은_열의_뜻과_기준월_좌표계() throws Exception {
        ConvertResult res = service.convert(request(register(ALICE, mixedRows()), "주소", true, true, true, true, true, 5186), ALICE);
        try (XSSFWorkbook wb = open(res)) {
            Sheet d = wb.getSheet("열설명");
            List<String> col0 = new ArrayList<>(), col1 = new ArrayList<>();
            for (int i = 0; i <= d.getLastRowNum(); i++) {
                col0.add(str(d.getRow(i), 0));
                col1.add(str(d.getRow(i), 1));
            }
            assertThat(col0).contains("열", "매칭상태", "PNU", "법정동코드", "표준_도로명주소", "표준_지번주소", "X좌표", "Y좌표", "필지면적_㎡",
                    "실패사유/후보", "지적도 기준월", "건물DB 기준월", "좌표계", "처리 결과");
            assertThat(col1.get(col0.indexOf("지적도 기준월"))).isEqualTo("2026-10");
            assertThat(col1.get(col0.indexOf("건물DB 기준월"))).isEqualTo("2026-09");
            assertThat(col1.get(col0.indexOf("좌표계"))).contains("EPSG:5186").contains("m");
            assertThat(col1.get(col0.indexOf("처리 결과"))).isEqualTo("전체 8행 · 성공 4 · 실패 4");
            assertThat(col1.get(col0.indexOf("참고: 필지면적"))).isEqualTo("필지면적_㎡는 지구 표면 기준 계산값이라 토지대장 면적과 다를 수 있습니다");
            assertThat(col1.get(col0.indexOf("참고: 지적도에 없는 필지"))).isEqualTo("지적도에 없는 필지는 실패로 세지만 PNU·표준 주소는 채워질 수 있습니다");
            assertThat(col1.get(col0.indexOf("표준_도로명주소"))).contains("지번 입력 행은 건물정보에서 찾은 경우만 채웁니다");
        }
    }

    // ---------- include 조합 ----------

    @Test
    void include_조합에_따라_열이_붙는다() {
        String id = register(ALICE, mixedRows());
        ConvertResult onlyPnu = service.convert(request(id, "주소", true, false, false, false, false, 4326), ALICE);
        assertThat(onlyPnu.getPreview().getColumns()).containsExactly("이름", "주소", "매칭상태", "PNU", "법정동코드", "실패사유/후보");

        // 변환이 끝나면 임시 파일이 지워지므로 다시 등록한다
        ConvertResult none = service.convert(request(register(ALICE, mixedRows()), "주소", false, false, false, false, false, 4326), ALICE);
        assertThat(none.getPreview().getColumns()).containsExactly("이름", "주소", "매칭상태", "실패사유/후보");
        assertThat(none.getMatched()).as("열 선택과 관계없이 같은 판정").isEqualTo(4);

        ConvertResult areaOnly = service.convert(request(register(ALICE, mixedRows()), "주소", false, false, false, false, true, 4326), ALICE);
        assertThat(areaOnly.getPreview().getColumns()).containsExactly("이름", "주소", "매칭상태", "필지면적_㎡", "실패사유/후보");
        assertThat(Double.parseDouble(areaOnly.getPreview().getRows().get(0).get(3))).isBetween(500.0, 3000.0);
    }

    @Test
    void 면적은_꺼져_있으면_열이_없다() {
        ConvertResult res = service.convert(all(register(ALICE, mixedRows()), null), ALICE);   // srid 생략 → 4326
        assertThat(res.getPreview().getColumns()).doesNotContain("필지면적_㎡").contains("경도", "위도");
    }

    @Test
    void include가_없으면_기본값_면적만_끈다() {
        ConvertRequest r = new ConvertRequest();
        r.setUploadId(register(ALICE, mixedRows()));
        r.setAddressColumn("주소");
        ConvertResult res = service.convert(r, ALICE);
        assertThat(res.getPreview().getColumns()).containsExactly("이름", "주소", "매칭상태", "PNU", "법정동코드", "표준_도로명주소", "표준_지번주소",
                "경도", "위도", "실패사유/후보");
    }

    // ---------- 좌표계 ----------

    @Test
    void 좌표계_네_가지의_열_이름과_값() throws Exception {
        for (int srid : new int[]{4326, 5186, 5179, 3857}) {
            ConvertResult res = service.convert(all(register(ALICE, mixedRows()), srid), ALICE);
            List<String> cols = res.getPreview().getColumns();
            if (srid == 4326) assertThat(cols).contains("경도", "위도").doesNotContain("X좌표");
            else assertThat(cols).contains("X좌표", "Y좌표").doesNotContain("경도");

            List<String> first = res.getPreview().getRows().get(0);
            double x = Double.parseDouble(first.get(cols.indexOf(srid == 4326 ? "경도" : "X좌표")));
            double y = Double.parseDouble(first.get(cols.indexOf(srid == 4326 ? "위도" : "Y좌표")));
            double[] expected = CoordinateTransformUtil.buildFromWgs84("EPSG:" + srid).toXy(127.0830, 37.5400);
            double tol = srid == 4326 ? 1e-7 : 0.01;
            assertThat(x).as(srid + " x").isCloseTo(expected[0], within(tol));
            assertThat(y).as(srid + " y").isCloseTo(expected[1], within(tol));
        }
    }

    @Test
    void 허용하지_않는_좌표계는_400이고_파일은_남는다() {
        String id = register(ALICE, mixedRows());
        for (int bad : new int[]{5185, 0, -1, 2097}) {
            CustomException e = caught(() -> service.convert(all(id, bad), ALICE));
            assertThat(e.getErrorCode()).isEqualTo(GisErrorCode.MYMAP_SRID_UNSUPPORTED);
        }
        assertThat(pendingFile).exists();
        assertThat(registry.find(id, ALICE)).isPresent();
    }

    // ---------- 오류 ----------

    @Test
    void 잘못된_주소_컬럼은_400이고_파일은_남는다() {
        String id = register(ALICE, mixedRows());
        for (String col : new String[]{"없는열", "", null}) {
            CustomException e = caught(() -> service.convert(request(id, col, true, true, true, true, false, 4326), ALICE));
            assertThat(e.getErrorCode()).isEqualTo(GisErrorCode.MYMAP_COLUMN_REQUIRED);
        }
        assertThat(pendingFile).exists();
    }

    @Test
    void 없는_업로드와_남의_업로드는_같은_404() {
        register(ALICE, mixedRows());
        CustomException none = caught(() -> service.convert(all("no-such-id", 4326), ALICE));
        CustomException others = caught(() -> service.convert(all(uploadId, 4326), "bob"));
        CustomException nullReq = caught(() -> service.convert(new ConvertRequest(), ALICE));
        for (CustomException e : List.of(none, others, nullReq)) assertThat(e.getErrorCode()).isEqualTo(GisErrorCode.EXCEL_UPLOAD_NOT_FOUND);
        assertThat(pendingFile).as("남의 요청으로는 지워지지 않는다").exists();
    }

    @Test
    void 행_수_한도_5000행() throws Exception {
        // 미리보기가 센 행 수가 한도 초과 → 400
        List<List<Object>> rows = new ArrayList<>(List.of(row("주소")));
        for (int i = 0; i < 3; i++) rows.add(row("서울특별시 광진구 영화사로 87"));
        String id = register(ALICE, rows);
        registry.forget(id);
        registry.register(new PendingUploadRegistry.Pending(id, ALICE, pendingFile, registry.newExpiry(), List.of("주소"), 5001, "h"));
        assertThat(caught(() -> service.convert(request(id, "주소", true, true, true, true, false, 4326), ALICE)).getErrorCode())
                .isEqualTo(GisErrorCode.MYMAP_ROW_LIMIT);

        // 5,000행은 통과
        List<List<Object>> max = new ArrayList<>(List.of(row("주소")));
        for (int i = 0; i < 5000; i++) max.add(row(i % 2 == 0 ? "서울특별시 광진구 영화사로 87" : "서울특별시 광진구 구의동 16-" + (26 + i % 3)));
        ConvertResult ok = service.convert(request(register(ALICE, max), "주소", true, true, true, true, true, 4326), ALICE);
        assertThat(ok.getTotal()).isEqualTo(5000);
        try (XSSFWorkbook wb = open(ok)) {
            assertThat(wb.getSheet("결과").getLastRowNum()).isEqualTo(5000);
        }

        // 미리보기 값이 거짓이어도 읽는 도중 한도를 넘으면 거절(파일을 믿지 않는다)
        List<List<Object>> over = new ArrayList<>(List.of(row("주소")));
        for (int i = 0; i < 5001; i++) over.add(row("서울특별시 광진구 영화사로 87"));
        String id2 = register(ALICE, over);
        registry.forget(id2);
        registry.register(new PendingUploadRegistry.Pending(id2, ALICE, pendingFile, registry.newExpiry(), List.of("주소"), 3, "h"));
        assertThat(caught(() -> service.convert(request(id2, "주소", true, true, true, true, false, 4326), ALICE)).getErrorCode())
                .isEqualTo(GisErrorCode.MYMAP_ROW_LIMIT);
        assertThat(pendingFile).as("변환 도중 실패 — 파일을 남겨 다시 시도할 수 있게 한다(만료 정리가 지운다)").exists();
        assertThat(registry.find(id2, ALICE)).isPresent();
    }

    // ---------- 레이어·임시 파일 ----------

    @Test
    void 지도_레이어를_만들지_않는다_저장소를_쓰지_않는다() {
        // 구조 확인: 이 서비스는 레이어 저장소(UserMapRepository)에 닿을 길이 없다 — UserMap 행이 생기지 않는다
        for (var c : AddressConvertService.class.getDeclaredConstructors()) {
            assertThat(Arrays.asList(c.getParameterTypes())).doesNotContain(UserMapRepository.class);
        }
        for (var f : AddressConvertService.class.getDeclaredFields()) {
            assertThat(f.getType().getSimpleName()).doesNotContain("Repository").doesNotContain("JdbcTemplate");
        }
    }

    @Test
    void 성공하면_임시_파일과_등록이_지워지고_자물쇠가_풀리고_같은_uploadId는_다시_쓸_수_없다() {
        String id = register(ALICE, mixedRows());
        assertThat(pendingFile).exists();
        service.convert(all(id, 4326), ALICE);
        assertThat(pendingFile).doesNotExist();
        assertThat(registry.find(id, ALICE)).isEmpty();
        assertThat(guard.isActive(ALICE)).isFalse();
        assertThat(caught(() -> service.convert(all(id, 4326), ALICE)).getErrorCode()).isEqualTo(GisErrorCode.EXCEL_UPLOAD_NOT_FOUND);
    }

    @Test
    void 변환_중_실패하면_임시_파일을_남기고_자물쇠는_풀고_같은_uploadId로_다시_성공한다() {
        AddressResolver boom = new AddressResolver() {
            @Override
            public boolean supported() {
                return true;
            }

            @Override
            public List<AddressMatch> resolve(List<String> raw) {
                throw new IllegalStateException("boom");
            }
        };
        AddressConvertService failing = new AddressConvertService(registry, boom, parcels, guard, props);
        String id = register(ALICE, mixedRows());
        assertThatThrownBy(() -> failing.convert(all(id, 4326), ALICE)).isInstanceOf(IllegalStateException.class);
        assertThat(pendingFile).as("실패 — 지우지 않는다").exists();
        assertThat(registry.find(id, ALICE)).isPresent();
        assertThat(guard.isActive(ALICE)).as("자물쇠는 어느 경로에서도 돌려준다").isFalse();
        // 같은 uploadId로 정상 서비스가 다시 처리하면 성공하고 그제서야 파일이 지워진다
        assertThat(service.convert(all(id, 4326), ALICE).getTotal()).isEqualTo(8);
        assertThat(pendingFile).doesNotExist();
        assertThat(registry.find(id, ALICE)).isEmpty();
    }

    @Test
    void 필지_공급자가_대표점을_지원하지_않으면_400_파일은_남는다() {
        PnuParcelProvider noPoints = new PnuParcelProvider() {
            @Override
            public java.util.Map<String, com.gtp.domain.mymap.port.ParcelShape> findByPnus(java.util.Collection<String> pnus) {
                return java.util.Map.of();
            }

            @Override
            public com.gtp.domain.mymap.port.Coverage coverage() {
                return parcels.coverage();
            }
        };
        AddressConvertService s = new AddressConvertService(registry, resolver, noPoints, guard, props);
        String id = register(ALICE, mixedRows());
        assertThat(caught(() -> s.convert(all(id, 4326), ALICE)).getErrorCode()).isEqualTo(GisErrorCode.MYMAP_MODE_UNSUPPORTED);
        assertThat(pendingFile).exists();
        assertThat(guard.isActive(ALICE)).isFalse();
    }

    @Test
    void 결과가_너무_크면_413_문구와_함께_파일은_남는다() {
        props.getLimits().setMaxConvertResultMb(0);
        String id = register(ALICE, mixedRows());
        CustomException e = caught(() -> service.convert(all(id, 4326), ALICE));
        assertThat(e.getErrorCode()).isEqualTo(GisErrorCode.MYMAP_FILE_TOO_LARGE);
        assertThat(e.getMessage()).isEqualTo("변환 결과가 너무 큽니다(최대 0MB). 행을 나눠 올려 주세요");
        assertThat(pendingFile).exists();
        assertThat(guard.isActive(ALICE)).isFalse();
    }

    @Test
    void 사용자의_다른_작업이_돌고_있으면_429이고_파일은_남는다() {
        String id = register(ALICE, mixedRows());
        assertThat(guard.tryAcquire(ALICE)).isTrue();
        CustomException e = caught(() -> service.convert(all(id, 4326), ALICE));
        assertThat(e.getErrorCode()).isEqualTo(GisErrorCode.MYMAP_IMPORT_BUSY);
        assertThat(pendingFile).exists();
        assertThat(guard.isActive(ALICE)).as("남의 자물쇠를 풀지 않는다").isTrue();
    }

    @Test
    void 주소_자료가_준비되지_않았으면_503_파일은_남는다() {
        String id = register(ALICE, mixedRows());
        reader.setReadyVersion(null);
        assertThat(caught(() -> service.convert(all(id, 4326), ALICE)).getErrorCode()).isEqualTo(GisErrorCode.MYMAP_REF_UNAVAILABLE);
        assertThat(pendingFile).exists();
    }

    // ---------- 색인 유무 ----------

    @Test
    void 지번_색인이_없으면_지번_입력_행의_도로명주소는_빈_칸이고_도로명_입력_행은_그대로() throws Exception {
        reader.jibunReady(false);
        reader.standardByJibunCalls = 0;
        ConvertResult res = service.convert(all(register(ALICE, mixedRows()), 4326), ALICE);
        try (XSSFWorkbook wb = open(res)) {
            Sheet s = wb.getSheet("결과");
            assertThat(str(s.getRow(1), 5)).as("도로명 입력 행").isEqualTo("서울특별시 광진구 영화사로 87 (구의동)");
            assertThat(str(s.getRow(3), 5)).as("지번 입력 행 — 색인 없음").isEmpty();
            assertThat(str(s.getRow(3), 6)).as("지번주소는 그대로").isEqualTo("서울특별시 광진구 구의동 16-26");
            assertThat(str(s.getRow(3), 2)).as("행 자체는 성공").isEqualTo("성공");
            // 열설명 문구는 색인 유무와 관계없이 같다("색인 없음" 이야기를 하지 않는다)
            Sheet d = wb.getSheet("열설명");
            String all = "";
            for (int i = 0; i <= d.getLastRowNum(); i++) all += str(d.getRow(i), 1) + "\n";
            assertThat(all).contains("지번 입력 행은 건물정보에서 찾은 경우만 채웁니다").doesNotContain("색인");
        }
        assertThat(reader.standardByJibunCalls).as("색인 없을 때 지번 → 건물 조회 0회").isZero();
    }

    // ---------- 열 이름 겹침 ----------

    @Test
    void 원본에_같은_이름_열이_있으면_이름_뒤에_번호를_붙인다() {
        List<List<Object>> rows = List.of(row("PNU", "주소", "매칭상태"), row("x", "서울특별시 광진구 영화사로 87", "y"));
        ConvertResult res = service.convert(all(register(ALICE, rows), 4326), ALICE);
        assertThat(res.getPreview().getColumns()).containsExactly("PNU", "주소", "매칭상태", "매칭상태 (2)", "PNU (2)", "법정동코드",
                "표준_도로명주소", "표준_지번주소", "경도", "위도", "실패사유/후보");
        assertThat(res.getPreview().getRows().get(0).get(0)).isEqualTo("x");
    }

    @Test
    void 같은_주소가_여러_행이어도_모두_채운다() {
        List<List<Object>> rows = List.of(row("주소"), row("서울특별시 광진구 영화사로 87"), row("서울특별시 광진구 영화사로 87"), row("서울특별시 광진구 영화사로 87"));
        ConvertResult res = service.convert(all(register(ALICE, rows), 4326), ALICE);
        assertThat(res.getMatched()).isEqualTo(3);
        assertThat(res.getPreview().getRows()).allSatisfy(r -> assertThat(r.get(1)).isEqualTo("성공"));
    }
}
