package com.gtp.domain.mymap.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gtp.domain.mymap.controller.ParcelRefController;
import com.gtp.domain.mymap.dto.ParcelBuildingsResponse;
import com.gtp.domain.mymap.dto.ParcelBuildingsResponse.AddressGroup;
import com.gtp.domain.mymap.infra.AddressRefReader.BuildingRow;
import com.gtp.domain.mymap.infra.AddressRefReader.JibunKey;
import com.gtp.domain.mymap.infra.InMemoryAddressRefReader;
import com.gtp.global.exception.CustomException;
import com.gtp.global.exception.GlobalExceptionHandler;
import com.gtp.global.gis.GisErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/** 필지 건물 목록(U25) — 가짜 리더로 PNU 검증·503·묶기·정렬·대표 이름·산·지하·truncated, 컨트롤러 응답 모양·헤더·오류 */
class ParcelBuildingServiceTest {

    static final String ADM = "3611011600";
    static final String PNU = ADM + "1" + "0708" + "0000";   // 대지 708
    static final JibunKey KEY = new JibunKey(ADM, "0", 708, 0);

    InMemoryAddressRefReader reader;
    ParcelBuildingService service;

    @BeforeEach
    void setUp() {
        reader = new InMemoryAddressRefReader("2026-09");
        service = new ParcelBuildingService(reader);
    }

    static BuildingRow row(String id, String road, String udgd, int main, int sub, String name, String detail, String sgg, boolean apt,
                           String relation) {
        return new BuildingRow(id, "세종특별자치시", "", "반곡동", "", road, "cd-" + road, udgd, main, sub, name, detail, sgg, apt,
                "30145", "1", relation);
    }

    static BuildingRow apt(String id, String detail) {
        return new BuildingRow(id, "세종특별자치시", "", "반곡동", "", "반곡로", "361102000010", "0", 51, 0, "건축물대장명", detail, "예시아파트", true,
                "30145", "1", "MAIN");
    }

    // ---------- 입력 검증 ----------

    @Test
    void PNU_형식_위반은_400() {
        for (String bad : new String[]{null, "", ADM + "1" + "0708000", ADM + "1" + "070800001", ADM + "3" + "07080000", ADM + "0" + "07080000",
                "36110116001070800a0", " " + PNU, PNU + " ", "36110116001070800000\n"}) {
            assertThatThrownBy(() -> service.buildings(bad, null)).as("[" + bad + "]").isInstanceOf(CustomException.class)
                    .satisfies(e -> assertThat(((CustomException) e).getErrorCode()).isEqualTo(GisErrorCode.PARCEL_QUERY_INVALID));
        }
        assertThat(reader.buildingsByJibunCalls).isZero();   // 형식이 틀리면 조회하지 않는다
    }

    @Test
    void limit_범위_위반은_400_경계값은_통과() {
        for (String bad : new String[]{"0", "-1", "1001", "abc", "1.5", "99999999999"}) {
            assertThatThrownBy(() -> service.buildings(PNU, bad)).as(bad).isInstanceOf(CustomException.class)
                    .satisfies(e -> assertThat(((CustomException) e).getErrorCode()).isEqualTo(GisErrorCode.PARCEL_QUERY_INVALID));
        }
        service.buildings(PNU, "1");
        assertThat(reader.lastLimit).isEqualTo(1);
        service.buildings(PNU, "1000");
        assertThat(reader.lastLimit).isEqualTo(1000);
        service.buildings(PNU, null);
        assertThat(reader.lastLimit).isEqualTo(200);
        service.buildings(PNU, "  ");
        assertThat(reader.lastLimit).isEqualTo(200);
    }

