// 레이어 목록 플로팅 패널의 순수 규칙(React 없음 — 단위 시험이 가능하도록 따로 뒀다). MapShell(권한·왼쪽 패널 정리)이 쓴다.

/** 플로팅 패널 권한: 권한 로딩 전이거나 featureId가 없으면(null) 보임(NavRail과 같은 규칙) */
export function isLayerFloatAllowed(permissionsReady: boolean, featureId: string | null, isFeatureAllowed: (id: string) => boolean): boolean {
    return !permissionsReady || featureId === null || isFeatureAllowed(featureId)
}

/** panels에서 패키지 기본 레이어 패널 객체만(=== 비교) 뺀다. 빼지 않으면 같은 배열을 그대로 돌려준다(참조 안정성) */
export function withoutPanel<T>(panels: readonly T[], target: T, remove: boolean): readonly T[] {
    if (!remove || !panels.includes(target)) return panels
    return panels.filter(p => p !== target)
}
