// 바람길 플러그인 — 옛 hooks/map/useWindLayer.ts를 React 없이 옮겼다. ol-wind는 이 폴더에서만 import한다.
// 데이터(grib2json 형태 WindField)는 WindSource(짝 백엔드면 api/wind/latest)로만 받는다.
// 기상청 바람예상도처럼 단색(흰색 계열) 가는 선으로 간결하게 표시한다.
//   - setVisible(true): 데이터를 받아 WindLayer를 붙이고, 해상도가 바뀔 때마다 velocityScale·paths를 다시 계산
//   - setVisible(false) / destroy(): 받는 중이면 결과를 버리고(cancelled), 해상도 구독을 끊고, 레이어를 뗀다
//   - 전체 초기화(clearAll)와는 무관(옛 mapStore.clearAll도 바람길 표시를 건드리지 않았다)
// 아래 상수·함수 블록은 옛 파일 10~38행을 글자 그대로 옮긴 것이다(값·주석을 바꾸지 않는다).
import { WindLayer } from 'ol-wind'
import type { GisMap } from '../GisMap'
import type { GisMapPlugin } from '../plugin'
import type { WindSource } from '../sources'
import { createStore } from '../store'
import type { ReadableStore, WritableStore } from '../store'
import { windSpeedColor } from '../lib/windColorScale'
import type { WindState } from '../types/wind'

// LDAPS 격자 해상도(~2.2km)보다 훨씬 가깝게 확대하면 데이터가 표현할 수 있는
// 수준을 넘어서므로, 지도 해상도(m/px)가 이보다 작아지면(더 확대되면) 레이어를 숨긴다.
const MIN_RESOLUTION = 8

// ol-wind는 매 프레임 지리좌표를 화면 픽셀로 다시 투영하기 때문에, velocityScale이
// 고정값이면 확대할수록 같은 지리적 이동거리가 화면에서 훨씬 길게 그려진다.
// 줌13(세종시 전체, 해상도 ≈14m/px)에서 velocityScale 0.003이 적당했던 걸 기준으로,
// 해상도에 비례해서 velocityScale을 재계산하면 화면상 선 길이가 줌과 무관하게 일정해진다.
const VELOCITY_SCALE_PER_RESOLUTION = 0.003 / 14
const MIN_VELOCITY_SCALE = 0.0005
const MAX_VELOCITY_SCALE = 0.02

function velocityScaleForResolution(resolution: number): number {
    // const scale = VELOCITY_SCALE_PER_RESOLUTION * resolution
    const scale = 0.00001 * resolution
    return scale
}

// paths(선 개수): 지도에서 가능한 최대 줌아웃일 때 500개, 최대 줌인일 때 80개가 되도록
// 현재 해상도를 [minResolution, maxResolution] 구간에서 선형으로 매핑한다.
const MIN_PATHS = 80
const MAX_PATHS = 500

function pathsForResolution(resolution: number, minResolution: number, maxResolution: number): number {
    if (maxResolution <= minResolution) return MAX_PATHS
    const t = (resolution - minResolution) / (maxResolution - minResolution) // 0(최대 줌인) ~ 1(최대 줌아웃)
    const clamped = Math.max(0, Math.min(1, t))
    return Math.round(MIN_PATHS + (MAX_PATHS - MIN_PATHS) * clamped)
}

export interface WindPlugin extends GisMapPlugin {
    readonly name: 'wind'
    readonly store: ReadableStore<WindState>
    setVisible(visible: boolean): void
    toggle(): void
    /** 지금 지도에 붙어 있는 바람 레이어(없으면 null) */
    getOlLayer(): InstanceType<typeof WindLayer> | null
}

export interface WindPluginOptions {
    /** 없으면 설치된 지도의 map.sources.wind */
    source?: WindSource
}

/** 켜져 있는 동안 한 번의 표시(옛 effect 한 번 실행)에 해당 */
interface WindSession {
    cancelled: boolean
    layer: InstanceType<typeof WindLayer> | null
    unsubscribeResolution: (() => void) | null
}

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err)
}

class WindPluginImpl implements WindPlugin {
    readonly name = 'wind' as const
    readonly store: ReadableStore<WindState>

