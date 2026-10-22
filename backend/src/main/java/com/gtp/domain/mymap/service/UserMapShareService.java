package com.gtp.domain.mymap.service;

import com.gtp.domain.mymap.dto.*;
import com.gtp.domain.mymap.entity.UserMap;
import com.gtp.domain.mymap.entity.UserMapPermissionAccess;
import com.gtp.domain.mymap.entity.UserMapUserAccess;
import com.gtp.domain.mymap.repository.UserMapPermissionAccessRepository;
import com.gtp.domain.mymap.repository.UserMapRepository;
import com.gtp.domain.mymap.repository.UserMapUserAccessRepository;
import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import com.gtp.global.gis.share.GisShareDirectory;
import com.gtp.global.gis.share.ShareGroupResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

/**
 * 나만의지도 공유 저장·조회 — 단일 레이어(통째로 바꾸기), 여러 레이어 조회, 일괄 더하기/빼기.
 * 사용자·그룹의 이름·존재는 포트 {@link GisShareDirectory}로만 묻는다(member 도메인을 import하지 않는다).
 * 그룹 코드는 역할 "MAP_USER", 세부권한 "MAP_USER:DEPT_A" 같은 문자열이고 저장 칸은 role_code(50자) 그대로다.
 * 소유자만 공유를 바꿀 수 있고, 공유받은 쪽은 보기만 한다.
 */
@Slf4j
@Service
public class UserMapShareService {

    public static final int MAX_TARGETS = 100;
    public static final int MAX_BULK_LAYERS = 50;
    static final int ERROR_LIST_MAX = 10;
    static final int ERROR_ITEM_MAX_CHARS = 50;

    public static final String REASON_NOT_AVAILABLE = "NOT_AVAILABLE";
    public static final String REASON_LIMIT_EXCEEDED = "LIMIT_EXCEEDED";

    private final UserMapRepository userMapRepository;
    private final UserMapUserAccessRepository userAccess;
    private final UserMapPermissionAccessRepository permAccess;
    private final GisShareDirectory directory;

    public UserMapShareService(UserMapRepository userMapRepository,
                               UserMapUserAccessRepository userAccess,
                               UserMapPermissionAccessRepository permAccess,
                               GisShareDirectory directory) {
        this.userMapRepository = userMapRepository;
        this.userAccess = userAccess;
        this.permAccess = permAccess;
        this.directory = directory;
    }

    // ---------- 조회 ----------

    /** A3 — 소유자만. 옛 필드(userIds·roleCodes)에 이름·상태(users·roles)를 더한다. */
    @Transactional(readOnly = true)
    public UserMapShareResponse get(Long id, String userId) {
        UserMap map = ownedMap(id, userId);
        List<String> userIds = userAccess.findAllByUserMap(map).stream()
                .sorted(Comparator.comparing(UserMapUserAccess::getId))
                .map(UserMapUserAccess::getUserId).toList();
        List<String> roleCodes = permAccess.findAllByUserMap(map).stream()
                .sorted(Comparator.comparing(UserMapPermissionAccess::getId))
                .map(UserMapPermissionAccess::getRoleCode).toList();
        return UserMapShareResponse.builder()
                .userIds(userIds)
                .roleCodes(roleCodes)
                .users(userStates(userIds, directory.lookupUsers(userIds)))
                .roles(roleStates(roleCodes, groupLabels()))
                .build();
    }

