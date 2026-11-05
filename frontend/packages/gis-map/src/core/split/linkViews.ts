// 화면 연동: 여러 지도의 중심·해상도·회전을 서로 맞춘다(React 없음 — UMD에서도 쓴다).
//   - 뷰 이벤트(change:center·change:resolution·change:rotation)를 듣고 값을 다른 지도 뷰에 복사한다. View 객체는 바꾸지 않는다(붙이기 지도에도 안전).
//   - 맞추는 동안 다른 지도도 같은 이벤트를 내므로 인스턴스 필드 applying 깃발로 무시한다(무한 반복 방지). 모듈 전역 변수 없음.
//   - 출렁임 처리: constrainResolution 뷰에 setResolution을 그대로 넣으면 OL이 정수 줌으로 반올림한다.
//     기준 지도가 움직이는 중(getAnimating·getInteracting)이면 따라가는 뷰에 beginInteraction()을 한 번 걸어 반올림을 미루고,
//     기준 지도가 멈추면(moveend, 또는 멈춘 상태의 변경) endInteraction(0)으로 즉시 확정한다.
//   - ol는 타입만 import한다(값 import 없음 → olCompat.REQUIRED_OL_API 변경 없음). 뷰 메서드는 인스턴스로 호출한다.
import type { Coordinate } from 'ol/coordinate'
import type View from 'ol/View'
import type { GisMap } from '../GisMap'

export interface LinkViewsOptions {
    /** 처음 맞출 기준 지도. 기본 maps[0] */
    leader?: GisMap
}

export interface ViewLink {
    /** 지금 묶인 지도(destroy된 엔진은 저절로 빠진다). 새 배열을 돌려준다 */
    readonly maps: readonly GisMap[]
    /** 지도를 묶음에 넣고 지금 기준 지도(처음엔 leader, 이후엔 마지막으로 움직인 지도)의 시점으로 맞춘다. 이미 있으면 무시. 뷰 좌표계가 다르면 Error */
    add(map: GisMap): void
    remove(map: GisMap): void
    /** 리스너 전부 해제. 여러 번 불러도 된다 */
    destroy(): void
}

interface ViewState {
    center: Coordinate
    resolution: number
    rotation: number
}

interface Entry {
    map: GisMap
    /** 지금 리스너를 건 뷰(호스트가 뷰를 갈아 끼우면 바뀐다) */
    view: View | null
    onViewEvent: () => void
    onChangeView: () => void
    onMoveEnd: () => void
    offDestroy: () => void
}

function readState(view: View): ViewState | null {
    const center = view.getCenter()
    const resolution = view.getResolution()
    if (!center || resolution === undefined) return null
    return { center, resolution, rotation: view.getRotation() }
}

function projectionCode(view: View): string {
    return view.getProjection().getCode()
}

class ViewLinkImpl implements ViewLink {
    private readonly entries: Entry[] = []
    /** 지금 맞출 기준이 되는 지도 */
    private reference: GisMap | null = null
    /** 우리가 뷰 값을 쓰는 중(이때 오는 뷰 이벤트는 무시) */
    private applying = false
    /** 따라가는 뷰에 beginInteraction을 건 지도 → 그때의 뷰(뷰가 바뀌어도 그 뷰에서 풀어야 한다) */
    private readonly held = new Map<GisMap, View>()
    /** held를 건 원인이 된 움직이는 지도 */
    private holdSource: GisMap | null = null
    private destroyed = false

    get maps(): readonly GisMap[] {
        return this.entries.map(e => e.map)
    }

    init(maps: readonly GisMap[], leader: GisMap | undefined): void {
        const first = leader && maps.includes(leader) ? leader : maps[0]
        // 기준 지도를 먼저 넣어 두면 나머지가 그 시점으로 맞는다
        if (first) this.add(first)
        for (const m of maps) this.add(m)
    }

    add(map: GisMap): void {
        if (this.destroyed || this.find(map)) return
        const view = map.olMap.getView()
        const base = this.entries[0]?.view
        if (base && projectionCode(base) !== projectionCode(view)) {
            throw new Error(
                '[gis-map] linkViews: 뷰 좌표계가 다른 지도는 묶을 수 없다(' + projectionCode(base) + ' ≠ ' + projectionCode(view) + ')',
            )
        }
        const entry: Entry = {
            map,
            view: null,
            onViewEvent: () => this.handleViewEvent(map),
            onChangeView: () => this.handleChangeView(entry),
            onMoveEnd: () => this.handleMoveEnd(map),
            offDestroy: () => {},
        }
        this.entries.push(entry)
        this.attachView(entry)
        map.olMap.on('change:view', entry.onChangeView)
        map.olMap.on('moveend', entry.onMoveEnd)
        entry.offDestroy = map.on('destroy', () => this.remove(map))
        if (!this.reference) {
            this.reference = map
            return
        }
        this.propagate(this.reference, map)
    }

