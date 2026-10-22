package com.gtp.domain.mymap;

import com.gtp.global.gis.share.GisShareDirectory;
import com.gtp.global.gis.share.ShareGroupResponse;
import com.gtp.global.gis.share.ShareUserResponse;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 시험용 공유 상대 디렉터리 — 메모리 사용자·그룹. 호출 기록과 호출 직전 훅(경쟁 흉내)을 가진다. */
public class FakeShareDirectory implements GisShareDirectory {

    public final Map<String, UserState> users = new LinkedHashMap<>();
    public final List<ShareGroupResponse> groups = new ArrayList<>();
    public final List<Collection<String>> lookups = new ArrayList<>();
    public Runnable onLookup = () -> {
    };
    public boolean failLookup;

    public static FakeShareDirectory standard() {
        FakeShareDirectory d = new FakeShareDirectory();
        d.users.put("alice", new UserState("앨리스", true));
        d.users.put("bob", new UserState("밥", true));
        d.users.put("carol", new UserState("캐롤", true));
        d.users.put("dave", new UserState(null, true));
        d.users.put("gone", new UserState("퇴사자", false));
        d.groups.add(new ShareGroupResponse("MAP_ADMIN", "지도관리자", null));
        d.groups.add(new ShareGroupResponse("MAP_USER", "지도사용자", null));
        d.groups.add(new ShareGroupResponse("MAP_USER:DEPT_A", "부서A", "MAP_USER"));
        return d;
    }

    @Override
    public List<ShareUserResponse> searchUsers(String q, String excludeUserId, int limit) {
        return List.of();
    }

    @Override
    public List<ShareGroupResponse> groups() {
        return List.copyOf(groups);
    }

    @Override
    public Map<String, UserState> lookupUsers(Collection<String> userIds) {
        lookups.add(List.copyOf(userIds));
        if (failLookup) throw new IllegalStateException("디렉터리 오류");
        onLookup.run();
        Map<String, UserState> out = new HashMap<>();
        for (String id : userIds) {
            UserState s = users.get(id);
            if (s != null) out.put(id, s);
        }
        return out;
    }
}
