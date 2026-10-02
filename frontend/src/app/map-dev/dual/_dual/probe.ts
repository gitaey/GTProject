// /map-dev/dual 검증 도구(앱 코드): 엔진 상태 스냅샷·비교, 엔진 변화 기록, 요청 수 세기.
// 엔진은 공개 API로만 읽는다(store.getState·olMap 컬렉션). 기록 저장소는 페이지마다 하나(createDevLog) — 모듈 전역 상태 없음.
import { toLonLat } from 'ol/proj'
import type { GisMap } from '@gtp/gis-map/core'

export type Snapshot = Readonly<Record<string, string>>

const ids = (xs: readonly number[]) => (xs.length ? xs.join(',') : '없음')

/** 지도 하나의 지금 상태(비교하기 쉽게 전부 글자로) */
export function snapshotOf(map: GisMap): Snapshot {
    const view = map.olMap.getView()
    const center = view.getCenter()
    const lonLat = center ? toLonLat(center, view.getProjection()) : null
    const tools = map.tools.store.getState()
    const draw = map.draw.store.getState()
    const layers = map.layers.store.getState()
    const rendered = map.layers.allLayers().filter(l => map.layers.isRendered(l)).map(l => l.id)
    return {
        '엔진 id': map.id,
        '테마 주 색': map.theme.primary,
        '켠 도구': tools.activeTool,
        '반경 입력(m)': tools.radiusMeters === null ? '—' : String(tools.radiusMeters),
        '그리기 색': draw.style.color,
        '그리기 굵기': String(draw.style.strokeWidth),
        '보이는 레이어 id': ids(rendered),
        '배경지도 모드': layers.basemapMode,
        'GeoTIFF 표시 id': ids(map.raster.store.getState().visibleIds),
        '나만의지도 표시 id': ids(map.vector.store.getState().visibleIds),
        '필지 강조': map.parcel.getOlLayer() ? '있음' : '없음',
        'OL 레이어 수': String(map.olMap.getLayers().getLength()),
        'interaction 수': String(map.olMap.getInteractions().getLength()),
        'overlay 수': String(map.olMap.getOverlays().getLength()),
        '중심(경위도)': lonLat ? `${lonLat[0].toFixed(4)}, ${lonLat[1].toFixed(4)}` : '—',
        '줌': (view.getZoom() ?? 0).toFixed(2),
        '지역명': map.region.store.getState().name || '—',
        '바람길 플러그인': map.getPlugin('wind') ? '설치됨' : '없음',
    }
}

/** before → after에서 값이 바뀐 항목('항목: 전 → 후') */
export function diffSnapshots(before: Snapshot, after: Snapshot): string[] {
    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
    return keys.filter(k => before[k] !== after[k]).map(k => `${k}: ${before[k] ?? '—'} → ${after[k] ?? '—'}`)
}

/**
 * 엔진의 변화를 구독한다(도구·그리기·레이어·GeoTIFF·나만의지도·지역명 스토어, 초기화·호스트 변경·정리 이벤트,
 * 지도 이동 끝·OL 레이어/interaction/overlay 수 변화). 변화마다 onEvent(글)를 부른다. 반환값 = 구독 전부 해제
 */
