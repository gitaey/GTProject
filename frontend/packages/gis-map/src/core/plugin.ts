// 플러그인 계약(현재는 바람길만 플러그인). 플러그인은 자기가 지도에 붙인 것을 destroy()에서 스스로 치운다.
import type { GisMap } from './GisMap'

export interface GisMapPlugin {
    readonly name: string
    install(map: GisMap): void
    /** map.clearAll() 때 호출(선택) */
    clear?(): void
    destroy(): void
}
