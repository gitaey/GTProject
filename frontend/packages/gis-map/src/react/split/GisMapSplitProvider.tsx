'use client'

// 화면 분할 Provider: 2~4번 지도를 직접 만들고 소유한다(칸 DOM과 수명이 따로 — 셸이 다시 마운트돼도 지도는 산다).
//   - 보조 지도마다 DOM 없는 중첩 GisMapProvider를 렌더해 생성·정리·StrictMode·host 반영을 그대로 재사용하고, EngineTap으로 엔진을 받는다.
//   - 자식의 GisMapContext를 "활성 지도"로 덮어써서 기존 위젯이 코드 수정 없이 활성 지도에만 적용된다.
//     활성이 바깥 Provider의 지도(0번)이면 바깥 Context 값을 같은 참조로 그대로 내려 보낸다(분할 1개일 때 재렌더 0).
//   - 레이어 트리·그룹 펼침은 한 번 받아 모든 지도가 나눠 쓴다(setTree·setExpanded 전파).
//   - 화면 연동(sync)은 core/split/linkViews가 맡는다.
// 상태는 전부 이 Provider의 state/ref다(모듈 전역 없음).
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { applyViewState, copyMapState, linkViews } from '../../core'
import type { GisMap, GisMapConfig, GisMapStartView, GisMapViewState, StartViewState } from '../../core'
import { GisMapProvider } from '../GisMapProvider'
import { GisMapContext } from '../context'
import type { GisMapContextValue } from '../context'
import { EngineTap } from './EngineTap'
import { GisMapFactoryContext, GisMapSplitContext, GisMapSplitPanesContext } from './context'
import type {
    GisMapSetupInfo, GisMapSplitCount, GisMapSplitInitialState, GisMapSplitPanesValue, GisMapSplitState,
} from './context'

export interface GisMapSplitProviderProps {
    /** 처음 분할 수(마운트 때 한 번). 기본 1 */
    defaultCount?: GisMapSplitCount
    /** 분할 수가 바뀔 때(처음 값은 알리지 않음) */
    onCountChange?: (count: GisMapSplitCount) => void
    /** 화면 연동 처음 값. 기본 true */
    defaultSync?: boolean
    /**
     * 분할로 새로 만든 지도의 처음 상태. 기본 'view-basemap'(활성 지도의 시점·배경지도만 복사, 주제 레이어는 트리 기본값).
     * 지도가 만들어질 때 한 번만 읽는다. 줄였다가 다시 늘리면 닫힌 지도의 상태는 버려지고 새로 만든다
     */
    initialPaneState?: GisMapSplitInitialState
    /**
     * 1번 지도가 열 때 저장한 시작 화면을 적용했고 그 화면이 분할이면(count 2 이상) 분할도 되살린다. 기본 true.
     * 사용자가 그 전에 분할 수를 직접 바꿨거나, 값이 늦게 와서 적용되지 않았으면(late) 하지 않는다 — 이미 보고 있는 화면을 바꾸지 않는다
     */
    restoreStartView?: boolean
    children: ReactNode
}

/** 분할 최대 수 */
const MAX_PANES = 4
/** 보조 지도 자리 초기값(얼린 상수 — 0번 자리는 쓰지 않는다) */
const EMPTY_ENGINES: readonly (GisMapContextValue | null)[] = Object.freeze([null, null, null, null])

function clampCount(n: number | undefined): GisMapSplitCount {
    return n === 2 || n === 3 || n === 4 ? n : 1
}

function isCount(n: number): n is GisMapSplitCount {
    return n === 1 || n === 2 || n === 3 || n === 4
}

/** 보조 지도는 레이어 트리를 직접 받지 않고(1번이 받은 것을 setTree로 나눠 쓴다 → 트리 요청 늘지 않음) 시작 화면도 조회·적용하지 않는다(분할 복원은 이 Provider가 한다) */
function spawnConfig(config: Omit<GisMapConfig, 'target' | 'host'> | undefined): Omit<GisMapConfig, 'target' | 'host'> {
    return { ...config, layers: { ...config?.layers, autoLoad: false }, startView: { ...config?.startView, autoApply: false } }
}

