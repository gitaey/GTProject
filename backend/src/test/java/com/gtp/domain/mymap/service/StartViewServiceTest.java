package com.gtp.domain.mymap.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.gtp.domain.mymap.controller.StartViewController;
import com.gtp.domain.mymap.controller.UserMapController;
import com.gtp.domain.mymap.dto.StartViewResponse;
import com.gtp.domain.mymap.infra.StartViewStore;
import com.gtp.domain.mymap.infra.StartViewStore.Stored;
import com.gtp.global.exception.CustomException;
import com.gtp.global.exception.GlobalExceptionHandler;
import com.gtp.global.gis.GisErrorCode;
import com.gtp.global.gis.GisUserContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 시작 화면 저장(U28~U30) — DB·스프링 컨텍스트 없이. 저장소는 mock, 컨트롤러는 standalone MockMvc.
 * 크기 8192 경계·형식 검사·정규화·사용자 분리·503 전달·경로 겹침(UserMapController /{id})·no-store·상태 코드를 확인한다.
 */
class StartViewServiceTest {

    static final String TWO_PANES = """
            {
              "version": 1,
              "savedAt": "2026-11-09T14:20:00+09:00",
              "split": { "count": 2, "sync": true, "activeIndex": 0 },
              "panes": [
                { "center": [127.2890, 36.4800], "zoom": 15, "rotation": 0, "basemap": "normal" },
                { "center": [127.2890, 36.4800], "zoom": 15, "rotation": 0, "basemap": "satellite" }
              ],
              "futureKey": { "keep": "me" }
            }""";

    final ObjectMapper mapper = new ObjectMapper();
    StartViewStore store;
    String me;
    StartViewService service;
    final OffsetDateTime savedAt = OffsetDateTime.parse("2026-11-09T14:21:00+09:00");

    @BeforeEach
    void setUp() {
        store = mock(StartViewStore.class);
        me = "alice";
        GisUserContext ctx = new GisUserContext() {
            @Override
            public String currentUserId() {
                return me;
            }

            @Override
            public List<String> currentRoleCodes() {
                return List.of();
            }
        };
        service = new StartViewService(store, ctx, mapper);
        when(store.save(anyString(), anyString(), anyInt())).thenReturn(savedAt);
    }

    static byte[] bytes(String s) {
        return s.getBytes(StandardCharsets.UTF_8);
    }

    /** version·panes가 맞고 정확히 totalBytes 바이트인 JSON(여분은 모르는 키 값으로 채운다 — 서버는 모르는 키를 그대로 둔다) */
    static String jsonOfBytes(int totalBytes) {
        String head = "{\"version\":1,\"panes\":[{}],\"pad\":\"";
        String tail = "\"}";
        int pad = totalBytes - head.length() - tail.length();
        return head + "x".repeat(pad) + tail;
    }

    void assertInvalid(String json) {
        assertThatThrownBy(() -> service.save(bytes(json))).as(json)
                .isInstanceOfSatisfying(CustomException.class, e -> assertThat(e.getErrorCode()).isEqualTo(GisErrorCode.START_VIEW_INVALID));
        verify(store, never()).save(anyString(), anyString(), anyInt());
    }

    // ---------------------------------------------------------------- 크기

    @Test
    void 크기_8192바이트까지는_저장하고_8193부터는_413() {
        String ok = jsonOfBytes(StartViewService.MAX_BYTES);
        assertThat(bytes(ok)).hasSize(8192);
        service.save(bytes(ok));
        verify(store).save(eq("alice"), eq(ok), eq(1));

        String over = jsonOfBytes(StartViewService.MAX_BYTES + 1);
        assertThatThrownBy(() -> service.save(bytes(over)))
                .isInstanceOfSatisfying(CustomException.class, e -> assertThat(e.getErrorCode()).isEqualTo(GisErrorCode.START_VIEW_TOO_LARGE));
        assertThat(GisErrorCode.START_VIEW_TOO_LARGE.getStatus().value()).isEqualTo(413);
        verify(store, org.mockito.Mockito.times(1)).save(anyString(), anyString(), anyInt());   // 413은 저장소를 부르지 않았다
    }

    @Test
    void 크기는_글자_수가_아니라_UTF8_바이트로_센다() {
        // 한글 한 글자 = 3바이트: 글자 수로는 8192 이하지만 바이트로는 넘는다
        String head = "{\"version\":1,\"panes\":[{}],\"pad\":\"";
        String text = head + "가".repeat(2800) + "\"}";
        assertThat(text.length()).isLessThan(8192);
        assertThat(bytes(text).length).isGreaterThan(8192);
        assertThatThrownBy(() -> service.save(bytes(text)))
                .isInstanceOfSatisfying(CustomException.class, e -> assertThat(e.getErrorCode()).isEqualTo(GisErrorCode.START_VIEW_TOO_LARGE));
    }

