// 지도 중심의 지역명(지도 인스턴스마다 하나). 옛 hooks/map/useRegionName.ts를 React 없이 옮겼다.
//   - watch()를 부른 곳이 하나라도 있을 때만 지도 이동을 지켜본다(참조 카운트). 0 → 1이 되는 순간 한 번 바로 조회
//   - movestart → loading: true, moveend → 지도 중심(경위도)으로 RegionNameSource.nameAt 조회
//   - 결과 없음(null)·실패 → '-', 조회가 끝나면 loading: false
// 번지 제거(정규식)는 소스(어댑터)가 한다.
import type OlMap from 'ol/Map'
import { toLonLat } from 'ol/proj'
import type { RegionNameSource } from '../sources'
import { createStore } from '../store'
import type { ReadableStore, WritableStore } from '../store'

export interface RegionState {
    /** '' = 아직 모름(옛 초기값), '-' = 결과 없음/실패 */
    name: string
    loading: boolean
}

export const EMPTY_REGION_STATE: Readonly<RegionState> = Object.freeze({ name: '', loading: false })

export interface RegionWatcher {
    readonly store: ReadableStore<RegionState>
    /** 참조 카운트. 구독자가 있을 때만 moveend마다 조회. 반환값 = 해제(여러 번 불러도 한 번만 센다) */
    watch(): () => void
}

export interface RegionWatcherOptions {
    olMap: OlMap
    source?: RegionNameSource
}

export class RegionWatcherImpl implements RegionWatcher {
    readonly store: ReadableStore<RegionState>

    private readonly state: WritableStore<RegionState>
    private readonly opts: RegionWatcherOptions
    private watchers = 0
    private destroyed = false

    private readonly handleMoveStart = (): void => {
        if (this.destroyed) return
        this.state.setState({ loading: true })
    }

    private readonly handleMoveEnd = (): void => {
        if (this.destroyed) return
        const view = this.opts.olMap.getView()
        const center = view.getCenter()
        if (!center) return
        const [lon, lat] = toLonLat(center, view.getProjection())
        void this.fetchRegion(lon, lat)
    }

    constructor(opts: RegionWatcherOptions) {
        this.opts = opts
        this.state = createStore<RegionState>({ name: '', loading: false })
        this.store = this.state
    }

    watch(): () => void {
        if (this.destroyed || !this.opts.source) return () => {}
        this.watchers++
        if (this.watchers === 1) this.attach()
        let released = false
        return () => {
            if (released) return
            released = true
            this.watchers--
            if (this.watchers === 0) this.detach()
        }
    }

    private attach(): void {
        const { olMap } = this.opts
        olMap.on('movestart', this.handleMoveStart)
        olMap.on('moveend', this.handleMoveEnd)
        this.handleMoveEnd()
    }

    private detach(): void {
        const { olMap } = this.opts
        olMap.un('movestart', this.handleMoveStart)
        olMap.un('moveend', this.handleMoveEnd)
    }

    private async fetchRegion(lon: number, lat: number): Promise<void> {
        const source = this.opts.source
        if (!source) return
        let name: string
        try {
            name = (await source.nameAt(lon, lat)) ?? '-'
        } catch {
            name = '-'
        }
        if (this.destroyed) return
        // 옛 setRegion + finally setLoading(false)를 한 번에
        this.state.setState({ name, loading: false })
    }

    /** 엔진 destroy용: 지켜보던 이벤트를 떼고 늦은 응답을 버린다 */
    destroy(): void {
        if (this.destroyed) return
        if (this.watchers > 0) this.detach()
        this.watchers = 0
        this.destroyed = true
        this.state.destroy()
    }
}