    /** A5 — 여러 레이어의 현재 공유. 없거나 내 것이 아닌 id는 결과에서 뺀다(존재 여부 비노출). 요청 순서 유지. */
    @Transactional(readOnly = true)
    public List<ShareSnapshotResponse> snapshots(String idsParam, String userId) {
        List<Long> ids = parseIds(idsParam);
        List<UserMap> owned = ownedMapsInOrder(ids, userId);
        if (owned.isEmpty()) return List.of();

        Map<Long, List<String>> usersByMap = new HashMap<>();
        userAccess.findAllByUserMapIn(owned).stream()
                .sorted(Comparator.comparing(UserMapUserAccess::getId))
                .forEach(a -> usersByMap.computeIfAbsent(a.getUserMap().getId(), k -> new ArrayList<>()).add(a.getUserId()));
        Map<Long, List<String>> rolesByMap = new HashMap<>();
        permAccess.findAllByUserMapIn(owned).stream()
                .sorted(Comparator.comparing(UserMapPermissionAccess::getId))
                .forEach(a -> rolesByMap.computeIfAbsent(a.getUserMap().getId(), k -> new ArrayList<>()).add(a.getRoleCode()));

        Set<String> allUsers = usersByMap.values().stream().flatMap(List::stream).collect(Collectors.toCollection(LinkedHashSet::new));
        Map<String, GisShareDirectory.UserState> states = directory.lookupUsers(allUsers);
        Map<String, String> labels = groupLabels();

        List<ShareSnapshotResponse> out = new ArrayList<>();
        for (UserMap m : owned) {
            out.add(new ShareSnapshotResponse(m.getId(),
                    userStates(usersByMap.getOrDefault(m.getId(), List.of()), states),
                    roleStates(rolesByMap.getOrDefault(m.getId(), List.of()), labels)));
        }
        return out;
    }

    /** 목록의 shareCount — 내 레이어 id들의 (사용자 + 그룹) 공유 수. 공유가 없으면 0. 집계 쿼리 2번. */
    @Transactional(readOnly = true)
    public Map<Long, Integer> shareCounts(Collection<Long> myLayerIds) {
        Map<Long, Integer> counts = new HashMap<>();
        if (myLayerIds == null || myLayerIds.isEmpty()) return counts;
        for (Object[] row : userAccess.countByUserMapIds(myLayerIds)) {
            counts.merge(((Number) row[0]).longValue(), ((Number) row[1]).intValue(), Integer::sum);
        }
        for (Object[] row : permAccess.countByUserMapIds(myLayerIds)) {
            counts.merge(((Number) row[0]).longValue(), ((Number) row[1]).intValue(), Integer::sum);
        }
        return counts;
    }

    /** 목록의 ownerName(보낸 사람 이름). 이름 조회가 실패해도 목록은 막지 않는다(이름 없이 보인다). */
    public Map<String, String> ownerNames(Collection<String> ownerIds) {
        Map<String, String> out = new HashMap<>();
        if (ownerIds == null || ownerIds.isEmpty()) return out;
        try {
            directory.lookupUsers(ownerIds).forEach((id, s) -> {
                if (s.name() != null) out.put(id, s.name());
            });
        } catch (RuntimeException e) {
            log.warn("보낸 사람 이름 조회에 실패했습니다(이름 없이 표시)", e);
        }
        return out;
    }

    // ---------- 단일 저장(통째로 바꾸기) ----------

    /**
     * A4 — 소유자만. 입력을 정리(trim·빈 값·중복 제거, 본인 제외)하고 합계 100개 이하인지 본 뒤,
     * <b>새로 추가되는 대상만</b> 존재 검사한다(이미 저장된 없는 대상은 그대로 둘 수 있어 화면이 막히지 않는다).
     */
    @Transactional
    public void replace(Long id, String userId, List<String> userIds, List<String> roleCodes) {
        UserMap map = ownedMap(id, userId);
        List<String> users = clean(userIds, userId);
        List<String> roles = clean(roleCodes, null);
        if (users.size() + roles.size() > MAX_TARGETS) {
            throw new CustomException(GisErrorCode.SHARE_TARGET_LIMIT);
        }

        List<UserMapUserAccess> curUsers = userAccess.findAllByUserMap(map);
        List<UserMapPermissionAccess> curRoles = permAccess.findAllByUserMap(map);
        Set<String> curUserIds = curUsers.stream().map(UserMapUserAccess::getUserId).collect(Collectors.toSet());
        Set<String> curRoleCodes = curRoles.stream().map(UserMapPermissionAccess::getRoleCode).collect(Collectors.toSet());

        List<String> newUsers = users.stream().filter(u -> !curUserIds.contains(u)).toList();
        List<String> newRoles = roles.stream().filter(r -> !curRoleCodes.contains(r)).toList();
        validateTargets(newUsers, newRoles);

        Set<String> keepUsers = new HashSet<>(users);
        Set<String> keepRoles = new HashSet<>(roles);
        List<UserMapUserAccess> delUsers = curUsers.stream().filter(a -> !keepUsers.contains(a.getUserId())).toList();
        List<UserMapPermissionAccess> delRoles = curRoles.stream().filter(a -> !keepRoles.contains(a.getRoleCode())).toList();
        List<UserMapUserAccess> addUsers = newUsers.stream()
                .map(u -> UserMapUserAccess.builder().userId(u).userMap(map).build()).toList();
        List<UserMapPermissionAccess> addRoles = newRoles.stream()
                .map(r -> UserMapPermissionAccess.builder().roleCode(r).userMap(map).build()).toList();
        write(delUsers, delRoles, addUsers, addRoles);
    }