    @Test
    void 정규화하면_커지는_본문도_표의_CHECK에_걸리기_전에_413() {
        // 1e2(3바이트) → 100.0(5바이트): 원문은 8192 이하인데 다시 쓴 결과는 넘는다
        String text = "{\"version\":1,\"panes\":[{}],\"z\":[" + "1e2,".repeat(1700) + "1e2]}";
        assertThat(bytes(text).length).isLessThanOrEqualTo(8192);
        assertThatThrownBy(() -> service.save(bytes(text)))
                .isInstanceOfSatisfying(CustomException.class, e -> assertThat(e.getErrorCode()).isEqualTo(GisErrorCode.START_VIEW_TOO_LARGE));
        verify(store, never()).save(anyString(), anyString(), anyInt());
    }

    // ---------------------------------------------------------------- 형식

    @Test
    void 깨진_JSON과_최상위가_객체가_아닌_값은_400() {
        assertInvalid("");
        assertInvalid("   ");
        assertInvalid("{");
        assertInvalid("{\"version\":1,");
        assertInvalid("not json");
        assertInvalid("[]");
        assertInvalid("[{\"version\":1,\"panes\":[{}]}]");   // 배열 최상위
        assertInvalid("null");
        assertInvalid("1");
        assertInvalid("\"{}\"");
        assertInvalid("{\"version\":1,\"panes\":[{}]} xyz");   // 끝에 군더더기
        assertInvalid("{\"version\":1,\"panes\":[{}]}{}");
        assertInvalid("{\"version\":1,\"version\":1,\"panes\":[{}]}");   // 같은 키 두 번
    }

    @Test
    void version은_정수_1만_받는다() {
        assertInvalid("{\"panes\":[{}]}");
        assertInvalid("{\"version\":2,\"panes\":[{}]}");
        assertInvalid("{\"version\":0,\"panes\":[{}]}");
        assertInvalid("{\"version\":-1,\"panes\":[{}]}");
        assertInvalid("{\"version\":\"1\",\"panes\":[{}]}");
        assertInvalid("{\"version\":1.0,\"panes\":[{}]}");
        assertInvalid("{\"version\":1.5,\"panes\":[{}]}");
        assertInvalid("{\"version\":null,\"panes\":[{}]}");
        assertInvalid("{\"version\":true,\"panes\":[{}]}");
        assertInvalid("{\"version\":[1],\"panes\":[{}]}");
        assertInvalid("{\"version\":99999999999,\"panes\":[{}]}");   // int을 넘는 정수
        assertInvalid("{\"version\":4294967297,\"panes\":[{}]}");    // 2^32+1 — int로 잘라 읽으면 1이 되는 값
    }

    @Test
    void panes는_객체_1개에서_4개_배열이어야_한다() {
        assertInvalid("{\"version\":1}");
        assertInvalid("{\"version\":1,\"panes\":null}");
        assertInvalid("{\"version\":1,\"panes\":{}}");
        assertInvalid("{\"version\":1,\"panes\":\"x\"}");
        assertInvalid("{\"version\":1,\"panes\":[]}");                       // 0개
        assertInvalid("{\"version\":1,\"panes\":[{},{},{},{},{}]}");         // 5개
        assertInvalid("{\"version\":1,\"panes\":[1]}");
        assertInvalid("{\"version\":1,\"panes\":[null]}");
        assertInvalid("{\"version\":1,\"panes\":[[]]}");
        assertInvalid("{\"version\":1,\"panes\":[{},\"x\"]}");               // 한 칸이라도 객체가 아니면
        for (int n = 1; n <= 4; n++) {                                       // 1~4개는 통과
            service.save(bytes("{\"version\":1,\"panes\":[" + String.join(",", java.util.Collections.nCopies(n, "{}")) + "]}"));
        }
        verify(store, org.mockito.Mockito.times(4)).save(anyString(), anyString(), anyInt());
    }

    @Test
    void 서버는_내용을_해석하지_않는다_좌표_범위_줌_같은_값은_그대로_저장() {
        // 내용 검사는 클라이언트 parseStartView 몫 — 서버는 형식·크기만
        String weird = "{\"version\":1,\"panes\":[{\"center\":[999,-999],\"zoom\":-5,\"basemap\":\"???\"}],\"split\":\"아무거나\"}";
        service.save(bytes(weird));
        verify(store).save(eq("alice"), eq(weird), eq(1));
    }

    // ---------------------------------------------------------------- 정상 저장