    remove(map: GisMap): void {
        const index = this.entries.findIndex(e => e.map === map)
        if (index < 0) return
        const entry = this.entries[index]
        this.entries.splice(index, 1)
        this.detach(entry)
        if (this.holdSource === map) {
            this.releaseHolds()
        } else {
            this.releaseHold(map)
        }
        if (this.reference === map) this.reference = this.entries[0]?.map ?? null
    }

    destroy(): void {
        if (this.destroyed) return
        this.destroyed = true
        this.releaseHolds()
        this.entries.splice(0).forEach(e => this.detach(e))
        this.reference = null
    }

    // ── 내부 ────────────────────────────────────────────────────────────

    private find(map: GisMap): Entry | undefined {
        return this.entries.find(e => e.map === map)
    }

    private attachView(entry: Entry): void {
        this.detachView(entry)
        const view = entry.map.olMap.getView()
        view.on('change:center', entry.onViewEvent)
        view.on('change:resolution', entry.onViewEvent)
        view.on('change:rotation', entry.onViewEvent)
        entry.view = view
    }

    private detachView(entry: Entry): void {
        const view = entry.view
        if (!view) return
        view.un('change:center', entry.onViewEvent)
        view.un('change:resolution', entry.onViewEvent)
        view.un('change:rotation', entry.onViewEvent)
        entry.view = null
    }

    private detach(entry: Entry): void {
        this.detachView(entry)
        entry.map.olMap.un('change:view', entry.onChangeView)
        entry.map.olMap.un('moveend', entry.onMoveEnd)
        entry.offDestroy()
    }

    private handleViewEvent(source: GisMap): void {
        if (this.applying || this.destroyed) return
        this.reference = source
        this.propagate(source)
    }

    private handleChangeView(entry: Entry): void {
        if (this.destroyed) return
        // 뷰가 바뀐 지도에 다시 걸고, 기준 지도면 나머지를 그쪽에 맞추고 아니면 그 지도를 기준에 맞춘다
        this.releaseHold(entry.map)
        this.attachView(entry)
        if (this.applying || !this.reference) return
        if (this.reference === entry.map) this.propagate(entry.map)
        else this.propagate(this.reference, entry.map)
    }

    private handleMoveEnd(map: GisMap): void {
        if (this.destroyed || this.holdSource !== map) return
        // 기준 지도가 멈췄다 → 마지막 값을 맞추고 걸어 둔 interaction을 푼다(propagate가 멈춘 상태면 풀어 준다)
        this.propagate(map)
    }

    /** source의 시점을 다른 지도(only가 있으면 그 지도만)에 복사한다 */
    private propagate(source: GisMap, only?: GisMap): void {
        const srcView = source.olMap.getView()
        const state = readState(srcView)
        if (!state) return
        const moving = srcView.getAnimating() || srcView.getInteracting()
        if (this.holdSource !== null && this.holdSource !== source) this.releaseHolds()
        const srcCode = projectionCode(srcView)
        const was = this.applying
        this.applying = true
        try {
            for (const e of this.entries) {
                if (e.map === source || (only && e.map !== only)) continue
                const view = e.map.olMap.getView()
                if (projectionCode(view) !== srcCode) continue
                if (moving && !this.held.has(e.map)) {
                    view.beginInteraction()
                    this.held.set(e.map, view)
                    this.holdSource = source
                }
                this.writeState(view, state)
            }
            if (!moving) this.releaseHolds()
        } finally {
            this.applying = was
        }
    }

    private writeState(view: View, s: ViewState): void {
        // 해상도 → 중심 → 회전 순(중심 제약이 해상도에 따라 달라진다). 같은 값이면 쓰지 않아 불필요한 이벤트를 막는다
        if (!Object.is(view.getResolution(), s.resolution)) view.setResolution(s.resolution)
        const c = view.getCenter()
        if (!c || c[0] !== s.center[0] || c[1] !== s.center[1]) view.setCenter(s.center)
        if (!Object.is(view.getRotation(), s.rotation)) view.setRotation(s.rotation)
    }

    private releaseHold(map: GisMap): void {
        const view = this.held.get(map)
        if (!view) return
        this.held.delete(map)
        const was = this.applying
        this.applying = true
        try {
            view.endInteraction(0)
        } finally {
            this.applying = was
        }
    }

    private releaseHolds(): void {
        for (const map of Array.from(this.held.keys())) this.releaseHold(map)
        this.holdSource = null
    }
}

/** 지도들의 중심·해상도·회전을 서로 맞춘다(뷰 이벤트 복사, View 객체는 바꾸지 않음 — 붙이기 지도에도 안전) */
export function linkViews(maps: readonly GisMap[], options: LinkViewsOptions = {}): ViewLink {
    const link = new ViewLinkImpl()
    try {
        link.init(maps, options.leader)
    } catch (err) {
        link.destroy() // 좌표계가 다른 지도가 섞여 있으면 이미 건 리스너를 모두 걷고 던진다
        throw err
    }
    return link
}
