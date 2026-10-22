package com.gtp.global.jwt;

import com.gtp.global.gis.GisUserContext;
import com.gtp.global.gis.SecurityContextGisUserContext;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** 토큰의 perm 클레임 → JwtFilter의 PERM_ 권한 → GisUserContext 그룹 코드. 이전 토큰(perm 없음)도 깨지지 않는다. 가짜 비밀값만 쓴다. */
class JwtPermissionClaimTest {

    static final String SECRET = "test-only-secret-test-only-secret-test-only-secret-0123456789";

    JwtUtil jwtUtil;
    JwtFilter filter;
    GisUserContext ctx = new SecurityContextGisUserContext();

    @BeforeEach
    void setUp() {
        jwtUtil = new JwtUtil();
        ReflectionTestUtils.setField(jwtUtil, "secret", SECRET);
        ReflectionTestUtils.setField(jwtUtil, "expiration", 3_600_000L);
        filter = new JwtFilter(jwtUtil);
        SecurityContextHolder.clearContext();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private void request(String token) throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.addHeader("Authorization", "Bearer " + token);
        filter.doFilter(req, new MockHttpServletResponse(), new MockFilterChain());
    }

    private List<String> authorities() {
        return SecurityContextHolder.getContext().getAuthentication().getAuthorities().stream().map(GrantedAuthority::getAuthority).toList();
    }

    @Test
    void 세부권한이_있으면_perm_클레임이_들어가고_필터가_PERM_권한을_더한다() throws Exception {
        String token = jwtUtil.generateToken("alice", "MAP_USER", "DEPT_A");
        assertThat(jwtUtil.parseClaims(token).get("perm")).isEqualTo("DEPT_A");
        assertThat(jwtUtil.parseClaims(token).get("role")).isEqualTo("MAP_USER");

        request(token);
        assertThat(SecurityContextHolder.getContext().getAuthentication().getName()).isEqualTo("alice");
        assertThat(authorities()).containsExactlyInAnyOrder("ROLE_MAP_USER", "PERM_DEPT_A");
        assertThat(ctx.currentRoleCodes()).containsExactly("MAP_USER");                         // 역할 판정에 세부권한이 섞이지 않는다
        assertThat(ctx.currentShareGroupCodes()).containsExactly("MAP_USER", "MAP_USER:DEPT_A");
    }

    @Test
    void 세부권한이_없거나_빈_값이면_클레임을_넣지_않는다() throws Exception {
        for (String perm : new String[]{null, "", "  "}) {
            String token = jwtUtil.generateToken("bob", "MAP_ADMIN", perm);
            assertThat(jwtUtil.parseClaims(token).containsKey("perm")).isFalse();
        }
        assertThat(jwtUtil.parseClaims(jwtUtil.generateToken("bob", "MAP_ADMIN")).containsKey("perm")).isFalse();   // 옛 2인자 메서드

        request(jwtUtil.generateToken("bob", "MAP_ADMIN", null));
        assertThat(authorities()).containsExactly("ROLE_MAP_ADMIN");
        assertThat(ctx.currentShareGroupCodes()).containsExactly("MAP_ADMIN");
    }

    @Test
    void perm이_없는_이전_토큰도_그대로_로그인된다() throws Exception {
        String old = Jwts.builder().setSubject("carol").claim("role", "MAP_USER")
                .setIssuedAt(new Date()).setExpiration(new Date(System.currentTimeMillis() + 60_000))
                .signWith(Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8)), SignatureAlgorithm.HS256).compact();
        request(old);
        assertThat(SecurityContextHolder.getContext().getAuthentication().getName()).isEqualTo("carol");
        assertThat(authorities()).containsExactly("ROLE_MAP_USER");
        assertThat(ctx.currentShareGroupCodes()).containsExactly("MAP_USER");   // 세부권한 공유는 다시 로그인하기 전까지 안 보인다
    }

    @Test
    void 문자열이_아닌_perm_클레임은_무시한다() throws Exception {
        String odd = Jwts.builder().setSubject("dave").claim("role", "MAP_USER").claim("perm", 123)
                .setExpiration(new Date(System.currentTimeMillis() + 60_000))
                .signWith(Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8)), SignatureAlgorithm.HS256).compact();
        request(odd);
        assertThat(authorities()).containsExactly("ROLE_MAP_USER");
    }

    @Test
    void 잘못된_토큰은_인증되지_않는다() throws Exception {
        request("not-a-token");
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        assertThat(ctx.currentUserId()).isNull();
        assertThat(ctx.currentShareGroupCodes()).isEmpty();
    }

    @Test
    void GisUserContext는_권한_종류를_가려_읽는다() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("erin", null,
                List.of(new SimpleGrantedAuthority("ROLE_MAP_USER"), new SimpleGrantedAuthority("PERM_DEPT_B"),
                        new SimpleGrantedAuthority("SOMETHING_ELSE"), new SimpleGrantedAuthority("ROLE_"))));
        assertThat(ctx.currentRoleCodes()).containsExactly("MAP_USER");
        assertThat(ctx.currentShareGroupCodes()).containsExactly("MAP_USER", "MAP_USER:DEPT_B");
    }

    @Test
    void 익명은_빈_목록() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("anonymousUser", null,
                List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS"))));
        assertThat(ctx.currentUserId()).isNull();
        assertThat(ctx.currentRoleCodes()).isEmpty();
        assertThat(ctx.currentShareGroupCodes()).isEmpty();
    }

    @Test
    void 다른_호스트는_그룹_코드를_안_구현해도_역할_코드로_동작한다() {
        GisUserContext egov = new GisUserContext() {
            @Override
            public String currentUserId() {
                return "u";
            }

            @Override
            public List<String> currentRoleCodes() {
                return List.of("ROLE_A");
            }
        };
        assertThat(egov.currentShareGroupCodes()).containsExactly("ROLE_A");
    }
}