    @Test
    void 정상_본문은_공백을_없앤_문자열로_저장하고_모르는_키는_남긴다() throws Exception {
        StartViewResponse res = service.save(bytes(TWO_PANES));

        ArgumentCaptor<String> json = ArgumentCaptor.forClass(String.class);
        verify(store).save(eq("alice"), json.capture(), eq(1));
        assertThat(json.getValue()).doesNotContain("\n").doesNotContain(": ").doesNotContain(", ");
        JsonNode saved = mapper.readTree(json.getValue());
        assertThat(saved).isEqualTo(mapper.readTree(TWO_PANES));          // 내용은 같다
        assertThat(saved.get("futureKey").get("keep").asText()).isEqualTo("me");   // 모르는 키 보존
        assertThat(saved.get("panes")).hasSize(2);

        assertThat(res.view()).isEqualTo(saved);
        assertThat(res.updatedAt()).isEqualTo(savedAt);
    }

    @Test
    void 사용자는_컨텍스트의_현재_사용자로만_정한다() {
        me = "bob";
        service.save(bytes(TWO_PANES));
        verify(store).save(eq("bob"), anyString(), eq(1));
        service.get();
        verify(store).find("bob");
        service.delete();
        verify(store).delete("bob");
        verify(store, never()).find("alice");
    }

    @Test
    void 로그인_사용자가_없으면_401_저장소는_건드리지_않는다() {
        me = null;
        for (Runnable call : List.<Runnable>of(() -> service.get(), () -> service.save(bytes(TWO_PANES)), () -> service.delete())) {
            assertThatThrownBy(call::run)
                    .isInstanceOfSatisfying(CustomException.class, e -> assertThat(e.getErrorCode()).isEqualTo(GisErrorCode.UNAUTHORIZED));
        }
        me = " ";
        assertThatThrownBy(() -> service.get()).isInstanceOf(CustomException.class);
        verifyNoInteractions(store);
    }

    // ---------------------------------------------------------------- 조회·삭제

    @Test
    void 저장한_적_없으면_view와_updatedAt이_null() {
        when(store.find("alice")).thenReturn(Optional.empty());
        StartViewResponse res = service.get();
        assertThat(res.view()).isNull();
        assertThat(res.updatedAt()).isNull();
    }

    @Test
    void 저장값이_있으면_JSON_그대로_돌려준다() throws Exception {
        String stored = "{\"version\":1,\"panes\":[{\"zoom\":15}]}";
        when(store.find("alice")).thenReturn(Optional.of(new Stored(stored, savedAt)));
        StartViewResponse res = service.get();
        assertThat(res.view()).isEqualTo(mapper.readTree(stored));
        assertThat(res.updatedAt()).isEqualTo(savedAt);
    }

    @Test
    void 저장값이_JSON이_아니면_없는_것으로_답한다_500이_아니다() {
        when(store.find("alice")).thenReturn(Optional.of(new Stored("{깨짐", savedAt)));
        StartViewResponse res = service.get();
        assertThat(res.view()).isNull();
        assertThat(res.updatedAt()).isNull();
    }

    @Test
    void 저장소가_준비되지_않으면_503이_그대로_전달된다() {
        CustomException unavailable = new CustomException(GisErrorCode.START_VIEW_STORE_UNAVAILABLE);
        when(store.find(anyString())).thenThrow(unavailable);
        when(store.save(anyString(), anyString(), anyInt())).thenThrow(unavailable);
        org.mockito.Mockito.doThrow(unavailable).when(store).delete(anyString());
        for (Runnable call : List.<Runnable>of(() -> service.get(), () -> service.save(bytes(TWO_PANES)), () -> service.delete())) {
            assertThatThrownBy(call::run).isSameAs(unavailable);
        }
        assertThat(GisErrorCode.START_VIEW_STORE_UNAVAILABLE.getStatus().value()).isEqualTo(503);
    }

    // ---------------------------------------------------------------- HTTP(컨트롤러 + 경로 겹침)

    /** 시작 화면 컨트롤러와 UserMapController를 함께 세운다 — /{id}와 겹치는 경로가 어디로 가는지 본다 */
    class Http {
        final UserMapService userMapService = mock(UserMapService.class);
        final MockMvc mvc;

        Http() {
            GisUserContext ctx = new GisUserContext() {
                @Override
                public String currentUserId() {
                    return me;
                }

                @Override
                public List<String> currentRoleCodes() {
                    return List.of();
                }
            };
            UserMapController userMap = new UserMapController(userMapService, mock(UserMapUploadService.class), mock(ImportReportService.class),
                    mock(MyMapQuotaService.class), mock(MyMapColumnService.class), mock(SampleService.class), ctx, mock(UserMapShareService.class),
                    mock(AddressConvertService.class), mock(UserMapExportService.class));
            // 앱의 기본값(WRITE_DATES_AS_TIMESTAMPS 켜짐)에서도 시각이 문자열로 나가는지 보려고 일부러 Boot 설정을 흉내 내지 않는다
            ObjectMapper httpMapper = new ObjectMapper().registerModule(new JavaTimeModule());
            mvc = MockMvcBuilders.standaloneSetup(userMap, new StartViewController(service))
                    .setControllerAdvice(new GlobalExceptionHandler())
                    .setMessageConverters(new MappingJackson2HttpMessageConverter(httpMapper))
                    .build();
        }
    }