    // ---------- 일괄 더하기/빼기 ----------

    /**
     * A6 — 한 트랜잭션. 대상(존재 검사는 ADD만)이 잘못이면 400으로 아무것도 바꾸지 않고,
     * 레이어별로는 없음·내 것 아님 → NOT_AVAILABLE, ADD 뒤 합계 100 초과 → LIMIT_EXCEEDED로 건너뛴다.
     */
    @Transactional
    public BulkShareResponse bulk(String userId, BulkShareRequest req) {
        if (req == null) throw new CustomException(GisErrorCode.SHARE_BULK_INVALID);
        List<Long> ids = distinctIds(req.ids());
        if (ids.isEmpty() || ids.size() > MAX_BULK_LAYERS) throw new CustomException(GisErrorCode.SHARE_BULK_INVALID);
        boolean add = parseMode(req.mode());

        List<String> users = clean(req.userIds(), userId);
        List<String> roles = clean(req.roleCodes(), null);
        int total = users.size() + roles.size();
        if (total == 0) throw new CustomException(GisErrorCode.SHARE_BULK_INVALID);
        if (total > MAX_TARGETS) throw new CustomException(GisErrorCode.SHARE_TARGET_LIMIT);
        if (add) validateTargets(users, roles);   // 잘못된 대상이면 여기서 400 — 아직 아무것도 바꾸지 않았다

        Map<Long, UserMap> byId = userMapRepository.findAllById(ids).stream()
                .collect(Collectors.toMap(UserMap::getId, m -> m));
        List<UserMap> owned = ids.stream().map(byId::get)
                .filter(m -> m != null && m.isOwnedBy(userId)).toList();
        Map<Long, List<UserMapUserAccess>> usersByMap = new HashMap<>();
        Map<Long, List<UserMapPermissionAccess>> rolesByMap = new HashMap<>();
        if (!owned.isEmpty()) {
            userAccess.findAllByUserMapIn(owned).forEach(a -> usersByMap.computeIfAbsent(a.getUserMap().getId(), k -> new ArrayList<>()).add(a));
            permAccess.findAllByUserMapIn(owned).forEach(a -> rolesByMap.computeIfAbsent(a.getUserMap().getId(), k -> new ArrayList<>()).add(a));
        }

        Set<String> targetUsers = new HashSet<>(users);
        Set<String> targetRoles = new HashSet<>(roles);
        List<Long> succeeded = new ArrayList<>();
        List<BulkShareResponse.Failed> failed = new ArrayList<>();
        List<UserMapUserAccess> delUsers = new ArrayList<>();
        List<UserMapPermissionAccess> delRoles = new ArrayList<>();
        List<UserMapUserAccess> addUsers = new ArrayList<>();
        List<UserMapPermissionAccess> addRoles = new ArrayList<>();

        for (Long id : ids) {
            UserMap map = byId.get(id);
            if (map == null || !map.isOwnedBy(userId)) {
                failed.add(new BulkShareResponse.Failed(id, REASON_NOT_AVAILABLE));
                continue;
            }
            List<UserMapUserAccess> curUsers = usersByMap.getOrDefault(id, List.of());
            List<UserMapPermissionAccess> curRoles = rolesByMap.getOrDefault(id, List.of());
            if (add) {
                Set<String> haveUsers = curUsers.stream().map(UserMapUserAccess::getUserId).collect(Collectors.toSet());
                Set<String> haveRoles = curRoles.stream().map(UserMapPermissionAccess::getRoleCode).collect(Collectors.toSet());
                List<String> newUsers = users.stream().filter(u -> !haveUsers.contains(u)).toList();
                List<String> newRoles = roles.stream().filter(r -> !haveRoles.contains(r)).toList();
                if (curUsers.size() + curRoles.size() + newUsers.size() + newRoles.size() > MAX_TARGETS) {
                    failed.add(new BulkShareResponse.Failed(id, REASON_LIMIT_EXCEEDED));
                    continue;
                }
                newUsers.forEach(u -> addUsers.add(UserMapUserAccess.builder().userId(u).userMap(map).build()));
                newRoles.forEach(r -> addRoles.add(UserMapPermissionAccess.builder().roleCode(r).userMap(map).build()));
            } else {
                curUsers.stream().filter(a -> targetUsers.contains(a.getUserId())).forEach(delUsers::add);
                curRoles.stream().filter(a -> targetRoles.contains(a.getRoleCode())).forEach(delRoles::add);
            }
            succeeded.add(id);
        }
        write(delUsers, delRoles, addUsers, addRoles);
        return new BulkShareResponse(succeeded, failed);
    }