    private readonly state: WritableStore<WindState>
    private readonly opts: WindPluginOptions
    private map: GisMap | null = null
    private session: WindSession | null = null
    private destroyed = false

    constructor(opts: WindPluginOptions) {
        this.opts = opts
        this.state = createStore<WindState>({ visible: false, loading: false, error: null })
        this.store = this.state
    }

    install(map: GisMap): void {
        this.map = map
    }

    setVisible(visible: boolean): void {
        if (this.destroyed || visible === this.state.getState().visible) return
        this.state.setState({ visible })
        if (visible) this.start()
        else this.stop()
    }

    toggle(): void {
        this.setVisible(!this.state.getState().visible)
    }

    getOlLayer(): InstanceType<typeof WindLayer> | null {
        return this.session?.layer ?? null
    }

    destroy(): void {
        if (this.destroyed) return
        this.stop()
        this.destroyed = true
        this.map = null
        this.state.destroy()
    }

    /** 옛 effect 본문(enabled = true) */
    private start(): void {
        const map = this.map
        const source = this.opts.source ?? map?.sources.wind
        if (!map || !source) return
        const olMap = map.olMap
        const session: WindSession = { cancelled: false, layer: null, unsubscribeResolution: null }
        this.session = session

        const load = async () => {
            this.state.setState({ loading: true, error: null })
            try {
                const data = await source.latest()
                if (session.cancelled || data == null) return

                const view = olMap.getView()
                const initialResolution = view.getResolution() ?? 14
                const minResolution = view.getMinResolution()
                const maxResolution = view.getMaxResolution()

                const layer = new WindLayer(data, {
                    windOptions: {
                        velocityScale: velocityScaleForResolution(initialResolution),
                        paths: pathsForResolution(initialResolution, minResolution, maxResolution),
                        frameRate: 50,
                        lineWidth: 2.5,
                        colorScale: windSpeedColor,
                    },
                })
                // LDAPS 격자(약 2.2km)보다 훨씬 가깝게 확대하면(대략 동 블록 단위 이하)
                // 실제 데이터가 표현할 수 있는 수준을 넘어서므로 레이어를 숨긴다.
                // layer.setMinResolution(MIN_RESOLUTION)
                olMap.addLayer(layer)
                session.layer = layer

                // 줌이 바뀔 때마다 velocityScale을 재계산해서 화면상 선 길이를 일정하게 유지
                const handleResolutionChange = () => {
                    const resolution = view.getResolution()
                    if (resolution == null) return
                    layer.setWindOptions({
                        velocityScale: velocityScaleForResolution(resolution),
                        paths: pathsForResolution(resolution, minResolution, maxResolution),
                    })
                }
                view.on('change:resolution', handleResolutionChange)
                session.unsubscribeResolution = () => view.un('change:resolution', handleResolutionChange)
            } catch (err) {
                /* 바람길 데이터가 아직 준비되지 않았을 수 있음 — 조용히 무시 */
                if (!session.cancelled) this.state.setState({ error: errorMessage(err) })
            } finally {
                if (!session.cancelled) this.state.setState({ loading: false })
            }
        }

        void load()
    }

    /** 옛 effect 정리 함수 */
    private stop(): void {
        const session = this.session
        if (!session) return
        this.session = null
        session.cancelled = true
        session.unsubscribeResolution?.()
        if (session.layer) {
            this.map?.olMap.removeLayer(session.layer)
            session.layer = null
        }
        if (!this.destroyed) this.state.setState({ loading: false })
    }
}

/** 바람길 플러그인을 만든다. 설치: map.use(createWindPlugin()) */
export function createWindPlugin(opts: WindPluginOptions = {}): WindPlugin {
    return new WindPluginImpl(opts)
}

// 시험·호스트용으로 옛 상수·함수를 그대로 내보낸다(값은 위 블록 그대로)
export {
    MIN_RESOLUTION,
    VELOCITY_SCALE_PER_RESOLUTION,
    MIN_VELOCITY_SCALE,
    MAX_VELOCITY_SCALE,
    velocityScaleForResolution,
    MIN_PATHS,
    MAX_PATHS,
    pathsForResolution,
}
