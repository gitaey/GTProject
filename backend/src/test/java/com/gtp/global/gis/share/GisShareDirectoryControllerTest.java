package com.gtp.global.gis.share;

import com.gtp.global.exception.GlobalExceptionHandler;
import com.gtp.global.gis.GisUserContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class GisShareDirectoryControllerTest {

    /** 호출 인자를 기록하는 가짜 디렉터리 */
    static class Recording implements GisShareDirectory {
        final List<String> calls = new ArrayList<>();

        @Override
        public List<ShareUserResponse> searchUsers(String q, String excludeUserId, int limit) {
            calls.add(q + "|" + excludeUserId + "|" + limit);
            return List.of(new ShareUserResponse("kim01", "김철수", "부서A"));
        }

        @Override
        public List<ShareGroupResponse> groups() {
            return List.of(new ShareGroupResponse("MAP_USER", "지도사용자", null));
        }

        @Override
        public Map<String, UserState> lookupUsers(Collection<String> userIds) {
            return Map.of();
        }
    }

    Recording dir;
    String loggedIn;
    MockMvc mvc;

    @BeforeEach
    void setUp() {
        dir = new Recording();
        loggedIn = "alice";
        GisUserContext ctx = new GisUserContext() {
            @Override
            public String currentUserId() {
                return loggedIn;
            }

            @Override
            public List<String> currentRoleCodes() {
                return List.of("MAP_USER");
            }
        };
        mvc = MockMvcBuilders.standaloneSetup(new GisShareDirectoryController(dir, ctx))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
    }

    @Test
    void 검색은_본인을_제외하고_양끝_공백을_자른_검색어로_부른다() throws Exception {
        mvc.perform(get("/api/gis/share-directory/users").param("q", "  김철  "))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].userId").value("kim01"))
                .andExpect(jsonPath("$.data[0].name").value("김철수"))
                .andExpect(jsonPath("$.data[0].groupLabel").value("부서A"))
                .andExpect(jsonPath("$.data[0].email").doesNotExist())
                .andExpect(jsonPath("$.data[0].role").doesNotExist());
        assertThat(dir.calls).containsExactly("김철|alice|10");
    }

    @Test
    void 검색어는_2에서_50자_아니면_400() throws Exception {
        for (String bad : new String[]{"", " ", "a", " a ", "x".repeat(51)}) {
            mvc.perform(get("/api/gis/share-directory/users").param("q", bad))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.message").value("검색어는 2~50자로 입력하세요."));
        }
        mvc.perform(get("/api/gis/share-directory/users")).andExpect(status().isBadRequest());   // q 없음
        mvc.perform(get("/api/gis/share-directory/users").param("q", "ab")).andExpect(status().isOk());
        mvc.perform(get("/api/gis/share-directory/users").param("q", "x".repeat(50))).andExpect(status().isOk());
        assertThat(dir.calls).hasSize(2);   // 잘못된 검색어는 디렉터리를 부르지 않는다
    }

    @Test
    void limit은_기본_10_최대_20으로_자른다() throws Exception {
        for (String limit : new String[]{null, "5", "20", "21", "999", "0", "-3", "abc", " "}) {
            var req = get("/api/gis/share-directory/users").param("q", "ab");
            if (limit != null) req.param("limit", limit);
            mvc.perform(req).andExpect(status().isOk());
        }
        assertThat(dir.calls).containsExactly("ab|alice|10", "ab|alice|5", "ab|alice|20", "ab|alice|20", "ab|alice|20",
                "ab|alice|10", "ab|alice|10", "ab|alice|10", "ab|alice|10");
    }

    @Test
    void 로그인하지_않았으면_401이고_디렉터리를_부르지_않는다() throws Exception {
        loggedIn = null;
        mvc.perform(get("/api/gis/share-directory/users").param("q", "ab")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/gis/share-directory/groups")).andExpect(status().isUnauthorized());
        assertThat(dir.calls).isEmpty();
    }

    @Test
    void 그룹_목록() throws Exception {
        mvc.perform(get("/api/gis/share-directory/groups"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].code").value("MAP_USER"))
                .andExpect(jsonPath("$.data[0].label").value("지도사용자"))
                .andExpect(jsonPath("$.data[0].parentCode").isEmpty());
    }

    @Test
    void 분당_60번을_넘으면_429_그리고_사용자별로_센다() throws Exception {
        for (int i = 0; i < 60; i++) {
            mvc.perform(get("/api/gis/share-directory/users").param("q", "ab")).andExpect(status().isOk());
        }
        mvc.perform(get("/api/gis/share-directory/users").param("q", "ab"))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.message").value("잠시 후 다시 검색하세요."));
        loggedIn = "bob";   // 다른 사용자는 영향 없음
        mvc.perform(get("/api/gis/share-directory/users").param("q", "ab")).andExpect(status().isOk());
        assertThat(dir.calls).hasSize(61);
    }

    @Test
    void 호출_한도는_창이_지나면_다시_열린다() {
        AtomicLong now = new AtomicLong(1_000);
        ShareSearchRateLimiter limiter = new ShareSearchRateLimiter(3, 60_000, now::get);
        assertThat(limiter.tryAcquire("a")).isTrue();
        assertThat(limiter.tryAcquire("a")).isTrue();
        assertThat(limiter.tryAcquire("a")).isTrue();
        assertThat(limiter.tryAcquire("a")).isFalse();
        assertThat(limiter.tryAcquire("a")).isFalse();
        assertThat(limiter.tryAcquire("b")).isTrue();
        now.addAndGet(59_999);
        assertThat(limiter.tryAcquire("a")).isFalse();
        now.addAndGet(1);                                // 창 끝
        assertThat(limiter.tryAcquire("a")).isTrue();
        assertThat(limiter.tryAcquire("a")).isTrue();
        assertThat(limiter.tryAcquire("a")).isTrue();
        assertThat(limiter.tryAcquire("a")).isFalse();
    }
}
