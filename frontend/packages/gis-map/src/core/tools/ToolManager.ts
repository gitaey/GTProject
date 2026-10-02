// 도구 관리자: 지금 켜진 도구(activeTool)와 반경 입력값을 인스턴스마다 갖고, 도구가 바뀔 때
// 각 도구 핸들러(그리기·측정 등)에게 "나가는 도구 정리 → 들어오는 도구 준비" 순서로 알린다.
import { createStore } from '../store'
import type { ReadableStore, WritableStore } from '../store'
import type { MapTool } from '../types/draw'

export interface ToolState {
    activeTool: MapTool
    /** 반경검색 직접 입력값(m). null이면 드래그로 지정 */
    radiusMeters: number | null
}

export interface ToolManager {
    readonly store: ReadableStore<ToolState>
    /** 같은 도구를 다시 넘기면 'none'(토글) */
    activate(tool: MapTool): void
    deactivate(): void
    setRadiusMeters(meters: number | null): void
}

/** 코어 내부용: 도구 하나(또는 여러 개)를 맡아 interaction·리스너를 붙이고 떼는 쪽 */
export interface ToolHandler {
    handles(tool: MapTool): boolean
    /** 이전 도구나 다음 도구를 이 핸들러가 맡을 때 호출. 이전 도구 정리와 다음 도구 준비를 여기서 한다 */
    update(next: MapTool, prev: MapTool): void
}

export class ToolManagerImpl implements ToolManager {
    readonly store: ReadableStore<ToolState>

    private readonly state: WritableStore<ToolState>
    private readonly handlers: ToolHandler[] = []
    private readonly queue: MapTool[] = []
    private running = false
    private destroyed = false

    constructor() {
        this.state = createStore<ToolState>({ activeTool: 'none', radiusMeters: null })
        this.store = this.state
    }

    register(handler: ToolHandler): () => void {
        this.handlers.push(handler)
        return () => {
            const i = this.handlers.indexOf(handler)
            if (i >= 0) this.handlers.splice(i, 1)
        }
    }

    activate(tool: MapTool): void {
        const current = this.queue.length > 0 ? this.queue[this.queue.length - 1] : this.state.getState().activeTool
        this.request(current === tool ? 'none' : tool)
    }

    deactivate(): void {
        this.request('none')
    }

    setRadiusMeters(meters: number | null): void {
        if (this.destroyed) return
        this.state.setState({ radiusMeters: meters })
    }

    /** 엔진 destroy용: 전환 없이 핸들러·구독만 끊는다(interaction 해제는 MapResources.releaseAll이 한다) */
    destroy(): void {
        this.destroyed = true
        this.handlers.length = 0
        this.queue.length = 0
        this.state.destroy()
    }

    // 핸들러나 구독자가 전환 도중 또 전환을 요청해도 순서대로 하나씩 처리한다
    private request(next: MapTool): void {
        if (this.destroyed) return
        this.queue.push(next)
        if (this.running) return
        this.running = true
        try {
            while (this.queue.length > 0) {
                const to = this.queue.shift() as MapTool
                const from = this.state.getState().activeTool
                if (to === from) continue
                try {
                    this.state.setState({ activeTool: to })
                } finally {
                    this.dispatch(to, from)
                }
            }
        } finally {
            this.running = false
        }
    }

    private dispatch(to: MapTool, from: MapTool): void {
        const list = this.handlers.slice()
        const leaving = list.filter(h => h.handles(from) && !h.handles(to))
        const entering = list.filter(h => h.handles(to))
        leaving.concat(entering).forEach(h => {
            try {
                h.update(to, from)
            } catch (err) {
                console.error('[gis-map] 도구 전환(' + from + ' → ' + to + ') 중 오류', err)
            }
        })
    }
}
