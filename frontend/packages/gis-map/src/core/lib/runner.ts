// 시간 나누어 돌리기: 한 번에 budgetMs만 계산하고 화면에 양보한다(지도·패널이 멈추지 않게). 취소를 사이사이에 확인한다.
export interface ChunkOptions {
    /** 한 번에 계산하는 시간(ms) */
    budgetMs: number
    now(): number
    /** 화면에 양보(브라우저는 setTimeout 0) */
    yieldToUi(): Promise<void>
    isCancelled(): boolean
    /** 양보할 때마다(done, total) */
    onProgress?(done: number, total: number): void
}

/** 반복 몇 번마다 시계를 보나(시계 호출 자체가 비싸지 않게) */
const CHECK_EVERY = 16

/** 0..total-1을 step으로 돌린다. 끝까지 돌았으면 true, 취소되어 멈췄으면 false */
export async function runChunked(total: number, step: (i: number) => void, o: ChunkOptions): Promise<boolean> {
    let start = o.now()
    for (let i = 0; i < total; i++) {
        if (i % CHECK_EVERY === 0 && i > 0 && o.now() - start >= o.budgetMs) {
            o.onProgress?.(i, total)
            await o.yieldToUi()
            if (o.isCancelled()) return false
            start = o.now()
        }
        step(i)
    }
    if (o.isCancelled()) return false
    o.onProgress?.(total, total)
    return true
}

export function defaultNow(): number {
    return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()
}

export function defaultYield(): Promise<void> {
    return new Promise<void>(resolve => setTimeout(resolve, 0))
}

/**
 * 항목을 최대 limit개씩 동시에 처리한다(레이어 단위 원격 요청 수 제한). 취소되면 아직 시작 안 한 항목은 건너뛴다.
 * fn은 던지지 않는 것으로 본다(호출부가 항목별로 오류를 결과에 담는다)
 */
export async function runPool<T>(items: readonly T[], limit: number, fn: (item: T, i: number) => Promise<void>, isCancelled: () => boolean): Promise<void> {
    let next = 0
    const worker = async (): Promise<void> => {
        while (next < items.length && !isCancelled()) {
            const i = next++
            await fn(items[i], i)
        }
    }
    const n = Math.max(1, Math.min(Math.floor(limit) || 1, items.length))
    await Promise.all(Array.from({ length: n }, worker))
}
