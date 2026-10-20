package com.gtp.domain.mymap.model;

/** 엑셀 업로드 방식. 한 흐름(미리보기 → 모드·컬럼 → 비동기 처리)에서 모드만 갈린다. */
public enum ImportMode {
    PNU("EXCEL_PNU", "PNU"),
    ADDRESS("EXCEL_ADDRESS", "주소"),
    COORD("EXCEL_COORD", "좌표");

    private final String sourceKind;
    private final String label;

    ImportMode(String sourceKind, String label) {
        this.sourceKind = sourceKind;
        this.label = label;
    }

    /** {@code tbl_user_map.source_kind} 값 */
    public String sourceKind() {
        return sourceKind;
    }

    /** 사용자에게 보이는 이름("{모드}에 쓸 컬럼을 선택하세요") */
    public String label() {
        return label;
    }

    /** 비어 있으면 COORD(옛 요청과 호환). 모르는 값이면 null. */
    public static ImportMode parse(String raw) {
        if (raw == null || raw.isBlank()) return COORD;
        for (ImportMode m : values()) {
            if (m.name().equalsIgnoreCase(raw.trim())) return m;
        }
        return null;
    }
}
