// 지도 인스턴스 단위 이벤트(Pub/Sub). 인스턴스마다 하나씩 만든다.

export interface Emitter<E> {
    /** 반환값 = 구독 해제 */
    on<K extends keyof E>(type: K, fn: (payload: E[K]) => void): () => void
    emit<K extends keyof E>(type: K, payload: E[K]): void
    clear(): void
}

export function createEmitter<E>(): Emitter<E> {
    const handlers = new Map<keyof E, Set<(payload: unknown) => void>>()

    return {
        on(type, fn) {
            let set = handlers.get(type)
            if (!set) {
                set = new Set()
                handlers.set(type, set)
            }
            const h = fn as (payload: unknown) => void
            set.add(h)
            return () => {
                handlers.get(type)?.delete(h)
            }
        },
        emit(type, payload) {
            const set = handlers.get(type)
            if (!set) return
            // 한 구독자가 실패해도 나머지는 계속 호출한다
            Array.from(set).forEach(h => {
                try {
                    h(payload)
                } catch (err) {
                    console.error(`[gis-map] '${String(type)}' 이벤트 처리 중 오류`, err)
                }
            })
        },
        clear() {
            handlers.clear()
        },
    }
}