export function GisMapSplitProvider({ defaultCount, onCountChange, defaultSync, initialPaneState, restoreStartView, children }: GisMapSplitProviderProps) {
    const outer = useContext(GisMapContext)
    const factory = useContext(GisMapFactoryContext)
    const available = outer !== null && factory !== null && factory.canSpawn

    const [rawCount, setRawCount] = useState<GisMapSplitCount>(() => clampCount(defaultCount))
    const [rawActive, setRawActive] = useState(0)
    const [sync, setSyncState] = useState(defaultSync ?? true)
    /** 분할 Provider가 소유한 보조 지도(번호 1~3)의 Context 값. 0번 자리는 쓰지 않는다 */
    const [engines, setEngines] = useState<readonly (GisMapContextValue | null)[]>(EMPTY_ENGINES)

    const count: GisMapSplitCount = available ? rawCount : 1
    const activeIndex = rawActive < count ? rawActive : 0

    // ── 보조 지도 등록 ───────────────────────────────────────────────
    const onEngine = useCallback(
        (index: number, value: GisMapContextValue | null, registered?: GisMapContextValue) => {
            setEngines(prev => {
                if (value === null && registered !== undefined && prev[index] !== registered) return prev
                if (prev[index] === value) return prev
                const next = prev.slice()
                next[index] = value
                return next
            })
        },
        [],
    )

    const outerValue = outer
    const panesValue = useMemo<GisMapSplitPanesValue>(() => {
        const list: (GisMapContextValue | null)[] = [outerValue]
        for (let i = 1; i < count; i++) list.push(engines[i])
        return { panes: list }
    }, [outerValue, engines, count])

    // 엔진 목록. 내용이 같으면 같은 배열을 돌려준다(host만 바뀌어도 전파·연동 effect가 다시 돌지 않게)
    const mapsRef = useRef<readonly (GisMap | null)[]>([])
    const maps = useMemo<readonly (GisMap | null)[]>(() => {
        const next = panesValue.panes.map(p => p?.map ?? null)
        const prev = mapsRef.current
        const result = prev.length === next.length && prev.every((m, i) => m === next[i]) ? prev : next
        mapsRef.current = result
        return result
    }, [panesValue])

    // ── 상태 바꾸기(안정된 함수 — 최신 값은 ref로 읽는다) ─────────────────────
    const latest = useRef({ available, count, activeIndex, maps })
    latest.current = { available, count, activeIndex, maps }
    const onCountChangeRef = useRef(onCountChange)
    onCountChangeRef.current = onCountChange
    const initialPaneStateRef = useRef(initialPaneState)
    initialPaneStateRef.current = initialPaneState
    /** 처음 상태를 이미 받은(또는 받을 필요 없는) 지도. WeakSet이라 destroy된 엔진은 저절로 사라진다 */
    const [initedPanes] = useState(() => new WeakSet<GisMap>())

    /** 시작 화면 복원: 아직 안 만들어진 보조 지도(번호 → 상태)와, 지도가 다 만들어진 뒤 정할 분할 수·활성 지도 */
    const pendingPanesRef = useRef(new Map<number, GisMapViewState>())
    const pendingRestoreRef = useRef<{ count: GisMapSplitCount; active: number } | null>(null)
    /** 사용자가 분할 수를 직접 바꿨다 → 자동 복원을 하지 않는다 */
    const touchedRef = useRef(false)

    const setCount = useCallback((next: GisMapSplitCount) => {
        if (!latest.current.available || !isCount(next)) return
        touchedRef.current = true
        pendingPanesRef.current.clear()
        pendingRestoreRef.current = null
        setRawCount(next)
        setRawActive(a => (a < next ? a : 0)) // 줄일 때 활성이 사라지면 1번이 활성
    }, [])

    const setActive = useCallback((index: number) => {
        const cur = latest.current
        if (!Number.isInteger(index) || index < 0 || index >= cur.count || index === cur.activeIndex) return
        if (!cur.maps[index]) return
        cur.maps[cur.activeIndex]?.tools.deactivate() // 이전 활성 지도의 도구를 끈다(그린 도형·측정 결과는 남는다)
        setRawActive(index)
    }, [])

    const setSync = useCallback((on: boolean) => setSyncState(!!on), [])

    // 복원이 끝나면(분할 수가 맞고 지도가 다 있고 보류한 상태가 없을 때) 활성 지도를 정한다
    const flushRestore = useCallback(() => {
        const want = pendingRestoreRef.current
        if (!want || pendingPanesRef.current.size > 0) return
        const cur = latest.current
        if (cur.count !== want.count) return
        for (let i = 0; i < want.count; i++) if (!cur.maps[i]) return
        pendingRestoreRef.current = null
        setRawActive(want.active < want.count ? want.active : 0)
    }, [])

    const applyStartView = useCallback((view: GisMapStartView) => {
        const cur = latest.current
        const first = cur.maps[0]
        if (first) applyViewState(first, view.panes[0])
        if (!cur.available) return
        const pending = pendingPanesRef.current
        pending.clear()
        const count = view.split.count
        for (let i = 1; i < count; i++) {
            const m = i < cur.count ? cur.maps[i] : null
            if (m) {
                initedPanes.add(m) // 이미 있는 지도는 지금 맞춘다(처음 상태 복사가 덮어쓰지 않게)
                applyViewState(m, view.panes[i])
            } else {
                pending.set(i, view.panes[i])
            }
        }
        pendingRestoreRef.current = { count, active: view.split.activeIndex }
        setRawCount(count)
        setSyncState(view.split.sync)
        flushRestore()
    }, [initedPanes, flushRestore])

    const prevCount = useRef(count)
    useEffect(() => {
        if (prevCount.current === count) return
        prevCount.current = count
        onCountChangeRef.current?.(count)
    }, [count])

    // ── 레이어 트리·펼침 전파 ─────────────────────────────────────────
    useEffect(() => {
        const live = maps.filter((m): m is GisMap => m !== null)
        if (live.length < 2) return
        // 늦게 생긴 지도에도 이미 받은 트리를 준다(같은 객체면 no-op이라 요청도 재구성도 없다)
        const withTree = live.find(m => m.layers.store.getState().tree !== null)
        const treeSource = withTree?.layers.store.getState().tree
        if (treeSource) for (const m of live) m.layers.setTree(treeSource)
        const base = live[0].layers.store.getState().expanded
        for (const m of live) m.layers.setExpanded(base)

        const offs: Array<() => void> = []
        for (const src of live) {
            const off = src.layers.store.subscribe((s, prev) => {
                if (s.tree && s.tree !== prev.tree) {
                    for (const o of live) if (o !== src) o.layers.setTree(s.tree)
                }
                if (s.expanded !== prev.expanded) {
                    for (const o of live) if (o !== src) o.layers.setExpanded(s.expanded)
                }
            })
            offs.push(off)
            offs.push(src.on('destroy', off))
        }
        return () => offs.forEach(off => off())
    }, [maps])

    // ── 새 지도의 처음 상태 ───────────────────────────────────────────
    // 새로 생긴 지도(1~3번)가 처음 보일 때 한 번만, 활성 지도에서 시점·배경지도(+선택: 레이어 체크·투명도)를 복사한다.
    // 위 트리 전파 effect가 먼저 돌아 새 지도에 트리가 있다(선언 순서). 주제 레이어 체크·투명도는 복사하지 않으므로 트리 기본값 그대로.
    useEffect(() => {
        const fresh: GisMap[] = []
        for (let i = 1; i < maps.length; i++) {
            const m = maps[i]
            if (m && !initedPanes.has(m)) fresh.push(m)
        }
        if (fresh.length === 0) return
        for (const m of fresh) initedPanes.add(m)
        // 시작 화면 복원이 맡긴 지도는 저장한 상태를 적용하고(복사 안 함), 나머지만 아래에서 복사한다
        const toCopy: GisMap[] = []
        for (let i = 1; i < maps.length; i++) {
            const m = maps[i]
            if (!m || !fresh.includes(m)) continue
            const saved = pendingPanesRef.current.get(i)
            if (!saved) {
                toCopy.push(m)
                continue
            }
            pendingPanesRef.current.delete(i)
            try {
                applyViewState(m, saved)
            } catch (err) {
                console.error('[gis-map] 저장한 시작 화면을 지도 ' + (i + 1) + '에 적용하지 못했다', err)
            }
        }
        flushRestore()
        const mode = initialPaneStateRef.current ?? 'view-basemap'
        if (mode === 'default' || toCopy.length === 0) return
        // 원본 = 활성 지도(같은 차례에 새로 생긴 지도는 원본이 될 수 없다 → 0번)
        const active = maps[latest.current.activeIndex]
        const source = active && !fresh.includes(active) ? active : maps[0]
        if (!source) return
        for (const m of toCopy) {
            try {
                copyMapState(source, m, { layers: mode === 'clone-layers' })
            } catch (err) {
                console.error('[gis-map] 새 지도의 처음 상태를 복사하지 못했다', err)
            }
        }
    }, [maps, initedPanes, flushRestore])

    // 분할 수가 바뀐 렌더 뒤에도 복원 마무리(지도가 이미 다 있었던 경우)
    useEffect(() => {
        flushRestore()
    }, [maps, count, flushRestore])

    // ── 열 때 저장한 시작 화면의 분할 복원 ─────────────────────────────
    // 1번 지도가 시작 화면을 적용했고(applied — 늦게 온 값은 적용 안 함) 분할이면 한 번만 되살린다. 사용자가 이미 분할 수를 바꿨으면 하지 않는다.
    // 자식 effect가 먼저 돌아 셸 안에서 적용하면 위 "처음 상태" 복사가 덮어쓰므로 복원은 이 Provider 안에서 한다
    const [restored] = useState(() => new WeakSet<GisMap>())
    const applyStartViewRef = useRef(applyStartView)
    applyStartViewRef.current = applyStartView
    const outerMap = outer?.map ?? null
    useEffect(() => {
        if (!outerMap || !available || restoreStartView === false) return
        const check = (s: StartViewState): void => {
            if (!s.applied || restored.has(outerMap)) return
            restored.add(outerMap)
            if (touchedRef.current || !s.value || s.value.view.split.count < 2) return
            applyStartViewRef.current(s.value.view)
        }
        check(outerMap.startView.store.getState())
        return outerMap.startView.store.subscribe(s => check(s))
    }, [outerMap, available, restoreStartView, restored])

    // ── 오버레이 삭제 전파 ───────────────────────────────────────────
    // 한 지도의 목록에서 GeoTIFF·나만의지도를 삭제하면(서버에서도 지워짐) 다른 지도에 켜 둔 같은 레이어도 내린다
    useEffect(() => {
        const live = maps.filter((m): m is GisMap => m !== null)
        if (live.length < 2) return
        const offs: Array<() => void> = []
        for (const src of live) {
            const off = src.on('overlayremoved', e => {
                for (const o of live) {
                    if (o === src) continue
                    if (e.kind === 'vector') o.vector.hide(e.id)
                    else o.raster.hide(e.id)
                }
            })
            offs.push(off)
            offs.push(src.on('destroy', off))
        }
        return () => offs.forEach(off => off())
    }, [maps])

    // ── 화면 연동 ────────────────────────────────────────────────────
    useEffect(() => {
        if (!sync || count < 2) return
        const live = maps.filter((m): m is GisMap => m !== null)
        if (live.length < 2) return
        try {
            const link = linkViews(live, { leader: maps[activeIndex] ?? undefined })
            return () => link.destroy()
        } catch (err) {
            console.error('[gis-map] 화면 연동을 켜지 못했다', err)
            return undefined
        }
    }, [sync, count, maps, activeIndex])

    // ── 공개 상태 ────────────────────────────────────────────────────
    const state = useMemo<GisMapSplitState>(
        () => ({ available, count, panes: maps, activeIndex, sync, setCount, setActive, setSync, applyStartView }),
        [available, count, maps, activeIndex, sync, setCount, setActive, setSync, applyStartView],
    )

    // 활성 지도. 0번이면 바깥 값을 그대로(같은 참조) 내려 보낸다
    const activeValue = activeIndex === 0 ? outer : (panesValue.panes[activeIndex] ?? outer)

    // 보조 지도 생성 재료(번호별 setup은 아래에서 한 번만 만든다)
    const config = useMemo(() => (factory ? spawnConfig(factory.config) : undefined), [factory])
    const setups = useMemo(() => {
        const list: Array<(m: GisMap) => void> = []
        if (!factory) return list
        for (let i = 0; i < MAX_PANES; i++) {
            const info: GisMapSetupInfo = Object.freeze({ pane: i })
            list.push(m => factory.setup(m, info))
        }
        return list
    }, [factory])

    const spawned: ReactNode[] = []
    if (available && factory && config) {
        for (let i = 1; i < count; i++) {
            spawned.push(
                <GisMapProvider key={i} config={config} host={factory.host} setup={setups[i]}>
                    <EngineTap index={i} onEngine={onEngine} />
                </GisMapProvider>,
            )
        }
    }

    return (
        <GisMapSplitContext.Provider value={state}>
            <GisMapSplitPanesContext.Provider value={panesValue}>
                {spawned}
                <GisMapContext.Provider value={activeValue}>{children}</GisMapContext.Provider>
            </GisMapSplitPanesContext.Provider>
        </GisMapSplitContext.Provider>
    )
}