    @Test
    void 지번_색인이_없거나_적재_교체_중이면_503이고_조회하지_않는다() {
        reader.jibunReady(false);
        assertThatThrownBy(() -> service.buildings(PNU, null)).isInstanceOf(CustomException.class)
                .satisfies(e -> assertThat(((CustomException) e).getErrorCode()).isEqualTo(GisErrorCode.PARCEL_BUILDINGS_UNAVAILABLE));
        reader.jibunReady(true);
        reader.setReadyVersion(null);
        assertThatThrownBy(() -> service.buildings(PNU, null)).isInstanceOf(CustomException.class)
                .satisfies(e -> assertThat(((CustomException) e).getErrorCode()).isEqualTo(GisErrorCode.PARCEL_BUILDINGS_UNAVAILABLE));
        assertThat(reader.buildingsByJibunCalls).isZero();
        assertThat(GisErrorCode.PARCEL_BUILDINGS_UNAVAILABLE.getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(GisErrorCode.PARCEL_QUERY_INVALID.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    // ---------- 키 변환 ----------

    @Test
    void PNU에서_지번_키를_만든다_대지_산_본번_부번() {
        reader.parcelBuilding(new JibunKey(ADM, "0", 708, 5), row("A", "반곡로", "0", 51, 0, "건물", null, null, false, "MAIN"));
        reader.parcelBuilding(new JibunKey(ADM, "1", 12, 3), row("S", "산길", "0", 7, 0, "산건물", null, null, false, "MAIN"));

        assertThat(service.buildings(ADM + "1" + "0708" + "0005", null).getAddresses()).hasSize(1);            // 대지, 부번 5
        assertThat(service.buildings(ADM + "1" + "0708" + "0000", null).getBuildingCount()).isZero();          // 부번이 달라 없음
        ParcelBuildingsResponse san = service.buildings(ADM + "2" + "0012" + "0003", null);                     // 산 12-3
        assertThat(san.getBuildingCount()).isEqualTo(1);
        assertThat(san.getAddresses().get(0).getBuildings().get(0).getId()).isEqualTo("S");
        assertThat(service.buildings(ADM + "1" + "0012" + "0003", null).getBuildingCount()).isZero();         // 대지 12-3은 없음
    }

    // ---------- 응답 모양 ----------

    @Test
    void 건물_0건은_200_빈_목록() {
        ParcelBuildingsResponse r = service.buildings(PNU, null);
        assertThat(r.getPnu()).isEqualTo(PNU);
        assertThat(r.getReferenceVersion()).isEqualTo("2026-09");
        assertThat(r.getBuildingCount()).isZero();
        assertThat(r.isTruncated()).isFalse();
        assertThat(r.isRelatedIncluded()).isFalse();
        assertThat(r.getAddresses()).isEmpty();
    }

    @Test
    void 한_주소_여러_동은_묶고_동_이름은_자연_정렬() {
        for (String d : new String[]{"10동", "2동", "101동", "1동", "20동"}) reader.parcelBuilding(KEY, apt("ID-" + d, d));
        ParcelBuildingsResponse r = service.buildings(PNU, null);
        assertThat(r.getAddresses()).hasSize(1);
        AddressGroup g = r.getAddresses().get(0);
        assertThat(g.getBuildings()).extracting(b -> b.getDetailName()).containsExactly("1동", "2동", "10동", "20동", "101동");
        assertThat(g.getRoadAddress()).isEqualTo("세종특별자치시 반곡로 51 (반곡동, 예시아파트)");
        assertThat(g.isApartment()).isTrue();
        assertThat(g.getName()).isEqualTo("예시아파트");        // 공동주택이면 시군구용 건물명
        assertThat(g.getZipCode()).isEqualTo("30145");
        assertThat(g.getRelation()).isEqualTo("MAIN");
        assertThat(g.isUnderground()).isFalse();
        assertThat(r.getBuildingCount()).isEqualTo(5);
    }

    @Test
    void 같은_상세건물명은_건물관리번호_순() {
        reader.parcelBuilding(KEY, apt("Z", "1동"));
        reader.parcelBuilding(KEY, apt("A", "1동"));
        assertThat(service.buildings(PNU, null).getAddresses().get(0).getBuildings()).extracting(b -> b.getId()).containsExactly("A", "Z");
    }

    @Test
    void 대표_이름_규칙_공동주택은_시군구용_아니면_건축물대장_둘_다_비면_null() {
        reader.parcelBuilding(KEY, new BuildingRow("1", "세종특별자치시", "", "반곡동", "", "가길", "361102000001", "0", 1, 0, "대장명", null, "시군구명", true, "", "1", "MAIN"));
        reader.parcelBuilding(KEY, new BuildingRow("2", "세종특별자치시", "", "반곡동", "", "나길", "361102000002", "0", 2, 0, "대장명", null, "시군구명", false, "", "1", "MAIN"));
        reader.parcelBuilding(KEY, new BuildingRow("3", "세종특별자치시", "", "반곡동", "", "다길", "361102000003", "0", 3, 0, null, null, null, false, "", "1", "MAIN"));
        reader.parcelBuilding(KEY, new BuildingRow("4", "세종특별자치시", "", "반곡동", "", "라길", "361102000004", "0", 4, 0, "대장명", null, null, true, "", "1", "MAIN"));
        List<AddressGroup> a = service.buildings(PNU, null).getAddresses();
        assertThat(a).extracting(AddressGroup::getName).containsExactly("시군구명", "대장명", null, "대장명");
        assertThat(a.get(2).getBuildings().get(0).getName()).isNull();          // 빈 문자열은 null
        assertThat(a.get(2).getBuildings().get(0).getDetailName()).isNull();
        assertThat(a.get(2).getZipCode()).isNull();
    }

    @Test
    void 주소_묶음_정렬은_대표지번_먼저_도로명_지하여부_본번_부번() {
        reader.relatedReady(true);
        reader.parcelBuilding(KEY, row("R1", "가길", "0", 1, 0, "관련", null, null, false, "RELATED"));
        reader.parcelBuilding(KEY, row("M5", "나길", "0", 10, 0, "나", null, null, false, "MAIN"));
        reader.parcelBuilding(KEY, row("M4", "나길", "1", 2, 0, "나지하", null, null, false, "MAIN"));
        reader.parcelBuilding(KEY, row("M3", "나길", "0", 2, 1, "나2-1", null, null, false, "MAIN"));
        reader.parcelBuilding(KEY, row("M2", "나길", "0", 2, 0, "나2", null, null, false, "MAIN"));
        reader.parcelBuilding(KEY, row("M1", "가길", "0", 99, 0, "가99", null, null, false, "MAIN"));
        List<AddressGroup> a = service.buildings(PNU, null).getAddresses();
        assertThat(a).extracting(g -> g.getBuildings().get(0).getId()).containsExactly("M1", "M2", "M3", "M5", "M4", "R1");
    }

    @Test
    void 지하는_글자와_underground_공중은_글자에만() {
        reader.parcelBuilding(KEY, row("U", "반곡로", "1", 205, 0, "지하상가", null, null, false, "MAIN"));
        reader.parcelBuilding(KEY, row("A", "반곡로", "2", 7, 0, "공중", null, null, false, "MAIN"));
        List<AddressGroup> a = service.buildings(PNU, null).getAddresses();
        AddressGroup under = a.stream().filter(g -> g.getBuildings().get(0).getId().equals("U")).findFirst().orElseThrow();
        AddressGroup air = a.stream().filter(g -> g.getBuildings().get(0).getId().equals("A")).findFirst().orElseThrow();
        assertThat(under.isUnderground()).isTrue();
        assertThat(under.getRoadAddress()).contains("반곡로 지하205");
        assertThat(air.isUnderground()).isFalse();
        assertThat(air.getRoadAddress()).contains("반곡로 공중7");
    }

    @Test
    void 관련지번만_있는_묶음은_RELATED_대표지번_건물이_하나라도_있으면_MAIN() {
        reader.relatedReady(true);
        reader.parcelBuilding(KEY, row("A", "반곡로", "0", 1, 0, "대표", "1동", null, false, "MAIN"));
        reader.parcelBuilding(KEY, row("B", "반곡로", "0", 1, 0, "관련", "2동", null, false, "RELATED"));
        reader.parcelBuilding(KEY, row("C", "별로", "0", 5, 0, "관련만", null, null, false, "RELATED"));
        ParcelBuildingsResponse r = service.buildings(PNU, null);
        assertThat(r.isRelatedIncluded()).isTrue();
        assertThat(r.getAddresses()).extracting(AddressGroup::getRelation).containsExactly("MAIN", "RELATED");
        assertThat(r.getAddresses().get(0).getBuildings()).hasSize(2);
    }

    @Test
    void 관련지번_색인이_없으면_관련지번_건물은_빠지고_relatedIncluded_false() {
        reader.relatedReady(false);
        reader.parcelBuilding(KEY, row("A", "반곡로", "0", 1, 0, "대표", null, null, false, "MAIN"));
        reader.parcelBuilding(KEY, row("C", "별로", "0", 5, 0, "관련만", null, null, false, "RELATED"));
        ParcelBuildingsResponse r = service.buildings(PNU, null);
        assertThat(r.isRelatedIncluded()).isFalse();
        assertThat(r.getBuildingCount()).isEqualTo(1);
    }

    @Test
    void limit보다_많으면_truncated_전체_건수는_그대로() {
        for (int i = 0; i < 7; i++) reader.parcelBuilding(KEY, apt("ID" + i, (i + 1) + "동"));
        ParcelBuildingsResponse r = service.buildings(PNU, "3");
        assertThat(r.getBuildingCount()).isEqualTo(7);
        assertThat(r.isTruncated()).isTrue();
        assertThat(r.getAddresses().get(0).getBuildings()).hasSize(3);
        ParcelBuildingsResponse all = service.buildings(PNU, "7");
        assertThat(all.isTruncated()).isFalse();
    }

    @Test
    void 자연_정렬_비교기() {
        assertThat(ParcelBuildingService.naturalCompare("2동", "10동")).isNegative();
        assertThat(ParcelBuildingService.naturalCompare("10동", "2동")).isPositive();
        assertThat(ParcelBuildingService.naturalCompare("가동", "나동")).isNegative();
        assertThat(ParcelBuildingService.naturalCompare("1동", "1동")).isZero();
        assertThat(ParcelBuildingService.naturalCompare("1동", "1동2")).isNegative();
        assertThat(ParcelBuildingService.naturalCompare("A1", "A01")).isNotZero();           // 결정적(같다고 하지 않는다)
        assertThat(ParcelBuildingService.naturalCompare("100", "99")).isPositive();
        assertThat(ParcelBuildingService.naturalCompare("999999999999999999999", "1000000000000000000000")).isNegative();   // int 넘는 숫자
    }

    // ---------- fake provider 샘플 ----------

    @Test
    void 샘플_리더에_세종청사_건물이_있다() {
        service = new ParcelBuildingService(InMemoryAddressRefReader.samples());
        ParcelBuildingsResponse r = service.buildings("3611010300" + "1" + "0718" + "0000", null);
        assertThat(r.getBuildingCount()).isEqualTo(2);
        assertThat(r.getAddresses().get(0).getRoadAddress()).startsWith("세종특별자치시 한누리대로 2130");
    }

    // ---------- 컨트롤러 ----------

    @Test
    void 컨트롤러_응답_봉투_필드_캐시_헤더_오류() throws Exception {
        reader.parcelBuilding(KEY, apt("X1", "1동"));
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new ParcelRefController(service, org.mockito.Mockito.mock(com.gtp.domain.mymap.service.PnuAddressService.class),
                org.mockito.Mockito.mock(RefStatusService.class))).setControllerAdvice(new GlobalExceptionHandler()).build();
        ObjectMapper om = new ObjectMapper();

        MvcResult ok = mvc.perform(get("/api/mymap/ref/parcels/" + PNU + "/buildings?limit=5")).andReturn();
        assertThat(ok.getResponse().getStatus()).isEqualTo(200);
        assertThat(ok.getResponse().getHeader("Cache-Control")).contains("private").contains("max-age=300");
        JsonNode j = om.readTree(ok.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
        assertThat(j.get("success").asBoolean()).isTrue();
        JsonNode d = j.get("data");
        assertThat(d.get("pnu").asText()).isEqualTo(PNU);
        assertThat(d.get("referenceVersion").asText()).isEqualTo("2026-09");
        assertThat(d.get("buildingCount").asInt()).isEqualTo(1);
        assertThat(d.get("truncated").asBoolean()).isFalse();
        assertThat(d.get("relatedIncluded").asBoolean()).isFalse();
        JsonNode a = d.get("addresses").get(0);
        assertThat(a.fieldNames()).toIterable().containsExactlyInAnyOrder("roadAddress", "underground", "zipCode", "name", "apartment", "relation", "buildings");
        assertThat(a.get("buildings").get(0).fieldNames()).toIterable().containsExactlyInAnyOrder("id", "name", "detailName", "sggName");
        assertThat(a.get("buildings").get(0).get("id").asText()).isEqualTo("X1");

        MvcResult bad = mvc.perform(get("/api/mymap/ref/parcels/123/buildings")).andReturn();
        assertThat(bad.getResponse().getStatus()).isEqualTo(400);
        assertThat(bad.getResponse().getHeader("Cache-Control")).isNull();
        assertThat(mvc.perform(get("/api/mymap/ref/parcels/" + PNU + "/buildings?limit=abc")).andReturn().getResponse().getStatus()).isEqualTo(400);
        assertThat(mvc.perform(get("/api/mymap/ref/parcels/" + PNU + "/buildings?limit=1001")).andReturn().getResponse().getStatus()).isEqualTo(400);

        reader.jibunReady(false);
        MvcResult unavailable = mvc.perform(get("/api/mymap/ref/parcels/" + PNU + "/buildings")).andReturn();
        assertThat(unavailable.getResponse().getStatus()).isEqualTo(503);
        assertThat(unavailable.getResponse().getHeader("Cache-Control")).isNull();   // 오류 응답은 캐시하지 않는다
        assertThat(unavailable.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8)).contains("아직 준비되지 않았습니다");
    }
}