export function watchEngine(map: GisMap, onEvent: (text: string) => void): () => void {
    const offs: Array<() => void> = []
    offs.push(map.tools.store.subscribe((s, p) => {
        if (s.activeTool !== p.activeTool) onEvent(`도구 ${p.activeTool} → ${s.activeTool}`)
        if (s.radiusMeters !== p.radiusMeters) onEvent(`반경 입력 ${p.radiusMeters ?? '—'} → ${s.radiusMeters ?? '—'}`)
    }))
    offs.push(map.draw.store.subscribe((s, p) => {
        if (s.style !== p.style) onEvent(`그리기 스타일 색 ${s.style.color} 굵기 ${s.style.strokeWidth}`)
        if (s.selectedCount !== p.selectedCount) onEvent(`선택 도형 ${s.selectedCount}개`)
    }))
    offs.push(map.layers.store.subscribe((s, p) => {
        if (s.tree !== p.tree) onEvent(`레이어 트리 ${s.tree ? '받음' : '비움'}`)
        if (s.visible !== p.visible) onEvent(`레이어 체크 바뀜(사용자 값 ${Object.keys(s.visible).length}개)`)
        if (s.opacity !== p.opacity) onEvent('레이어 투명도 바뀜')
        if (s.basemapMode !== p.basemapMode) onEvent(`배경지도 ${p.basemapMode} → ${s.basemapMode}`)
        if (s.error !== p.error && s.error) onEvent(`레이어 트리 오류: ${s.error}`)
    }))
    offs.push(map.raster.store.subscribe(s => onEvent(`GeoTIFF 표시 [${ids(s.visibleIds)}]`)))
    offs.push(map.vector.store.subscribe((s, p) => {
        if (s.visibleIds !== p.visibleIds) onEvent(`나만의지도 표시 [${ids(s.visibleIds)}]`)
    }))
    offs.push(map.region.store.subscribe((s, p) => {
        if (s.name !== p.name && s.name) onEvent(`지역명 ${s.name}`)
    }))
    offs.push(map.on('clear', () => onEvent('전체 초기화(clear 이벤트)')))
    offs.push(map.on('hostchange', () => onEvent('호스트 값 바뀜(hostchange)')))
    offs.push(map.on('destroy', () => onEvent('엔진 정리(destroy)')))
    const ol = map.olMap
    const onMove = () => {
        const v = ol.getView()
        const c = v.getCenter()
        const ll = c ? toLonLat(c, v.getProjection()) : [0, 0]
        onEvent(`이동 끝 ${ll[0].toFixed(4)}, ${ll[1].toFixed(4)} 줌 ${(v.getZoom() ?? 0).toFixed(2)}`)
    }
    ol.on('moveend', onMove)
    offs.push(() => ol.un('moveend', onMove))
    for (const [name, coll] of [['OL 레이어', ol.getLayers()], ['interaction', ol.getInteractions()], ['overlay', ol.getOverlays()]] as const) {
        const onLen = () => onEvent(`${name} 수 ${coll.getLength()}`)
        coll.on('change:length', onLen)
        offs.push(() => coll.un('change:length', onLen))
    }
    return () => offs.forEach(off => off())
}

// ── 기록 저장소(페이지마다 하나) ─────────────────────────────────────────────

export interface DevLogEntry {
    seq: number
    time: string
    side: string
    text: string
}

export interface DevLog {
    getEntries(): readonly DevLogEntry[]
    subscribe(listener: () => void): () => void
    push(side: string, text: string): void
    clear(): void
}

const LOG_LIMIT = 300

export function createDevLog(): DevLog {
    let entries: readonly DevLogEntry[] = []
    let seq = 0
    const listeners = new Set<() => void>()
    const notify = () => Array.from(listeners).forEach(l => l())
    return {
        getEntries: () => entries,
        subscribe(listener) {
            listeners.add(listener)
            return () => {
                listeners.delete(listener)
            }
        },
        push(side, text) {
            const d = new Date()
            const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`
            entries = [{ seq: ++seq, time, side, text }, ...entries].slice(0, LOG_LIMIT)
            notify()
        },
        clear() {
            entries = []
            notify()
        },
    }
}

// ── 요청 수(브라우저 Resource Timing) ─────────────────────────────────────────

/** 페이지를 연 뒤 나간 fetch 요청을 경로별로 센다(/api/·/proxy/만, 쿼리 제외) */
export function countRequests(): Record<string, number> {
    const out: Record<string, number> = {}
    if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') return out
    for (const e of performance.getEntriesByType('resource') as PerformanceResourceTiming[]) {
        if (e.initiatorType !== 'fetch') continue
        let path: string
        try {
            path = new URL(e.name).pathname
        } catch {
            continue
        }
        if (!path.startsWith('/api/') && !path.startsWith('/proxy/')) continue
        const key = path.replace(/[/][0-9]+([/]|$)/g, '/{id}$1')
        out[key] = (out[key] ?? 0) + 1
    }
    return out
}
