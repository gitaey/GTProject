package com.gtp.global.config;

import com.gtp.global.jwt.JwtFilter;
import com.gtp.global.jwt.JwtUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.data.web.config.EnableSpringDataWebSupport;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableSpringDataWebSupport(pageSerializationMode = EnableSpringDataWebSupport.PageSerializationMode.VIA_DTO)
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtUtil jwtUtil;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)
            .formLogin(AbstractHttpConfigurer::disable)
            .httpBasic(AbstractHttpConfigurer::disable)
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(HttpMethod.POST, "/api/auth/login").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/posts", "/api/posts/{slug}").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/categories").permitAll()
                .requestMatchers("/api/categories/**").hasRole("SUPER_ADMIN") // 카테고리 생성·수정·삭제(목록 GET 공개 조회는 위에서 허용)
                .requestMatchers("/api/users/**").hasAnyRole("SUPER_ADMIN", "ADMIN", "MAP_ADMIN") // 지도사용자(MAP_USER)는 사용자 관리·조회 불가(공유 상대 검색은 /api/gis/share-directory/** 사용)
                .requestMatchers("/api/auth/me").authenticated()
                .requestMatchers("/api/posts/**").hasRole("SUPER_ADMIN") // 글 쓰기·수정·삭제·관리 목록(GET 공개 조회는 위에서 허용)
                .requestMatchers("/api/geoserver/**").hasAnyRole("SUPER_ADMIN", "MAP_ADMIN") // GeoServer 관리 도구 — 아무 서버에나 접속하므로 관리자만(연결 번호표는 별도 검사)
                .requestMatchers(HttpMethod.GET, "/api/layers", "/api/layers/tree", "/api/layers/tree/**").permitAll()
                .requestMatchers("/api/layers/**").authenticated()
                .requestMatchers(HttpMethod.GET, "/api/layer-groups").permitAll()
                .requestMatchers("/api/layer-groups/**").authenticated()
                .requestMatchers(HttpMethod.GET, "/api/wind/**").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/wind/refresh").hasAnyRole("SUPER_ADMIN", "MAP_ADMIN")
                .requestMatchers(HttpMethod.GET, "/api/bot-log/**").permitAll()
                .requestMatchers("/api/bot/**").authenticated()
                .requestMatchers("/api/access-log/**").authenticated()
                .requestMatchers("/api/admin/mymap/**").hasRole("SUPER_ADMIN")
                .requestMatchers("/api/mymap/**").authenticated()
                .requestMatchers("/api/menu-visibility").authenticated()
                .requestMatchers(HttpMethod.GET, "/api/roles", "/api/roles/**").authenticated()
                .requestMatchers("/api/roles/**").hasRole("SUPER_ADMIN")
                .requestMatchers("/api/gis/**").authenticated() // 지도 공통(공유 상대 검색 등) — 로그인 필요
                .anyRequest().permitAll()
            )
            .addFilterBefore(new JwtFilter(jwtUtil), UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
