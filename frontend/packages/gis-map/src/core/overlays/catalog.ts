// 목록 + 상태 폴링(GeoTIFF·나만의지도 공용). 옛 ImagePanel·MyMapPanel의 fetchList / startPolling / handleDelete 로직을
// React 없이 옮겼다. 목록 하나 = 패널 한 번 열림(옛 컴포넌트 state와 같은 수명). 표시 상태(체크)는 여기 없고
// 오버레이 컨트롤러(엔진 인스턴스)에 있다 → 패널을 닫았다 열어도 체크 = 지도.
//   - 처음 상태 loading: true(옛 useState(true)) → load()가 끝나면 false. 다시 load()해도 loading을 true로 돌리지 않는다(옛 fetchList)
//   - PROCESSING 항목이 있을 때만 3초 간격 폴링. 틱마다 PROCESSING 항목마다 status 1번, 없으면 그 틱에서 멈춘다
//   - dispose() 뒤에는 타이머가 없고, 늦게 온 응답은 버린다
import { createStore } from '../store'
import type { ReadableStore, WritableStore } from '../store'
import { ignoreServerFailure } from '../lib/serverFailure'

/** 옛 패널의 폴링 간격(ms) */
export const CATALOG_POLL_INTERVAL_MS = 3000

export interface CatalogItemBase {
    id: number
    status: string
}

export interface CatalogState<T> {
    items: readonly T[]
    /** 첫 load()가 끝나기 전 true */
    loading: boolean
    /** 마지막 목록 조회 실패 메시지(성공하면 null). 옛 화면은 표시하지 않았다 */
    error: string | null
}

export interface Catalog<T, S extends CatalogState<T>> {
    readonly store: ReadableStore<S>
    /** 목록을 다시 받는다. 실패해도 throw하지 않는다(state.error) */
    load(): Promise<void>
    /**
     * 서버에 삭제를 요청한 뒤 목록·지도에서 뺀다. 옛 동작 그대로 서버의 실패 응답은 보지 않는다
     * (네트워크 오류만 throw — 이때는 목록을 건드리지 않는다)
     */
    remove(id: number): Promise<void>
    /** 폴링 타이머를 멈추고 늦은 응답을 버린다(패널 닫힘·엔진 destroy) */
    dispose(): void
    readonly disposed: boolean
}

export interface CatalogOptions<T extends CatalogItemBase, St extends { status: string }> {
    list?: () => Promise<T[]>
    status?: (id: number) => Promise<St>
    remove?: (id: number) => Promise<void>
    /** status 응답이 PROCESSING이 아닐 때 항목에 반영 */
    merge: (item: T, status: St) => T
    /** 목록에서 뺄 때(삭제) 지도 표시도 끈다 */
    onRemoved: (id: number) => void
    /** dispose될 때(엔진이 열린 목록을 추적하는 데 씀) */
    onDisposed: () => void
    pollIntervalMs?: number
}

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err)
}

export class CatalogBase<T extends CatalogItemBase, St extends { status: string }, S extends CatalogState<T>>
implements Catalog<T, S> {
    readonly store: ReadableStore<S>

    protected readonly state: WritableStore<S>
    protected readonly opts: CatalogOptions<T, St>
    private timer: ReturnType<typeof setInterval> | null = null
    private isDisposed = false

    constructor(initial: S, opts: CatalogOptions<T, St>) {
        this.state = createStore<S>(initial)
        this.store = this.state
        this.opts = opts
    }

    get disposed(): boolean {
        return this.isDisposed
    }

    async load(): Promise<void> {
        if (this.isDisposed) return
        const list = this.opts.list
        if (!list) {
            this.patch({ loading: false })
            return
        }
        try {
            const items = await list()
            if (this.isDisposed) return
            this.patch({ items, loading: false, error: null })
        } catch (err) {
            if (this.isDisposed) return
            this.patch({ loading: false, error: errorMessage(err) })
        }
    }

    async remove(id: number): Promise<void> {
        if (this.isDisposed) return
        const remove = this.opts.remove
        if (remove) await ignoreServerFailure(remove(id))
        // 옛 순서: 지도에서 떼기 → 체크 해제 → 목록에서 빼기(패널이 이미 닫혔어도 지도는 정리한다)
        this.opts.onRemoved(id)
        if (this.isDisposed) return
        this.setItems(this.state.getState().items.filter(i => i.id !== id))
    }

    dispose(): void {
        if (this.isDisposed) return
        this.isDisposed = true
        this.stopPolling()
        this.state.destroy()
        this.opts.onDisposed()
    }

    // ── 하위 클래스용 ───────────────────────────────────────────────────

    /** 공통 필드(items·loading·error)나 하위 클래스 필드 일부를 바꾼다 */
    protected patch(part: Partial<CatalogState<T>> | Partial<S>): void {
        if (this.isDisposed) return
        this.state.setState(part as unknown as Partial<S>)
        if ('items' in part) this.ensurePolling()
    }

    protected setItems(items: readonly T[]): void {
        this.patch({ items })
    }

    /** 옛 effect `[items]` + startPolling: PROCESSING 항목이 있으면(그리고 아직 안 돌고 있으면) 폴링 시작 */
    protected ensurePolling(): void {
        if (this.isDisposed || this.timer !== null) return
        if (!this.opts.status) return
        if (!this.state.getState().items.some(i => i.status === 'PROCESSING')) return
        this.timer = setInterval(() => this.tick(), this.opts.pollIntervalMs ?? CATALOG_POLL_INTERVAL_MS)
    }

    private stopPolling(): void {
        if (this.timer === null) return
        clearInterval(this.timer)
        this.timer = null
    }

    /** 옛 setInterval 콜백: PROCESSING이 없으면 멈추고, 있으면 항목마다 status를 부른다(응답을 기다리지 않음) */
    private tick(): void {
        if (this.isDisposed) {
            this.stopPolling()
            return
        }
        const processing = this.state.getState().items.filter(i => i.status === 'PROCESSING')
        if (processing.length === 0) {
            this.stopPolling()
            return
        }
        const status = this.opts.status
        if (!status) return
        processing.forEach(item => {
            status(item.id).then(s => {
                if (this.isDisposed || s.status === 'PROCESSING') return
                this.setItems(this.state.getState().items.map(i => (i.id === item.id ? this.opts.merge(i, s) : i)))
            }).catch(() => {
                // 옛 코드: success:false·네트워크 오류 모두 조용히 넘어가고 다음 틱에 다시 묻는다
            })
        })
    }
}
