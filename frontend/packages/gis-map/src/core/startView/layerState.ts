// 시작 화면에 저장하는 "켜 둔 레이어" 읽기·되살리기. React 없음 — UMD에서도 쓴다.
//   · 읽기(captureLayerState): 레이어 목록 체크·투명도 + 켜 둔 나만의지도·GeoTIFF id. 번호만 담는다
//   · 되살리기(restoreLayerState): 레이어 트리가 도착하면 체크를 맞추고, 나만의지도·TIFF는 목록을 한 번 받아
//     살아 있는(READY) 것만 켠다. 지워졌거나 공유가 끊긴 것·아직 처리 중인 것은 건너뛰고 개수만 알린다.
//   · 지도는 움직이지 않는다(위치는 applyViewState가 정한다 — TIFF도 fit: false)
import type { GisMap } from '../GisMap'
import type { GisMapLayerState } from './types'

export interface LayerRestoreResult {
    /** 켜지 못하고 건너뛴 레이어 수(트리에 없음·지워짐·공유 끊김·처리 중·목록 조회 실패) */
    skipped: number
}

const MAX_IDS = 300

function uniqueIds(ids: readonly number[]): number[] {
    return Array.from(new Set(ids)).slice(0, MAX_IDS)
}

/** 지금 지도에 켜 둔 레이어. 트리가 아직 없으면 목록 체크는 비어 있다 */
export function captureLayerState(map: GisMap): GisMapLayerState {
    const tree = map.layers.captureState()
    return {
        on: uniqueIds(tree.on),
        opacity: tree.opacity.slice(0, MAX_IDS),
        mymap: uniqueIds(map.vector.store.getState().visibleIds),
        tiff: uniqueIds(map.raster.store.getState().visibleIds),
    }
}

/** 이 상태에 되살릴 것이 하나라도 있나 */
export function hasLayerState(state: GisMapLayerState | undefined): boolean {
    return !!state && (state.on.length > 0 || state.opacity.length > 0 || state.mymap.length > 0 || state.tiff.length > 0)
}

function waitForTree(map: GisMap): Promise<boolean> {
    return new Promise(resolve => {
        if (map.layers.store.getState().tree) {
            resolve(true)
            return
        }
        const off = map.layers.store.subscribe(s => {
            if (!s.tree) return
            done(true)
        })
        const offDestroy = map.on('destroy', () => done(false))
        const timer = setTimeout(() => done(false), 15000)
        function done(ok: boolean): void {
            off()
            offDestroy()
            clearTimeout(timer)
            resolve(ok)
        }
    })
}

function waitForCatalog(store: { getState(): { loading: boolean }; subscribe(fn: (s: { loading: boolean }) => void): () => void }): Promise<void> {
    return new Promise(resolve => {
        if (!store.getState().loading) {
            resolve()
            return
        }
        const timer = setTimeout(done, 15000)
        const off = store.subscribe(s => {
            if (!s.loading) done()
        })
        function done(): void {
            off()
            clearTimeout(timer)
            resolve()
        }
    })
}

/**
 * 저장한 레이어를 지도에 되살린다. 실패해도 던지지 않는다(건너뛴 것으로 센다).
 * 이미 켜져 있는 것은 그대로 두고, 저장에 없는데 켜져 있는 레이어 목록 항목은 끈다(저장한 모습과 같아지게).
 */
export async function restoreLayerState(map: GisMap, state: GisMapLayerState): Promise<LayerRestoreResult> {
    let skipped = 0

    // 1) 레이어 목록 체크·투명도: 트리가 도착하면 한 번에 맞춘다(저장한 것이 "다 꺼짐"이어도 맞춘다)
    const hasTree = await waitForTree(map)
    if (hasTree) {
        const r = map.layers.applyState({ on: state.on, opacity: state.opacity })
        if (r) skipped += r.missing
    } else {
        skipped += state.on.length
    }

    // 2) 나만의지도: 목록을 한 번 받아 살아 있는 것만 켠다(목록을 받아야 이름·스타일도 알게 된다)
    if (state.mymap.length > 0) {
        const catalog = map.vector.openCatalog({ autoLoad: true })
        try {
            await waitForCatalog(catalog.store)
            const items = new Map(catalog.store.getState().items.map(i => [i.id, i]))
            for (const id of state.mymap) {
                const item = items.get(id)
                if (!item || item.status !== 'READY') {
                    skipped++
                    continue
                }
                void map.vector.show(id).catch(() => {})
            }
        } finally {
            catalog.dispose()
        }
    }

    // 3) GeoTIFF: 같은 방식. 위치는 이미 시작 화면이 정했으므로 이동하지 않는다
    if (state.tiff.length > 0) {
        const catalog = map.raster.openCatalog({ autoLoad: true })
        try {
            await waitForCatalog(catalog.store)
            const items = new Map(catalog.store.getState().items.map(i => [i.id, i]))
            for (const id of state.tiff) {
                const item = items.get(id)
                if (!item || item.status !== 'READY') {
                    skipped++
                    continue
                }
                map.raster.show(item, { fit: false })
            }
        } finally {
            catalog.dispose()
        }
    }

    return { skipped }
}
