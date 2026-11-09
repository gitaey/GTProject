// 시작 화면 저장소(StartViewSource)와 엔진 사이의 상태·동작. React 없음.
//   - 엔진이 지도를 만들면(owned) 저장값을 불러온다. 동기 값이면 첫 그림 전에 바로 적용하고, 비동기면 지도 그림(setTarget)을
//     최대 waitMs 동안 보류했다가 값이 오면 적용 → 첫 그림이 곧 시작 화면. 늦게 온 값은 store에만 두고 지도는 움직이지 않는다(late).
//   - 요청 시간 제한(조회 5초·저장 10초)은 어댑터 몫이다(GisHttpError 408). 여기서는 상태로 옮기기만 한다.
//   - 로그인 사용자가 바뀌면(hostchange) 이전 사용자의 값을 비운다(지도는 움직이지 않는다).
import { GisHttpError } from '../http'
import type { GisMapHost } from '../host'
import type { GisMap } from '../GisMap'
import { createStore } from '../store'
import type { ReadableStore, WritableStore } from '../store'
import { applyViewState, parseStartView } from './viewState'
import { EMPTY_START_VIEW_STATE } from './types'
import type {
    GisMapStartView, StartViewErrorKind, StartViewOp, StartViewSource, StartViewState, StoredStartView,
} from './types'

export interface StartViewController {
    readonly store: ReadableStore<StartViewState>
    /** 저장 위치 종류(소스가 알려 준다). 소스가 없으면 null */
    readonly scope: 'account' | 'browser' | null
    /** 저장값을 다시 읽는다. 지도는 움직이지 않는다(엔진을 열 때의 자동 적용은 따로). 실패해도 throw하지 않는다(state) */
    load(): Promise<void>
    /** 저장. 실패해도 throw하지 않는다(state.lastError·errorKind). 이전 저장값은 그대로 */
    save(view: GisMapStartView): Promise<void>
    /** 저장한 시작 화면을 지운다. 지금 화면은 움직이지 않는다 */
    clear(): Promise<void>
    /** 저장한 시작 화면의 1번 지도 상태를 지금 지도에 적용한다(분할은 화면 분할 Provider의 applyStartView) */
    applyNow(): void
}

export interface StartViewControllerOptions {
    getMap(): GisMap
    hostStore: ReadableStore<GisMapHost>
    source?: StartViewSource
    /** 엔진이 만든 지도인가(붙이기는 시작 화면 기능 전체가 꺼진다) */
    owned: boolean
    /** 열 때 불러와 적용할지(config.startView.autoApply, 붙이기는 항상 false) */
    autoApply: boolean
    waitMs: number
    /** 보류가 끝났다(지도 그림을 시작해도 된다) */
    onReleaseMount(): void
}

export const DEFAULT_START_VIEW_WAIT_MS = 1500

function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
    return typeof value === 'object' && value !== null && typeof (value as { then?: unknown }).then === 'function'
}

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err)
}

function errorStatus(err: unknown): number | null {
    return err instanceof GisHttpError ? err.status : null
}

function isTimeout(err: unknown): boolean {
    if (errorStatus(err) === 408) return true
    return typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'TimeoutError'
}

/** 오류 → 종류. 순수 함수(시험용으로 공개) */
export function startViewErrorKind(err: unknown): StartViewErrorKind {
    const status = errorStatus(err)
    if (status === 401 || status === 403) return 'unauthorized'
    if (status === 503) return 'unavailable'
    if (isTimeout(err)) return 'timeout'
    return 'failed'
}

export class StartViewControllerImpl implements StartViewController {
    readonly store: ReadableStore<StartViewState>
    readonly scope: 'account' | 'browser' | null

    private readonly state: WritableStore<StartViewState>
    private readonly opts: StartViewControllerOptions
    private readonly unsubscribers: Array<() => void> = []
    private holding = false
    private timer: ReturnType<typeof setTimeout> | null = null
    private seq = 0
    private abort: AbortController | null = null
    private owner: string | null
    private destroyed = false

    constructor(opts: StartViewControllerOptions) {
        this.opts = opts
        this.scope = opts.source ? opts.source.scope : null
        const usable = !!opts.source && opts.owned
        this.state = createStore<StartViewState>({ ...EMPTY_START_VIEW_STATE, status: usable ? 'idle' : 'unsupported' })
        this.store = this.state
        this.owner = this.userOf(opts.hostStore.getState())
        if (usable) this.unsubscribers.push(opts.hostStore.subscribe(host => this.onHostChange(host)))
    }

    /** 지도를 만들 때 한 번: 불러와서 적용(보류 포함). autoApply가 아니면 아무것도 안 한다 */
    begin(): void {
        if (!this.opts.source || !this.opts.owned || !this.opts.autoApply || this.destroyed) return
        void this.run(true)
    }

    /** 엔진 mount()가 지도 그림을 미룰지 */
    isHolding(): boolean {
        return this.holding
    }

    async load(): Promise<void> {
        if (!this.opts.source || !this.opts.owned || this.destroyed) return
        await this.run(false)
    }

    private nextRequest(): AbortController {
        this.seq++
        this.abort?.abort()
        const ac = new AbortController()
        this.abort = ac
        return ac
    }