    // ---------- 내부 ----------

    /** 지우고 → 넣는다. 동시에 같은 대상이 들어와 유니크 제약에 걸리면 409(SHARE_CONFLICT), 그 밖의 DB 오류는 그대로 던져 전체 롤백. */
    private void write(List<UserMapUserAccess> delUsers, List<UserMapPermissionAccess> delRoles,
                       List<UserMapUserAccess> addUsers, List<UserMapPermissionAccess> addRoles) {
        try {
            if (!delUsers.isEmpty()) userAccess.deleteAll(delUsers);
            if (!delRoles.isEmpty()) permAccess.deleteAll(delRoles);
            if (!delUsers.isEmpty() || !delRoles.isEmpty()) userAccess.flush();
            if (!addUsers.isEmpty()) userAccess.saveAllAndFlush(addUsers);
            if (!addRoles.isEmpty()) permAccess.saveAllAndFlush(addRoles);
        } catch (DataIntegrityViolationException e) {
            log.warn("공유 저장 중 유니크 충돌", e);
            throw new CustomException(GisErrorCode.SHARE_CONFLICT);
        }
    }

    private UserMap ownedMap(Long id, String userId) {
        UserMap map = userMapRepository.findById(id)
                .orElseThrow(() -> new CustomException(GisErrorCode.USER_MAP_NOT_FOUND));
        if (!map.isOwnedBy(userId)) throw new CustomException(GisErrorCode.USER_MAP_FORBIDDEN);
        return map;
    }

    private List<UserMap> ownedMapsInOrder(List<Long> ids, String userId) {
        Map<Long, UserMap> byId = userMapRepository.findAllById(ids).stream()
                .collect(Collectors.toMap(UserMap::getId, m -> m));
        return ids.stream().map(byId::get).filter(m -> m != null && m.isOwnedBy(userId)).toList();
    }

    /** trim·빈 값 제거·중복 제거(순서 유지), exclude(본인)는 조용히 뺀다. */
    static List<String> clean(List<String> raw, String exclude) {
        if (raw == null) return List.of();
        LinkedHashSet<String> set = new LinkedHashSet<>();
        for (String s : raw) {
            if (s == null) continue;
            String t = s.trim();
            if (t.isEmpty() || t.equals(exclude)) continue;
            set.add(t);
        }
        return List.copyOf(set);
    }

