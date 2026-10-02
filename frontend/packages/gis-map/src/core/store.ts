// 아주 작은 상태 저장소(zustand 대신). React의 useSyncExternalStore와 바로 맞물린다.
// 저장소는 지도 인스턴스마다 하나씩 만든다 — 모듈 전역 저장소를 두지 않는다.

export interface ReadableStore<T> {
    getState(): T
    /** 상태가 바뀔 때마다 호출. 반환값 = 구독 해제 */
    subscribe(listener: (state: T, prev: T) => void): () => void
}

export interface WritableStore<T> extends ReadableStore<T> {
    /** 얕은 병합. 바뀐 값이 하나도 없으면 알리지 않는다 */
    setState(patch: Partial<T> | ((state: T) => Partial<T>)): void
    /** 구독자 전부 해제(엔진 destroy용) */
    destroy(): void
}

export function createStore<T extends object>(initial: T): WritableStore<T> {
    let state = initial
    const listeners = new Set<(state: T, prev: T) => void>()

    return {
        getState: () => state,
        subscribe(listener) {
            listeners.add(listener)
            return () => {
                listeners.delete(listener)
            }
        },
        setState(patch) {
            const part = (typeof patch === 'function' ? (patch as (s: T) => Partial<T>)(state) : patch) as Partial<T>
            const keys = Object.keys(part) as Array<keyof T>
            if (!keys.some(k => !Object.is(part[k], state[k]))) return
            const prev = state
            state = { ...state, ...part }
            Array.from(listeners).forEach(l => l(state, prev))
        },
        destroy() {
            listeners.clear()
        },
    }
}