    private run(initial: boolean): Promise<void> {
        const source = this.opts.source as StartViewSource
        const ac = this.nextRequest()
        const my = this.seq
        this.state.setState({ status: 'loading', invalid: false, lastError: null, errorOp: null, errorKind: null })

        let result: StoredStartView | null | PromiseLike<StoredStartView | null>
        try {
            result = source.load(ac.signal)
        } catch (err) {
            this.failLoad(err, initial)
            return Promise.resolve()
        }
        if (!isPromiseLike(result)) {
            this.finishLoad(result, initial, true)
            return Promise.resolve()
        }
        if (initial && this.opts.waitMs > 0) {
            this.holding = true
            this.state.setState({ holding: true })
            this.timer = setTimeout(() => this.release(), this.opts.waitMs)
        }
        return Promise.resolve(result).then(
            value => {
                if (this.destroyed || my !== this.seq) return
                this.finishLoad(value, initial, false)
            },
            err => {
                if (this.destroyed || my !== this.seq) return
                this.failLoad(err, initial)
            },
        )
    }

    private finishLoad(raw: StoredStartView | null, initial: boolean, sync: boolean): void {
        let value: StoredStartView | null = null
        let invalid = false
        if (raw) {
            const view = parseStartView(raw.view)
            if (view) value = { view, updatedAt: raw.updatedAt ?? null }
            else invalid = true
        }
        // 동기 값이거나 아직 기다리는 중이면 적용한다(그 뒤에 지도 그림이 시작된다)
        const apply = initial && this.opts.autoApply && value !== null && (sync || this.holding)
        if (apply && value) applyViewState(this.opts.getMap(), value.view.panes[0])
        const prev = this.state.getState()
        this.state.setState({
            status: 'ready', value, invalid, lastError: null, errorOp: null, errorKind: null,
            // applied·late는 "열 때" 일어난 일이라 다시 읽기(initial 아님)는 그대로 둔다. 값이 없어지면 late도 없다
            applied: initial ? apply : prev.applied,
            late: value === null ? false : initial ? !apply : prev.late,
        })
        if (initial) this.release()
    }

    private failLoad(err: unknown, initial: boolean): void {
        const kind = startViewErrorKind(err)
        if (errorStatus(err) === 404) {
            this.state.setState({ status: 'unsupported', value: null, lastError: null, errorOp: null, errorKind: null })
        } else {
            this.state.setState({
                status: kind === 'unavailable' ? 'unavailable' : kind === 'unauthorized' ? 'unauthorized' : kind === 'timeout' ? 'timeout' : 'error',
                value: null, lastError: errorMessage(err), errorOp: 'load', errorKind: kind,
            })
        }
        if (initial) this.release()
    }

    private release(): void {
        if (this.timer !== null) {
            clearTimeout(this.timer)
            this.timer = null
        }
        if (!this.holding) return
        this.holding = false
        if (!this.destroyed) {
            this.state.setState({ holding: false })
            this.opts.onReleaseMount()
        }
    }

    async save(view: GisMapStartView): Promise<void> {
        const source = this.opts.source
        if (!source || !this.opts.owned || this.destroyed) return
        const ac = this.nextRequest()
        const my = this.seq
        this.state.setState({ saving: true, lastError: null, errorOp: null, errorKind: null })
        try {
            const stored = await source.save(view, ac.signal)
            if (this.destroyed || my !== this.seq) return
            const parsed = parseStartView(stored?.view) ?? view
            this.state.setState({
                saving: false, status: 'ready', value: { view: parsed, updatedAt: stored?.updatedAt ?? null },
                invalid: false, late: false, lastError: null, errorOp: null, errorKind: null,
            })
        } catch (err) {
            if (this.destroyed || my !== this.seq) return
            this.failWrite('save', err)
        }
    }

    async clear(): Promise<void> {
        const source = this.opts.source
        if (!source || !this.opts.owned || this.destroyed) return
        const ac = this.nextRequest()
        const my = this.seq
        this.state.setState({ saving: true, lastError: null, errorOp: null, errorKind: null })
        try {
            await source.clear(ac.signal)
            if (this.destroyed || my !== this.seq) return
            this.state.setState({
                saving: false, status: 'ready', value: null, invalid: false, late: false, lastError: null, errorOp: null, errorKind: null,
            })
        } catch (err) {
            if (this.destroyed || my !== this.seq) return
            this.failWrite('clear', err)
        }
    }

    /** 저장·삭제 실패: 이전 값은 그대로. 503·401·403은 상태도 바꾼다 */
    private failWrite(op: StartViewOp, err: unknown): void {
        const kind = startViewErrorKind(err)
        const patch: Partial<StartViewState> = { saving: false, lastError: errorMessage(err), errorOp: op, errorKind: kind }
        if (kind === 'unavailable') patch.status = 'unavailable'
        else if (kind === 'unauthorized') patch.status = 'unauthorized'
        this.state.setState(patch)
    }

    applyNow(): void {
        const value = this.state.getState().value
        if (!value || this.destroyed) return
        applyViewState(this.opts.getMap(), value.view.panes[0])
        this.state.setState({ late: false })
    }

    private userOf(host: GisMapHost): string | null {
        try {
            return host.getCurrentUser()?.userId ?? null
        } catch {
            return null
        }
    }

    /** 사용자가 바뀌면 이전 사용자의 값을 비운다(진행 중인 요청은 끊는다). 지도는 움직이지 않는다 */
    private onHostChange(host: GisMapHost): void {
        if (this.destroyed) return
        const owner = this.userOf(host)
        if (owner === this.owner) return
        this.owner = owner
        this.seq++
        this.abort?.abort()
        this.abort = null
        this.release()
        this.state.setState({ ...EMPTY_START_VIEW_STATE, status: 'idle' })
    }

    destroy(): void {
        if (this.destroyed) return
        this.destroyed = true
        this.seq++
        this.abort?.abort()
        this.abort = null
        if (this.timer !== null) {
            clearTimeout(this.timer)
            this.timer = null
        }
        this.holding = false
        this.unsubscribers.forEach(off => off())
        this.unsubscribers.length = 0
        this.state.destroy()
    }
}