    @Test
    void DELETE_start_view는_UserMapController의_id_삭제가_아니라_시작_화면_컨트롤러로_간다() throws Exception {
        Http h = new Http();
        h.mvc.perform(delete("/api/mymap/start-view")).andExpect(status().isOk()).andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data").doesNotExist()).andExpect(header().string("Cache-Control", "no-store"));
        verify(store).delete("alice");
        verifyNoInteractions(h.userMapService);

        // 숫자 id 경로는 여전히 UserMapController다
        h.mvc.perform(delete("/api/mymap/123")).andExpect(status().isOk());
        verify(h.userMapService).delete(123L, "alice");
        verify(store, org.mockito.Mockito.times(1)).delete(anyString());
    }

    @Test
    void GET_PUT_start_view도_시작_화면_컨트롤러로_가고_no_store() throws Exception {
        Http h = new Http();
        when(store.find("alice")).thenReturn(Optional.empty());
        h.mvc.perform(get("/api/mymap/start-view")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.view").value((Object) null)).andExpect(jsonPath("$.data.updatedAt").value((Object) null))
                .andExpect(header().string("Cache-Control", "no-store"));

        // 일부러 낯선 Content-Type — @RequestBody 변환기였다면 415(→ 전역 핸들러 500)가 됐을 요청
        h.mvc.perform(put("/api/mymap/start-view").contentType(MediaType.TEXT_PLAIN).content(TWO_PANES))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.data.view.panes.length()").value(2))
                .andExpect(jsonPath("$.data.view.futureKey.keep").value("me"))
                .andExpect(jsonPath("$.data.updatedAt").value("2026-11-09T14:21:00+09:00"));
        verify(store).save(eq("alice"), anyString(), eq(1));
        verifyNoInteractions(h.userMapService);
    }

    @Test
    void PUT_오류_상태는_400_413_503이고_본문은_메시지() throws Exception {
        Http h = new Http();
        h.mvc.perform(put("/api/mymap/start-view").contentType(MediaType.APPLICATION_JSON).content("{깨진"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("시작 화면 형식이 올바르지 않습니다."));
        h.mvc.perform(put("/api/mymap/start-view").contentType(MediaType.APPLICATION_JSON).content("[]"))
                .andExpect(status().isBadRequest());
        h.mvc.perform(put("/api/mymap/start-view")).andExpect(status().isBadRequest());   // 본문 없음도 500이 아니라 400

        h.mvc.perform(put("/api/mymap/start-view").contentType(MediaType.APPLICATION_JSON).content(jsonOfBytes(8193)))
                .andExpect(status().isPayloadTooLarge()).andExpect(jsonPath("$.message").value("시작 화면 값이 너무 큽니다(최대 8KB)."));
        // 아주 큰 본문도 같은 413(컨트롤러가 8193바이트까지만 읽는다)
        h.mvc.perform(put("/api/mymap/start-view").contentType(MediaType.APPLICATION_JSON).content("x".repeat(200_000)))
                .andExpect(status().isPayloadTooLarge());
        h.mvc.perform(put("/api/mymap/start-view").contentType(MediaType.APPLICATION_JSON).content(jsonOfBytes(8192)))
                .andExpect(status().isOk());

        CustomException unavailable = new CustomException(GisErrorCode.START_VIEW_STORE_UNAVAILABLE);
        when(store.save(anyString(), anyString(), anyInt())).thenThrow(unavailable);
        when(store.find(anyString())).thenThrow(unavailable);
        h.mvc.perform(put("/api/mymap/start-view").contentType(MediaType.APPLICATION_JSON).content(TWO_PANES))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.message").value("시작 화면 저장소가 아직 준비되지 않았습니다(관리자: DB 표 생성 필요)."));
        h.mvc.perform(get("/api/mymap/start-view")).andExpect(status().isServiceUnavailable());
    }

    @Test
    void 한글이_들어간_본문도_UTF8로_읽고_저장한다() throws Exception {
        Http h = new Http();
        String body = "{\"version\":1,\"panes\":[{\"name\":\"세종시청\"}]}";
        h.mvc.perform(put("/api/mymap/start-view").contentType(MediaType.APPLICATION_JSON).content(body.getBytes(StandardCharsets.UTF_8)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.view.panes[0].name").value("세종시청"));
        verify(store).save(eq("alice"), eq(body), eq(1));
    }
}
