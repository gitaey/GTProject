package com.gtp.domain.mymap.infra;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/** H2 시험용 PostgreSQL 함수 흉내: {@code to_regclass(이름)} — 등록한 색인 이름이면 그 이름, 아니면 NULL */
public final class H2Functions {

    public static final Set<String> INDEXES = ConcurrentHashMap.newKeySet();

    private H2Functions() {
    }

    public static String toRegclass(String name) {
        return name != null && INDEXES.contains(name) ? name : null;
    }
}
