package com.gtp.global.gis.share;

import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * GTProject용 {@link GisShareDirectory} 구현 — tbl_user·tbl_role·tbl_permission을 SQL로만 읽는다
 * (member 도메인의 엔티티·리포지토리를 import하지 않는다). 다른 프로젝트로 옮길 때는 이 클래스 하나만 다시 쓴다.
 * SQL 명세: .claude/skills/map-module-export/references/query-spec.md
 */
@Slf4j
@Component
public class JdbcGisShareDirectory implements GisShareDirectory {

    /** 공유 코드 칸(tbl_user_map_permission_access.role_code) 길이 */
    static final int GROUP_CODE_MAX = 50;
    static final String GROUP_SEPARATOR = ":";
    private static final char LIKE_ESCAPE_CHAR = '!';
    private static final int IN_CHUNK = 500;
    private static final int LIMIT_CAP = 100;

    private final JdbcTemplate jdbc;

    public JdbcGisShareDirectory(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<ShareUserResponse> searchUsers(String q, String excludeUserId, int limit) {
        String needle = q.toLowerCase(Locale.ROOT);
        String contains = "%" + escapeLike(needle) + "%";
        String prefix = escapeLike(needle) + "%";
        int max = Math.max(1, Math.min(limit, LIMIT_CAP));
        String exclude = excludeUserId == null ? "" : excludeUserId;
        // 아이디는 앞부분 일치만(계정 열거 완화), 이름·별명은 부분 일치. 비활성 계정·본인 제외
        return jdbc.query("""
                SELECT u.user_id, u.user_name, u.nickname, p.label AS group_label
                FROM tbl_user u
                LEFT JOIN tbl_permission p ON p.code = u.permission
                WHERE u.status = 'ACTIVE'
                  AND u.user_id <> ?
                  AND (lower(u.user_name) LIKE ? ESCAPE '!'
                       OR lower(u.nickname) LIKE ? ESCAPE '!'
                       OR lower(u.user_id) LIKE ? ESCAPE '!')
                ORDER BY CASE WHEN lower(u.user_id) = ? THEN 0 ELSE 1 END,
                         COALESCE(u.user_name, u.nickname, u.user_id),
                         u.user_id
                LIMIT ?
                """,
                (rs, i) -> new ShareUserResponse(
                        rs.getString("user_id"),
                        displayName(rs.getString("user_name"), rs.getString("nickname")),
                        blankToNull(rs.getString("group_label"))),
                exclude, contains, contains, prefix, needle, max);
    }

    @Override
    public List<ShareGroupResponse> groups() {
        // 슈퍼 역할은 공유 대상에서 뺀다(공유가 의미 없고 관리자 구조가 드러난다)
        Map<String, String> roles = new LinkedHashMap<>();
        jdbc.query("SELECT code, label FROM tbl_role WHERE is_super = FALSE ORDER BY sort_order, code",
                rs -> {
                    roles.put(rs.getString("code"), rs.getString("label"));
                });
        Map<String, List<ShareGroupResponse>> subs = new HashMap<>();
        jdbc.query("SELECT code, role_code, label FROM tbl_permission ORDER BY sort_order, code", rs -> {
            String role = rs.getString("role_code");
            if (!roles.containsKey(role)) return;
            String sub = rs.getString("code");
            String code = role + GROUP_SEPARATOR + sub;
            if (sub.contains(GROUP_SEPARATOR) || code.length() > GROUP_CODE_MAX) {
                log.warn("공유 그룹 코드로 쓸 수 없는 세부권한을 건너뜁니다: {}", code);
                return;
            }
            subs.computeIfAbsent(role, k -> new ArrayList<>()).add(new ShareGroupResponse(code, rs.getString("label"), role));
        });
        List<ShareGroupResponse> out = new ArrayList<>();
        roles.forEach((code, label) -> {
            out.add(new ShareGroupResponse(code, label, null));
            out.addAll(subs.getOrDefault(code, List.of()));
        });
        return out;
    }

    @Override
    public Map<String, UserState> lookupUsers(Collection<String> userIds) {
        Map<String, UserState> out = new HashMap<>();
        if (userIds == null || userIds.isEmpty()) return out;
        List<String> ids = new ArrayList<>(new LinkedHashSet<>(userIds));
        for (int from = 0; from < ids.size(); from += IN_CHUNK) {
            List<String> chunk = ids.subList(from, Math.min(ids.size(), from + IN_CHUNK));
            String marks = String.join(",", Collections.nCopies(chunk.size(), "?"));
            jdbc.query("SELECT user_id, user_name, nickname, status FROM tbl_user WHERE user_id IN (" + marks + ")",
                    rs -> {
                        out.put(rs.getString("user_id"), new UserState(
                                displayName(rs.getString("user_name"), rs.getString("nickname")),
                                "ACTIVE".equals(rs.getString("status"))));
                    }, chunk.toArray());
        }
        return out;
    }

    /** LIKE 패턴의 특수문자(% _ 와 이스케이프 문자 자신)를 글자 그대로 찾도록 이스케이프한다. */
    static String escapeLike(String s) {
        StringBuilder sb = new StringBuilder(s.length() + 4);
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '%' || c == '_' || c == LIKE_ESCAPE_CHAR) sb.append(LIKE_ESCAPE_CHAR);
            sb.append(c);
        }
        return sb.toString();
    }

    private static String displayName(String userName, String nickname) {
        String n = blankToNull(userName);
        return n != null ? n : blankToNull(nickname);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s;
    }
}
