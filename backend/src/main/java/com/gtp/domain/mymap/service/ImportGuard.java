package com.gtp.domain.mymap.service;

import org.springframework.stereotype.Component;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 사용자당 엑셀 가져오기 동시 1건을 지키는 자물쇠(단일 인스턴스). confirm 두 개가 거의 동시에 들어와도 DB의 PROCESSING 개수를 읽기 전에
 * 하나만 통과시키려고 메모리에서 원자적으로 잡는다. 작업이 끝나면(성공·실패 모두) 풀어야 한다.
 */
@Component
public class ImportGuard {

    private final Set<String> active = ConcurrentHashMap.newKeySet();

    /** @return 잡았으면 true, 이미 그 사용자의 작업이 돌고 있으면 false */
    public boolean tryAcquire(String ownerId) {
        return active.add(ownerId);
    }

    public void release(String ownerId) {
        active.remove(ownerId);
    }

    public boolean isActive(String ownerId) {
        return active.contains(ownerId);
    }
}