    /** 새로 추가되는 대상의 존재 검사 — 사용자는 ACTIVE여야 하고 그룹은 공유 가능한 그룹 목록에 있어야 한다. */
    private void validateTargets(List<String> newUsers, List<String> newRoles) {
        List<String> bad = new ArrayList<>();
        if (!newUsers.isEmpty()) {
            Map<String, GisShareDirectory.UserState> found = directory.lookupUsers(newUsers);
            for (String u : newUsers) {
                GisShareDirectory.UserState s = found.get(u);
                if (s == null || !s.active()) bad.add(u);
            }
        }
        if (!newRoles.isEmpty()) {
            Set<String> codes = groupLabels().keySet();
            for (String r : newRoles) {
                if (!codes.contains(r)) bad.add(r);
            }
        }
        if (!bad.isEmpty()) {
            throw GisErrorCode.SHARE_TARGET_INVALID.exception(describe(bad));
        }
    }

    /** "kim99, DEPT_X" — 최대 10개, 넘으면 " 외 n". 한 항목은 50자까지만(사용자가 넣은 값이라 길 수 있다). */
    static String describe(List<String> bad) {
        List<String> shown = bad.stream().limit(ERROR_LIST_MAX)
                .map(s -> s.length() > ERROR_ITEM_MAX_CHARS ? s.substring(0, ERROR_ITEM_MAX_CHARS) + "…" : s)
                .toList();
        String text = String.join(", ", shown);
        if (bad.size() > ERROR_LIST_MAX) text += " 외 " + (bad.size() - ERROR_LIST_MAX);
        return text;
    }

    private Map<String, String> groupLabels() {
        Map<String, String> labels = new LinkedHashMap<>();
        for (ShareGroupResponse g : directory.groups()) labels.put(g.code(), g.label());
        return labels;
    }

    private static List<ShareUserState> userStates(List<String> ids, Map<String, GisShareDirectory.UserState> found) {
        List<ShareUserState> out = new ArrayList<>();
        for (String id : ids) {
            GisShareDirectory.UserState s = found.get(id);
            if (s == null) out.add(new ShareUserState(id, null, "MISSING"));
            else out.add(new ShareUserState(id, s.name(), s.active() ? "ACTIVE" : "INACTIVE"));
        }
        return out;
    }

    private static List<ShareRoleState> roleStates(List<String> codes, Map<String, String> labels) {
        List<ShareRoleState> out = new ArrayList<>();
        for (String c : codes) {
            if (labels.containsKey(c)) out.add(new ShareRoleState(c, labels.get(c), "ACTIVE"));
            else out.add(new ShareRoleState(c, null, "MISSING"));
        }
        return out;
    }

    /** "1,2,3" → 숫자 목록(중복 제거). 비었거나 숫자가 아니거나 50개 초과면 SHARE_BULK_INVALID. */
    static List<Long> parseIds(String raw) {
        if (raw == null || raw.isBlank()) throw new CustomException(GisErrorCode.SHARE_BULK_INVALID);
        LinkedHashSet<Long> ids = new LinkedHashSet<>();
        for (String part : raw.split(",")) {
            String t = part.trim();
            if (t.isEmpty()) continue;
            try {
                ids.add(Long.parseLong(t));
            } catch (NumberFormatException e) {
                throw new CustomException(GisErrorCode.SHARE_BULK_INVALID);
            }
            if (ids.size() > MAX_BULK_LAYERS) throw new CustomException(GisErrorCode.SHARE_BULK_INVALID);
        }
        if (ids.isEmpty()) throw new CustomException(GisErrorCode.SHARE_BULK_INVALID);
        return List.copyOf(ids);
    }

    private static List<Long> distinctIds(List<Long> raw) {
        if (raw == null) return List.of();
        LinkedHashSet<Long> set = new LinkedHashSet<>();
        for (Long id : raw) if (id != null) set.add(id);
        return List.copyOf(set);
    }

    /** ADD → true, REMOVE → false. 그 밖의 값(REPLACE 포함)은 SHARE_BULK_INVALID. */
    private static boolean parseMode(String mode) {
        if (mode != null) {
            String m = mode.trim().toUpperCase(Locale.ROOT);
            if (m.equals("ADD")) return true;
            if (m.equals("REMOVE")) return false;
        }
        throw new CustomException(GisErrorCode.SHARE_BULK_INVALID);
    }
}
