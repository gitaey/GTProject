// 바람길 플러그인 — 옛 hooks/map/useWindLayer.ts를 React 없이 옮겼다. ol-wind는 이 폴더에서만 import한다.
// 데이터(grib2json 형태 WindField)는 WindSource(짝 백엔드면 api/wind/latest)로만 받는다.
// 기상청 바람예상도처럼 단색(흰색 계열) 가는 선으로 간결하게 표시한다.
//   - setVisible(true): 데이터를 받아 WindLayer를 붙이고, 해상도가 바뀔 때마다 velocityScale·paths를 다시 계산
//   - setVisible(false) / destroy(): 받는 중이면 결과를 버리고(cancelled), 해상도 구독을 끊고, 레이어를 뗀다
//   - 전체 초기화(clearAll)와는 무관(옛 mapStore.clearAll도 바람길 표시를 건드리지 않았다)
// 아래 상수·함수 블록은 옛 파일 10~38행을 글자 그대로 옮긴 것이다(값·주석을 바꾸지 않는다).
//
// 바람지도 패널용 확장 — 기본값에서는 위 동작과 화면이 같다:
//   - 프레임(시간별 예보 0 ~ N-1, N은 서버 설정): loadFrames()로 목록을 받고, setFrame(index)가 레이어를 다시 만들지 않고 ol-wind의 데이터만 바꾼다(WindLayer.setData).
//     프레임 목록이 없는 소스(frames/frame 미구현)에서는 latest()만 쓰는 옛 동작 그대로.
//   - 프레임 캐시(인스턴스당 id별 Map, 상한 = 지금 목록의 프레임 수)와 재생 중 다음 프레임 미리 받기
//   - 재생(play/pause): 프레임을 받아 그린 뒤 WIND_FRAME_INTERVAL_MS 만에 다음 프레임, 끝이면 처음으로. 타이머는 끄기·destroy에서 정리
//   - 받기 실패(404 포함): 선택을 그려진 프레임으로 되돌리고 error를 알린다. 프레임이 서버에서 사라졌으면(404) 목록을 한 번 다시 받아 같은 시각으로 복구한다
//   - 입자 밀도·애니메이션 속도 배율(옛 해상도 기반 계산값에 곱한다), 풍속 색 on/off(끄면 배경지도에 맞춘 단색)
//   - 입자 레이어와 풍속 색상 오버레이(WindOverlay)를 따로 켜고 끈다 — 데이터는 하나(같은 프레임 캐시)
//   - windAt(lon, lat) / watchPointer: 지금 그려진 격자에서 지점 풍속·풍향
//   - 색상 오버레이 값 overlayVar(none·speed·temp·humi·rain): 스칼라 변수(기온·습도·강수량)는 WindSource.field로 프레임마다 한 장씩 받는다.
//     고르기 전에는 스칼라를 한 번도 받지 않고(요청 0), 고르면 선택 프레임의 한 장, 시간을 옮기면 바람 본문과 함께 받아 같이 바꾼다. valueAt / watchPointerValues: 지점 값
import { WindLayer } from 'ol-wind'
import { toLonLat } from 'ol/proj'
import type OlView from 'ol/View'
import type { GisMap } from '../GisMap'
import type { GisMapPlugin } from '../plugin'
import type { WindSource } from '../sources'
import { createStore } from '../store'
import type { ReadableStore, WritableStore } from '../store'
import { windSpeedColor } from '../lib/windColorScale'
import { readScalarGrid, sampleGrid, sampleWind } from '../lib/windGrid'
import type { ScalarGridInfo } from '../lib/windGrid'
import { WX_COLOR_SCALES, isWindScalarVar } from '../lib/wxColorScales'
import { compactWindField, expandWindField } from '../lib/windCompact'
import type { CompactWindField } from '../lib/windCompact'
import {
    WIND_DENSITY_MAX, WIND_DENSITY_MIN, WIND_FRAME_CACHE_MIN, WIND_FRAME_INTERVAL_MS, WIND_FRAMES_TTL_MS, WIND_MONO_COLOR_DARK,
    WIND_MONO_COLOR_LIGHT, WIND_OVERLAY_OPACITY_DEFAULT, WIND_OVERLAY_OPACITY_MAX, WIND_OVERLAY_OPACITY_MIN, WIND_POINTER_THROTTLE_MS,
    WIND_SPEED_MAX, WIND_SPEED_MIN,
} from '../lib/windLimits'
import { currentFrameIndex, normalizeWindFrames, windScalarVarsOf, windStaleKind } from '../lib/windFrames'
import type { BasemapMode } from '../types/layer'
import type { WindField, WindFrameMeta, WindOverlayVar, WindPointerValues, WindSample, WindScalarSample, WindScalarVar, WindState } from '../types/wind'
import { createWindOverlay } from './WindOverlay'
import type { WindOverlay } from './WindOverlay'

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

// ── 바람지도 패널에서 더한 값 ──

/** 레이어 z: 배경지도(0) < 오버레이 < 입자. 둘 다 GeoTIFF(5)·레이어 트리(10)보다 아래(옛 입자 레이어도 0이라 그 아래였다) */
const OVERLAY_Z_INDEX = 0.5
const PARTICLE_Z_INDEX = 1

type WindColorScaleOption = NonNullable<Parameters<InstanceType<typeof WindLayer>['setWindOptions']>[0]>['colorScale']

function clampScale(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

export interface WindPlugin extends GisMapPlugin {
    readonly name: 'wind'
    readonly store: ReadableStore<WindState>
    setVisible(visible: boolean): void
    toggle(): void
    /** 지금 지도에 붙어 있는 바람 입자 레이어(입자를 숨겼거나 꺼져 있으면 null) */
    getOlLayer(): InstanceType<typeof WindLayer> | null
    /** 지금 지도에 붙어 있는 색상 오버레이 레이어(꺼져 있으면 null) */
    getOverlayLayer(): ReturnType<typeof createWindOverlay>['layer'] | null

    /**
     * 예보 프레임 목록을 받는다(가벼운 요청 — 바람 데이터 본문은 받지 않는다). 받는 중이면 같은 요청을 기다리고,
     * 이미 받았고 최근(WIND_FRAMES_TTL_MS)이며 자료가 오래되지 않았으면 다시 요청하지 않는다.
     * 처음이면 지금 시각의 프레임을 선택(frameIndex), 다시 받을 때는 같은 유효시각 프레임을 유지한다. 소스에 frames()/frame()이 없으면 framesStatus 'unsupported'
     */
    loadFrames(): Promise<void>
    /** 목록을 시간과 상관없이 다시 받는다("예보 목록 다시 받기") */
    reloadFrames(): Promise<void>
    /** 지금 시각 기준으로 자료 오래됨(stale)을 다시 계산한다 — 패널이 열려 있는 동안 주기적으로 부른다(목록을 새로 받지는 않는다) */
    refreshStale(): void
    /**
     * 프레임 선택(0~frames.length-1로 맞춘다). 켜져 있으면 그 프레임의 데이터를 받아 **같은 레이어에** 바꿔 끼우고(캐시 우선),
     * 꺼져 있으면 선택만 기억해 두었다가 켤 때 받는다. 받는 중에 다른 프레임이 선택되면 앞 요청 결과는 버린다.
     * 받기에 실패하면 선택을 지금 그려진 프레임으로 되돌리고 error를 둔다. 데이터가 바뀌면 resolve
     */
    setFrame(index: number): Promise<void>
    /** 이전(-1)·다음(+1) 프레임. 끝에서 멈춘다(재생만 처음으로 돌아간다) */
    stepFrame(delta: number): Promise<void>
    /** 마지막 실패를 다시 시도 — 목록 받기가 실패했으면 목록, 아니면 선택된 프레임 */
    retry(): void
    /** 재생 시작 — 켜져 있고 프레임이 둘 이상일 때만. 끝이면 처음으로 돌아간다 */
    play(): void
    pause(): void
    togglePlay(): void
    /** 입자 밀도 배율(WIND_DENSITY_MIN~MAX로 맞춘다. 숫자가 아니면 무시) */
    setDensity(scale: number): void
    /** 애니메이션 속도 배율(WIND_SPEED_MIN~MAX) */
    setSpeed(scale: number): void
    /** true = 풍속별 색(기본), false = 단색(배경지도에 맞춤) */
    setColorBySpeed(colorBySpeed: boolean): void
    /** 바람 입자만 보이기/숨기기 — 데이터·오버레이·재생은 그대로(켜져 있을 때 적용). 숨기면 입자 레이어를 떼어 CPU를 쓰지 않는다 */
    setParticlesVisible(visible: boolean): void
    /** 풍속 색상 오버레이 켜기/끄기(켜져 있을 때 적용) — 입자와 같은 데이터. 켜면 풍속(이미 다른 값이 골라져 있으면 그대로), 끄면 없음 */
    setOverlay(on: boolean): void
    /**
     * 색상 오버레이 값 고르기(none 없음·speed 풍속·temp/humi/rain 스칼라). 스칼라는 소스에 field()가 있을 때만(없으면 무시).
     * 켜져 있으면 선택 프레임의 한 장만 받아 바꾸고(캐시 우선), 꺼져 있으면 선택만 기억했다가 켤 때 바람과 함께 받는다.
     * 그 프레임에 그 변수 id가 없으면 요청 없이 오버레이를 비우고 overlayNote로 알린다. 변수를 바꾸면 이전 변수의 스칼라 캐시를 비운다
     */
    setOverlayVar(v: WindOverlayVar): void
    /** 오버레이 진하기(WIND_OVERLAY_OPACITY_MIN~MAX). 이미지를 다시 만들지 않는다 */
    setOverlayOpacity(opacity: number): void
    /** 지금 그려진 프레임의 위경도(EPSG:4326) 지점 바람(이중선형 보간). 안 켜졌거나 격자 밖·자료 없음이면 null */
    windAt(lon: number, lat: number): WindSample | null
    /**
     * 지금 고른 스칼라 변수의 위경도 값. 스칼라 변수를 안 골랐거나 안 켜졌으면 null.
     * 골랐는데 그 지점이 자료 없음이거나 이 시각 자료를 아직 못 받았으면 { var, value: null }
     */
    valueAt(lon: number, lat: number): WindScalarSample | null
    /**
     * 마우스 아래의 바람을 지켜본다(지도 pointermove, ~100ms 간격). 지도 밖으로 나가거나 격자 밖이면 null을 알린다.
     * 프레임이 바뀌면 마지막 마우스 위치로 다시 알린다. 반환값 = 해제(플러그인 destroy에서도 정리)
     */
    watchPointer(listener: (sample: WindSample | null) => void): () => void
    /** watchPointer와 같되 바람(wind)과 고른 스칼라 변수 값(scalar)을 함께 알린다. 마우스가 지도 밖이면 null. 스칼라가 도착해도 마지막 위치로 다시 알린다 */
    watchPointerValues(listener: (values: WindPointerValues | null) => void): () => void
    /** 캐시에 든 프레임 id(오래된 것부터). 시험·진단용 */
    cachedFrameIds(): number[]
    /** 캐시에 든 스칼라 id(오래된 것부터). 시험·진단용 */
    cachedScalarIds(): number[]
}

export interface WindPluginOptions {
    /** 없으면 설치된 지도의 map.sources.wind */
    source?: WindSource
    /** 재생 프레임 간격(ms). 기본 WIND_FRAME_INTERVAL_MS */
    frameIntervalMs?: number
    /** 현재 시각(epoch ms) 공급. 기본 Date.now — 처음 선택할 프레임(지금 시각)·자료 오래됨 판정·목록 갱신 주기에만 쓴다 */
    now?: () => number
    /** 풍속 색을 끈 입자의 단색. 문자열이면 늘 그 색, 함수면 배경지도 모드별. 기본: 위성 흰색 · 일반/없음 진회색 */
    monoColor?: string | ((mode: BasemapMode) => string)
}

/** 켜져 있는 동안 한 번의 표시(옛 effect 한 번 실행)에 해당 */
interface WindSession {
    cancelled: boolean
    /** 입자 레이어(입자를 숨겼으면 null) */
    layer: InstanceType<typeof WindLayer> | null
    /** 색상 오버레이(꺼져 있으면 null) */
    overlay: WindOverlay | null
    unsubscribeResolution: (() => void) | null
    /** 데이터 요청 번호 — 가장 나중 요청의 결과만 쓴다 */
    requestId: number
    /** 지금 그려진 바람장(windAt·오버레이가 읽는다) */
    field: WindField | null
    /** 지금 그려진 프레임 id(latest()로 받았으면 null) */
    shownFrameId: number | null
    /** 그 프레임의 유효시각 — 그릴 때 확정한다(실패 때 새 목록에서 같은 시각 자리로 되돌리는 기준). 목록이 나중에 바뀌어도 변하지 않는다 */
    shownValid: string | null
    /** 그 프레임이 들어 있던 목록(선택 index·받은 시각 포함) — 새 목록에 그 시각이 없을 때 통째로 되돌리는 기준 */
    shownList: { frames: readonly WindFrameMeta[]; frameIndex: number; framesLoadedAt: number | null } | null
    /** 받는 중인 요청이 있다(같은 프레임을 다시 고르면 그 요청을 덮어쓰고 다시 받는다) */
    busy: boolean
    /** 지금 그려진 스칼라 한 장(스칼라 변수를 골랐고 받았을 때) — valueAt·오버레이가 읽는다. frameId = 그 바람 프레임 */
    scalar: ShownScalar | null
    /** 스칼라 요청 번호 — 가장 나중 요청(변수 바꾸기·프레임 이동)의 결과만 쓴다 */
    scalarToken: number
    /** 스칼라가 서버에 없어(404) 목록을 다시 받아 본 (프레임 id/변수) — 같은 조합은 한 번만 복구한다(무한 반복 방지) */
    scalarRecoveredKey: string | null
    /** 해상도 기반 계산에 쓰는 뷰와 한계 해상도(입자 레이어를 만들 때 정한다) */
    view: OlView | null
    minResolution: number
    maxResolution: number
}

/** 그려진 스칼라 한 장 */
interface ShownScalar {
    var: WindScalarVar
    frameId: number | null
    grid: ScalarGridInfo
}

/** 스칼라 받기 결과 — grid가 null이면 note가 이유(자료가 아직 없음·받지 못함) */
interface ScalarPart {
    var: WindScalarVar
    frameId: number | null
    grid: ScalarGridInfo | null
    note: string | null
    /** 목록에는 id가 있는데 서버가 그 한 장을 못 준다(404·읽을 수 없음) — 서버 사이클이 바뀌어 지워졌을 때. 네트워크 오류(던짐)는 아니다 */
    gone?: boolean
}

/** 데이터 받기 결과: frameId = 프레임 id(latest()면 null). scalar = 스칼라 변수를 골랐을 때 함께 받은 결과 */
interface LoadResult {
    data: WindField | null
    frameId: number | null
    scalar?: ScalarPart
}

interface LoadOpts {
    /** (받기에 실패했는데 그려진 프레임을 모를 때) 선택을 되돌릴 index */
    revertTo?: number
    /** 이미 한 번 복구(목록 다시 받기)한 요청 — 다시 복구하지 않는다(무한 반복 방지) */
    recovered?: boolean
    /** 이 받기가 성공하면 알릴 안내 */
    notice?: string
}

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err)
}

const MSG_FRAME_FAILED = '예보 자료를 받지 못했습니다.'
const MSG_RECOVERED = '예보 자료가 새로 바뀌어 예보 목록을 다시 받았습니다.'

class WindPluginImpl implements WindPlugin {
    readonly name = 'wind' as const
    readonly store: ReadableStore<WindState>

    private readonly state: WritableStore<WindState>
    private readonly opts: WindPluginOptions
    private map: GisMap | null = null
    private session: WindSession | null = null
    private destroyed = false

    /** 프레임 캐시(id → 바람장). 인스턴스 필드 — 지도마다 따로 */
    private readonly cache = new Map<number, CompactWindField>()
    /** 받는 중인 프레임(같은 id를 두 번 요청하지 않는다) */
    private readonly inflight = new Map<number, Promise<WindField | null>>()
    /** 스칼라 캐시(id → 격자, 인스턴스 필드). 한 번에 한 변수만 보이므로 변수를 바꾸면 비운다. 상한 = 프레임 캐시와 같다(장당 약 0.57MB) */
    private readonly scalarCache = new Map<number, ScalarGridInfo>()
    private readonly scalarInflight = new Map<number, Promise<ScalarGridInfo | null>>()
    /** 스칼라 캐시를 비울 때마다 올린다 — 비운 뒤에 도착한 응답은 캐시에 넣지 않는다 */
    private scalarEpoch = 0
    /** 캐시를 비울 때마다 올린다 — 비운 뒤에 도착한 응답은 캐시에 넣지 않는다 */
    private cacheEpoch = 0
    private framesToken = 0
    private framesPromise: Promise<void> | null = null
    private timer: ReturnType<typeof setTimeout> | null = null
    private readonly dataListeners = new Set<() => void>()
    private readonly pointerCleanups = new Set<() => void>()
    /** 배경지도 모드(단색을 정한다) — 엔진의 레이어 트리 상태를 구독해 따라간다 */
    private basemapMode: BasemapMode = 'normal'
    private offBasemap: (() => void) | null = null
    /** 마지막 실패가 목록 받기였는지(retry가 무엇을 다시 할지) */
    private lastFailure: 'frames' | 'frame' | null = null
    /** 마지막 프레임 받기 실패에서 사용자가 고르려던 프레임(retry가 다시 받는다 — 선택은 그려진 프레임으로 되돌아가 있다) */
    private retryIndex: number | null = null

    constructor(opts: WindPluginOptions) {
        this.opts = opts
        this.state = createStore<WindState>({
            visible: false, loading: false, error: null,
            frames: [], framesStatus: 'idle', frameIndex: -1, playing: false,
            densityScale: 1, speedScale: 1, colorBySpeed: true,
            particlesVisible: true, overlayVisible: false, overlayOpacity: WIND_OVERLAY_OPACITY_DEFAULT,
            framesLoadedAt: null, stale: null, notice: null,
            overlayVar: 'none', scalarSupported: false, scalarVars: [], overlayNote: null,
        })
        this.store = this.state
    }

    install(map: GisMap): void {
        this.map = map
        // 배경지도 모드는 엔진의 레이어 트리 상태에서 읽는다(레이어 트리가 없는 대역 지도에서도 설치는 된다 — 그땐 '일반'으로 본다)
        const layerStore = map.layers?.store
        if (!layerStore) return
        this.basemapMode = layerStore.getState().basemapMode
        this.offBasemap = layerStore.subscribe(s => {
            if (s.basemapMode === this.basemapMode) return
            this.basemapMode = s.basemapMode
            // 단색 입자는 배경지도가 바뀌면 바로 색을 바꾼다
            if (!this.state.getState().colorBySpeed) this.session?.layer?.setWindOptions({ colorScale: this.colorScale() })
        })
    }

    private now(): number {
        return this.opts.now ? this.opts.now() : Date.now()
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

    getOverlayLayer(): ReturnType<typeof createWindOverlay>['layer'] | null {
        return this.session?.overlay?.layer ?? null
    }

    destroy(): void {
        if (this.destroyed) return
        this.stop()
        this.destroyed = true
        this.framesToken++
        this.offBasemap?.()
        this.offBasemap = null
        this.pointerCleanups.forEach(fn => fn())
        this.pointerCleanups.clear()
        this.dataListeners.clear()
        this.clearCache()
        this.map = null
        this.state.destroy()
    }

    // ── 프레임 목록 ──

    private currentSource(): WindSource | undefined {
        return this.opts.source ?? this.map?.sources.wind
    }

    loadFrames(): Promise<void> {
        return this.fetchFrameList(false, true)
    }

    reloadFrames(): Promise<void> {
        return this.fetchFrameList(true, true)
    }

    refreshStale(): void {
        if (this.destroyed) return
        const st = this.state.getState()
        if (st.frames.length === 0) return
        const stale = windStaleKind(st.frames, this.now())
        if (stale !== st.stale) this.state.setState({ stale })
    }

    /** redraw: 켜진 채 목록이 바뀌었을 때 선택 프레임이 그려진 것과 다르면 새로 받아 그린다(404 복구는 자기가 다시 받으므로 false) */
    private fetchFrameList(force: boolean, redraw: boolean): Promise<void> {
        if (this.destroyed) return Promise.resolve()
        if (this.framesPromise) return this.framesPromise
        const st = this.state.getState()
        if (st.framesStatus === 'unsupported') return Promise.resolve()
        const nowMs = this.now()
        // 받은 지 얼마 안 됐고 자료가 오래되지 않았으면 다시 받지 않는다
        if (!force && st.framesStatus === 'ready' && st.stale === null && st.framesLoadedAt !== null && nowMs - st.framesLoadedAt <= WIND_FRAMES_TTL_MS) {
            return Promise.resolve()
        }
        const source = this.currentSource()
        const framesFn = source?.frames
        if (!source || typeof framesFn !== 'function' || typeof source.frame !== 'function') {
            this.state.setState({ framesStatus: 'unsupported' })
            return Promise.resolve()
        }
        const token = ++this.framesToken
        const first = st.framesStatus !== 'ready'
        // 이미 목록이 있으면(다시 받기) 화면을 그대로 두고, 처음일 때만 "받는 중" 상태
        if (first) this.state.setState({ framesStatus: 'loading', error: null })
        const run = async (): Promise<void> => {
            try {
                const list = await framesFn.call(source)
                if (this.destroyed || token !== this.framesToken) return
                const frames = normalizeWindFrames(list)
                const now = this.now()
                const prev = this.state.getState()
                // 선택: 같은 유효시각 프레임이 새 목록에 있으면 그것, 없으면 지금 시각 프레임
                const prevFrame = prev.frameIndex >= 0 ? prev.frames[prev.frameIndex] : undefined
                const same = prevFrame ? frames.findIndex(f => f.validTime === prevFrame.validTime) : -1
                const frameIndex = same >= 0 ? same : currentFrameIndex(frames, now)
                if (this.lastFailure === 'frames') this.lastFailure = null
                this.state.setState({
                    frames, framesStatus: 'ready', frameIndex, framesLoadedAt: now, stale: windStaleKind(frames, now),
                    scalarSupported: typeof source.field === 'function', scalarVars: typeof source.field === 'function' ? windScalarVarsOf(frames) : [],
                    ...(prev.error !== null && !first && this.lastFailure === null ? { error: null } : {}),
                })
                // 그려진 프레임이 새 목록에도 있으면 되돌림 기준을 새 목록으로(없으면 그릴 때 확정한 옛 기준을 그대로 둔다)
                if (this.session) this.captureShown(this.session)
                if (redraw) this.syncShownFrame()
                this.resyncScalarIfNewlyAvailable()
            } catch (err) {
                if (this.destroyed || token !== this.framesToken) return
                this.lastFailure = 'frames'
                // 처음 받기가 실패하면 목록 오류 상태, 다시 받기가 실패하면 있던 목록은 두고 오류만 알린다
                this.state.setState(first ? { framesStatus: 'error', error: errorMessage(err) } : { error: errorMessage(err) })
            } finally {
                if (token === this.framesToken) this.framesPromise = null
            }
        }
        this.framesPromise = run()
        return this.framesPromise
    }

    /**
     * 목록을 다시 받은 뒤: 켜져 있고 프레임으로 받은 그림이 있는데 선택된 프레임 id가 그려진 id와 다르면(새 발표로 id가 바뀌었거나
     * 같은 유효시각이 없어 "지금" 프레임으로 옮겨졌다) 선택 프레임을 새로 받아 그린다 — 패널의 시각과 지도의 그림이 어긋나지 않게.
     * latest()로 받아 그림 id를 모르는 경우(목록 없이 켠 툴바)는 건드리지 않는다. 실패하면 새 목록에서 그려진 프레임의 유효시각 자리로 되돌린다
     */
    private syncShownFrame(): void {
        const session = this.session
        if (!session || session.cancelled || !session.field || session.shownFrameId === null) return
        const { frames, frameIndex } = this.state.getState()
        const sel = frames[frameIndex]
        if (!sel || sel.id === session.shownFrameId) return
        const source = this.currentSource()
        if (!source || typeof source.frame !== 'function') return
        // 실패하면 그릴 때 확정해 둔 기준(session.shownValid·shownList)으로 되돌린다
        void this.loadInto(session, this.frameFetcher(source, sel.id), {})
    }

    /** 지금 그려진 프레임이 현재 목록에 있으면 그 유효시각·목록을 세션에 기록한다(되돌림 기준). latest()로 그린 화면은 기준 없음 */
    private captureShown(session: WindSession): void {
        if (session.shownFrameId === null) {
            session.shownValid = null
            session.shownList = null
            return
        }
        const st = this.state.getState()
        const idx = st.frames.findIndex(f => f.id === session.shownFrameId)
        if (idx < 0) return
        session.shownValid = st.frames[idx].validTime
        session.shownList = { frames: st.frames, frameIndex: idx, framesLoadedAt: st.framesLoadedAt }
    }

    // ── 프레임 선택·캐시 ──

    setFrame(index: number): Promise<void> {
        if (this.destroyed || typeof index !== 'number' || !Number.isFinite(index)) return Promise.resolve()
        const { frames, frameIndex } = this.state.getState()
        if (frames.length === 0) return Promise.resolve()
        const i = clampScale(Math.trunc(index), 0, frames.length - 1)
        if (i !== frameIndex) this.state.setState({ frameIndex: i })
        // 사용자가 직접 고르면 앞서 예약된 재생 이동은 취소한다(받는 동안 타이머가 울려 선택을 덮지 않게). 그린 뒤 다시 예약된다
        this.clearTimer()
        const session = this.session
        const source = this.currentSource()
        if (!session || session.cancelled || !source || typeof source.frame !== 'function') return Promise.resolve()
        const id = frames[i].id
        // 이미 이 프레임이 그려져 있으면(받는 중인 요청도 없으면) 다시 받지 않는다
        if (session.shownFrameId === id && session.field && !session.busy) {
            // 재생 중이면 위에서 지운 다음 이동 타이머를 다시 예약한다(재생이 멈춘 채 playing으로 남지 않게)
            if (this.state.getState().playing) this.scheduleNext()
            return Promise.resolve()
        }
        return this.loadInto(session, this.frameFetcher(source, id), { revertTo: frameIndex })
    }

    stepFrame(delta: number): Promise<void> {
        const { frameIndex } = this.state.getState()
        return this.setFrame((frameIndex < 0 ? 0 : frameIndex) + delta)
    }

    retry(): void {
        if (this.destroyed) return
        const st = this.state.getState()
        if (this.lastFailure === 'frames' || !st.visible || !this.session) {
            void this.reloadFrames()
            return
        }
        void this.setFrame(this.retryIndex ?? st.frameIndex)
        this.retryScalar()
    }

    /** 그려진 프레임이 선택된 프레임이고 스칼라 안내(받지 못함·아직 없음)가 떠 있으면 그 스칼라를 다시 받는다(복구 기회도 다시 준다) */
    private retryScalar(): void {
        const session = this.session
        const st = this.state.getState()
        if (!session || session.cancelled || !session.field || session.scalar || st.overlayNote === null || !isWindScalarVar(st.overlayVar)) return
        const sel = st.frameIndex >= 0 ? st.frames[st.frameIndex] : undefined
        if (!sel || sel.id !== session.shownFrameId) return
        session.scalarRecoveredKey = null
        this.syncScalar(session)
    }

    cachedFrameIds(): number[] {
        return Array.from(this.cache.keys())
    }

    private frameFetcher(source: WindSource, id: number): () => Promise<LoadResult> {
        return () => this.loadFrameResult(source, id)
    }

    /** 바람 프레임 + (스칼라 변수를 골랐으면) 같은 시각의 스칼라를 함께 받는다 — 그릴 때 둘을 같이 바꿔 시각이 어긋나지 않게. 스칼라 실패는 바람을 막지 않는다 */
    private async loadFrameResult(source: WindSource, id: number): Promise<LoadResult> {
        const v = this.state.getState().overlayVar
        const scalarPromise = isWindScalarVar(v) ? this.scalarPart(source, id, v) : null
        const data = await this.getFrameData(source, id)
        return { data, frameId: id, ...(scalarPromise ? { scalar: await scalarPromise } : {}) }
    }

    private getFrameData(source: WindSource, id: number): Promise<WindField | null> {
        const cached = this.cache.get(id)
        if (cached) {
            // 가장 최근에 쓴 것으로 옮긴다. 캐시는 작은 표현(Float32Array)이라 그릴 때 원래 배열로 푼다
            this.cache.delete(id)
            this.cache.set(id, cached)
            return Promise.resolve(expandWindField(cached))
        }
        return this.fetchFrame(source, id)
    }

    private fetchFrame(source: WindSource, id: number): Promise<WindField | null> {
        const running = this.inflight.get(id)
        if (running) return running
        const epoch = this.cacheEpoch
        const frameFn = source.frame
        const p: Promise<WindField | null> = (async () => {
            if (typeof frameFn !== 'function') return null
            try {
                const data = await frameFn.call(source, id)
                if (data != null && !this.destroyed && epoch === this.cacheEpoch) {
                    const compact = compactWindField(data)
                    if (compact) this.remember(id, compact)
                }
                return data
            } finally {
                if (epoch === this.cacheEpoch) this.inflight.delete(id)
            }
        })()
        this.inflight.set(id, p)
        return p
    }

    // ── 스칼라 변수(기온·습도·강수량) ──

    /** 지금 목록에서 프레임(id)의 스칼라 id. 목록에 없거나 서버가 그 변수를 안 주면 undefined */
    private scalarIdFor(frameId: number | null, v: WindScalarVar): number | undefined {
        if (frameId === null) return undefined
        const id = this.state.getState().frames.find(f => f.id === frameId)?.fields?.[v]
        return typeof id === 'number' ? id : undefined
    }

    /** 한 프레임의 스칼라 한 장을 받는다(캐시 우선). 절대 던지지 않는다 — 없거나 실패하면 grid null + 이유 */
    private async scalarPart(source: WindSource, frameId: number | null, v: WindScalarVar): Promise<ScalarPart> {
        const label = WX_COLOR_SCALES[v].label
        const id = this.scalarIdFor(frameId, v)
        if (typeof source.field !== 'function' || id === undefined) {
            return { var: v, frameId, grid: null, note: '이 시각의 ' + label + ' 자료가 아직 없습니다' }
        }
        try {
            const grid = await this.getScalarGrid(source, id)
            return grid ? { var: v, frameId, grid, note: null } : { var: v, frameId, grid: null, note: label + ' 자료를 받지 못했습니다', gone: true }
        } catch {
            return { var: v, frameId, grid: null, note: label + ' 자료를 받지 못했습니다' }
        }
    }

    private getScalarGrid(source: WindSource, id: number): Promise<ScalarGridInfo | null> {
        const cached = this.scalarCache.get(id)
        if (cached) {
            this.scalarCache.delete(id)
            this.scalarCache.set(id, cached)
            return Promise.resolve(cached)
        }
        const running = this.scalarInflight.get(id)
        if (running) return running
        const epoch = this.scalarEpoch
        const fieldFn = source.field
        const p: Promise<ScalarGridInfo | null> = (async () => {
            if (typeof fieldFn !== 'function') return null
            try {
                const grid = readScalarGrid(await fieldFn.call(source, id))
                if (grid && !this.destroyed && epoch === this.scalarEpoch) this.rememberScalar(id, grid)
                return grid
            } finally {
                if (epoch === this.scalarEpoch) this.scalarInflight.delete(id)
            }
        })()
        this.scalarInflight.set(id, p)
        return p
    }

    private rememberScalar(id: number, grid: ScalarGridInfo): void {
        this.scalarCache.delete(id)
        this.scalarCache.set(id, grid)
        const limit = this.cacheLimit()
        while (this.scalarCache.size > limit) {
            const oldest = this.scalarCache.keys().next().value
            if (oldest === undefined) break
            this.scalarCache.delete(oldest)
        }
    }

    private clearScalarCache(): void {
        this.scalarCache.clear()
        this.scalarInflight.clear()
        this.scalarEpoch++
    }

    cachedScalarIds(): number[] {
        return Array.from(this.scalarCache.keys())
    }

    private setOverlayNote(note: string | null): void {
        if (this.state.getState().overlayNote !== note) this.state.setState({ overlayNote: note })
    }

    /**
     * 지금 그려진 바람 프레임의 스칼라를 (고른 변수로) 받아 오버레이에 올린다. 바람은 그대로 둔다.
     * 가장 나중 요청의 결과만 쓰고, 그 사이 변수·프레임이 바뀌었거나 껐으면 버린다
     */
    private syncScalar(session: WindSession): void {
        const v = this.state.getState().overlayVar
        const source = this.currentSource()
        if (!isWindScalarVar(v) || !source || session.cancelled || this.session !== session || !session.field) return
        const frameId = session.shownFrameId
        const token = ++session.scalarToken
        void this.scalarPart(source, frameId, v).then(part => {
            if (session.cancelled || this.session !== session || token !== session.scalarToken) return
            if (this.state.getState().overlayVar !== v || session.shownFrameId !== frameId) return
            try {
                session.scalar = part.grid ? { var: v, frameId, grid: part.grid } : null
                if (part.grid) session.scalarRecoveredKey = null
                this.setOverlayNote(part.note)
                this.renderOverlay(session)
                this.notifyData()
            } catch (err) {
                // 이미지 만들기 등에서 예외 — 처리되지 않은 거부로 남기지 않고 안내로 알린다(바람은 그대로)
                session.scalar = null
                this.setOverlayNote(WX_COLOR_SCALES[v].label + ' 자료를 그리지 못했습니다')
                try { session.overlay?.clear() } catch { /* 이미 해제됨 */ }
                void err
                return
            }
            if (part.gone) this.recoverScalar(session, v)
        })
    }

    /**
     * 목록에는 id가 있는데 서버가 스칼라 한 장을 못 준다(서버 사이클 교체로 지워짐) — 바람 프레임 404와 같은 복구: 목록을 다시 받아
     * (선택·그려진 프레임이 새 id면 바람·스칼라를 새 id로 다시 받고, 같은 id면 스칼라만 다시 시도) 본다. (프레임 id, 변수)마다 한 번만
     */
    private recoverScalar(session: WindSession, v: WindScalarVar): void {
        if (this.destroyed || session.cancelled || this.session !== session) return
        const key = String(session.shownFrameId) + '/' + v
        if (session.scalarRecoveredKey === key) return
        session.scalarRecoveredKey = key
        void this.fetchFrameList(true, true)
    }

    /** 목록을 다시 받았더니 그려진 프레임의 스칼라 id가 새로 생겼으면(서버가 나중에 채움) 한 번 받아 본다. 선택이 다른 프레임이면 그 프레임을 받을 때 같이 받는다 */
    private resyncScalarIfNewlyAvailable(): void {
        const session = this.session
        const st = this.state.getState()
        if (!session || session.cancelled || !session.field || session.scalar || !isWindScalarVar(st.overlayVar)) return
        const sel = st.frameIndex >= 0 ? st.frames[st.frameIndex] : undefined
        if (!sel || sel.id !== session.shownFrameId) return
        if (this.scalarIdFor(session.shownFrameId, st.overlayVar) === undefined) return
        this.syncScalar(session)
    }

    /** 캐시 상한 = 지금 목록의 프레임 수(한 발표분 전체). 예보 범위가 6시간이든 9시간이든 같은 규칙. 프레임당 약 1.1MB(380x372 Float32 2장) */
    private cacheLimit(): number {
        return Math.max(this.state.getState().frames.length, WIND_FRAME_CACHE_MIN)
    }

    private remember(id: number, data: CompactWindField): void {
        this.cache.delete(id)
        this.cache.set(id, data)
        const limit = this.cacheLimit()
        while (this.cache.size > limit) {
            const oldest = this.cache.keys().next().value
            if (oldest === undefined) break
            this.cache.delete(oldest)
        }
    }

    private clearCache(): void {
        this.cache.clear()
        this.inflight.clear()
        this.cacheEpoch++
        this.clearScalarCache()
    }

    /** 재생 중 다음 프레임(끝이면 처음)을 미리 받아 둔다. 실패는 무시(그 프레임을 실제로 쓸 때 다시 시도) */
    private prefetchNext(): void {
        const source = this.currentSource()
        const { frames, frameIndex } = this.state.getState()
        if (!source || typeof source.frame !== 'function' || frames.length < 2) return
        const next = frames[(Math.max(frameIndex, 0) + 1) % frames.length]
        if (!next) return
        if (!this.cache.has(next.id) && !this.inflight.has(next.id)) this.fetchFrame(source, next.id).catch(() => undefined)
        // 스칼라 변수를 골랐으면 다음 프레임의 스칼라도 미리 받는다(두 바퀴째는 요청 0)
        const v = this.state.getState().overlayVar
        if (isWindScalarVar(v) && typeof source.field === 'function') {
            const sid = next.fields?.[v]
            if (typeof sid === 'number' && !this.scalarCache.has(sid) && !this.scalarInflight.has(sid)) this.getScalarGrid(source, sid).catch(() => undefined)
        }
    }

    // ── 재생 ──

    play(): void {
        const st = this.state.getState()
        if (this.destroyed || st.playing || !this.session || st.frames.length < 2) return
        this.state.setState({ playing: true })
        this.prefetchNext()
        this.scheduleNext()
    }

    pause(): void {
        this.clearTimer()
        if (!this.destroyed && this.state.getState().playing) this.state.setState({ playing: false })
    }

    togglePlay(): void {
        if (this.state.getState().playing) this.pause()
        else this.play()
    }

    private clearTimer(): void {
        if (this.timer !== null) {
            clearTimeout(this.timer)
            this.timer = null
        }
    }

    /** 지금 프레임이 그려져 있을 때만 다음 이동을 예약한다(그리기 전에 시간을 세지 않는다) */
    private scheduleNext(): void {
        this.clearTimer()
        const session = this.session
        if (this.destroyed || !session || session.cancelled || !session.field || !this.state.getState().playing) return
        this.timer = setTimeout(() => this.advance(), this.opts.frameIntervalMs ?? WIND_FRAME_INTERVAL_MS)
    }

    private advance(): void {
        this.timer = null
        const st = this.state.getState()
        if (this.destroyed || !st.playing || !this.session) return
        if (st.frames.length < 2) {
            this.pause()
            return
        }
        // 끝이면 처음으로
        void this.setFrame((Math.max(st.frameIndex, 0) + 1) % st.frames.length)
    }

    // ── 표시 옵션 ──

    setDensity(scale: number): void {
        if (this.destroyed || typeof scale !== 'number' || !Number.isFinite(scale)) return
        this.state.setState({ densityScale: clampScale(scale, WIND_DENSITY_MIN, WIND_DENSITY_MAX) })
        this.refreshResolutionOptions()
    }

    setSpeed(scale: number): void {
        if (this.destroyed || typeof scale !== 'number' || !Number.isFinite(scale)) return
        this.state.setState({ speedScale: clampScale(scale, WIND_SPEED_MIN, WIND_SPEED_MAX) })
        this.refreshResolutionOptions()
    }

    setColorBySpeed(colorBySpeed: boolean): void {
        if (this.destroyed) return
        this.state.setState({ colorBySpeed: !!colorBySpeed })
        this.session?.layer?.setWindOptions({ colorScale: this.colorScale() })
    }

    setParticlesVisible(visible: boolean): void {
        if (this.destroyed) return
        this.state.setState({ particlesVisible: !!visible })
        const s = this.session
        if (s && s.field) this.renderLayers(s)
    }

    setOverlay(on: boolean): void {
        if (this.destroyed) return
        const cur = this.state.getState().overlayVar
        this.setOverlayVar(on ? (cur === 'none' ? 'speed' : cur) : 'none')
    }

    setOverlayVar(v: WindOverlayVar): void {
        if (this.destroyed || (v !== 'none' && v !== 'speed' && !isWindScalarVar(v))) return
        if (isWindScalarVar(v)) {
            const source = this.currentSource()
            if (!source || typeof source.field !== 'function') return // 소스가 스칼라를 모르면 무시(풍속·없음만)
        }
        if (v === this.state.getState().overlayVar) return
        // 한 번에 한 변수만 보이므로 이전 변수의 스칼라 캐시를 비우고, 받는 중이던 스칼라 요청 결과도 버린다
        this.clearScalarCache()
        const s = this.session
        if (s) {
            s.scalar = null
            s.scalarToken++
        }
        if (s) s.scalarRecoveredKey = null
        this.state.setState({ overlayVar: v, overlayVisible: v !== 'none', overlayNote: null })
        this.notifyData() // 마우스 값 칸이 옛 변수 값을 붙들고 있지 않게(새 값이 올 때까지 '자료 없음')
        if (!s || !s.field) return
        this.renderOverlay(s)
        if (isWindScalarVar(v)) this.syncScalar(s)
    }

    setOverlayOpacity(opacity: number): void {
        if (this.destroyed || typeof opacity !== 'number' || !Number.isFinite(opacity)) return
        const v = clampScale(opacity, WIND_OVERLAY_OPACITY_MIN, WIND_OVERLAY_OPACITY_MAX)
        this.state.setState({ overlayOpacity: v })
        this.session?.overlay?.setOpacity(v)
    }

    /** 풍속 색 함수 또는 단색. ol-wind 타입 선언은 함수의 반환을 number로 잘못 적어 두어(실제는 CSS 색 문자열) 옵션 타입으로 맞춰 준다 */
    private colorScale(): WindColorScaleOption {
        return this.state.getState().colorBySpeed ? (windSpeedColor as unknown as WindColorScaleOption) : this.monoColor()
    }

    /** 단색: 옵션이 문자열이면 그 색, 함수면 배경지도 모드별, 없으면 위성 = 흰색·그 밖(밝은 바탕) = 진회색 */
    private monoColor(): string {
        const o = this.opts.monoColor
        if (typeof o === 'string') return o
        if (typeof o === 'function') return o(this.basemapMode)
        return this.basemapMode === 'satellite' ? WIND_MONO_COLOR_LIGHT : WIND_MONO_COLOR_DARK
    }

    /** 해상도 기반 계산값 × 배율(배율 1이면 옛 값과 같다) */
    private resolutionOptions(resolution: number, minResolution: number, maxResolution: number): { velocityScale: number; paths: number } {
        const { densityScale, speedScale } = this.state.getState()
        return {
            velocityScale: velocityScaleForResolution(resolution) * speedScale,
            paths: Math.round(pathsForResolution(resolution, minResolution, maxResolution) * densityScale),
        }
    }

    private refreshResolutionOptions(): void {
        const session = this.session
        const layer = session?.layer
        if (!session || !layer || !session.view) return
        const resolution = session.view.getResolution()
        if (resolution == null) return
        layer.setWindOptions(this.resolutionOptions(resolution, session.minResolution, session.maxResolution))
    }

    // ── 지점 바람 ──

    windAt(lon: number, lat: number): WindSample | null {
        return sampleWind(this.session?.field ?? null, lon, lat)
    }

    valueAt(lon: number, lat: number): WindScalarSample | null {
        const s = this.session
        const v = this.state.getState().overlayVar
        if (!s || !s.field || !isWindScalarVar(v)) return null
        const sc = s.scalar
        if (!sc || sc.var !== v || sc.frameId !== s.shownFrameId) return { var: v, value: null }
        return { var: v, value: sampleGrid(sc.grid, lon, lat) }
    }

    watchPointer(listener: (sample: WindSample | null) => void): () => void {
        return this.watchPointerWith((lon, lat) => this.windAt(lon, lat), listener)
    }

    watchPointerValues(listener: (values: WindPointerValues | null) => void): () => void {
        return this.watchPointerWith((lon, lat) => ({ wind: this.windAt(lon, lat), scalar: this.valueAt(lon, lat) }), listener)
    }

    /** 마우스 위치 감시 공통부 — compute(lon, lat)의 결과를 ~100ms 간격으로 알린다(지도 밖이면 null) */
    private watchPointerWith<T>(compute: (lon: number, lat: number) => T | null, listener: (value: T | null) => void): () => void {
        const map = this.map
        if (this.destroyed || !map) return () => undefined
        const olMap = map.olMap
        const now = () => this.now()
        let last: number[] | null = null
        let lastEmit = Number.NEGATIVE_INFINITY
        let timer: ReturnType<typeof setTimeout> | null = null
        let closed = false

        const sampleLast = (): T | null => {
            if (!last) return null
            const [lon, lat] = toLonLat(last, olMap.getView().getProjection())
            return compute(lon, lat)
        }
        const clearPending = () => {
            if (timer !== null) {
                clearTimeout(timer)
                timer = null
            }
        }
        const emit = () => {
            timer = null
            lastEmit = now()
            if (!closed) listener(sampleLast())
        }
        // 앞쪽 즉시 + 뒤쪽 마무리(마우스가 멈춘 자리의 값을 놓치지 않는다)
        const onMove = (e: { coordinate: number[] }) => {
            last = e.coordinate
            const wait = WIND_POINTER_THROTTLE_MS - (now() - lastEmit)
            if (wait <= 0) {
                clearPending()
                emit()
            } else if (timer === null) {
                timer = setTimeout(emit, wait)
            }
        }
        const onLeave = () => {
            last = null
            clearPending()
            if (!closed) listener(null)
        }
        const onData = () => {
            if (last && !closed) listener(sampleLast())
        }

        olMap.on('pointermove', onMove)
        const viewport = olMap.getViewport()
        viewport.addEventListener('pointerleave', onLeave)
        this.dataListeners.add(onData)

        const cleanup = () => {
            if (closed) return
            closed = true
            clearPending()
            olMap.un('pointermove', onMove)
            viewport.removeEventListener('pointerleave', onLeave)
            this.dataListeners.delete(onData)
            this.pointerCleanups.delete(cleanup)
        }
        this.pointerCleanups.add(cleanup)
        return cleanup
    }

    private notifyData(): void {
        Array.from(this.dataListeners).forEach(fn => fn())
    }

    // ── 표시 ──

    /** 옛 effect 본문(enabled = true). 프레임 목록이 있으면 선택 프레임, 없으면 옛처럼 latest() */
    private start(): void {
        const map = this.map
        const source = this.opts.source ?? map?.sources.wind
        if (!map || !source) return
        const session: WindSession = {
            cancelled: false, layer: null, overlay: null, unsubscribeResolution: null,
            requestId: 0, field: null, shownFrameId: null, shownValid: null, shownList: null, busy: false, scalar: null, scalarToken: 0, scalarRecoveredKey: null, view: null, minResolution: 0, maxResolution: 0,
        }
        this.session = session
        const frameSource = typeof source.frame === 'function' ? source : null
        void this.loadInto(session, async () => {
            // 목록을 받는 중이면(탭을 열자마자 켠 경우) 끝나길 기다렸다가 선택 프레임으로 받는다 — 무거운 latest()를 피한다
            if (this.framesPromise) await this.framesPromise.catch(() => undefined)
            const { frames, frameIndex } = this.state.getState()
            const frame = frameSource && frameIndex >= 0 ? frames[frameIndex] : undefined
            if (frameSource && frame) return this.loadFrameResult(frameSource, frame.id)
            return { data: await source.latest(), frameId: null }
        }, {})
    }

    /**
     * 데이터를 받아 그린다. 이 세션에서 가장 나중에 시작한 요청의 결과만 쓰고, 앞선 요청이나 끈 뒤의 결과는 버린다(cancelled).
     * 실패(404·예외·자료 없음)면 선택을 그려진 프레임으로 되돌리고 error를 둔다. 프레임이 서버에서 사라진 404는 목록을 한 번 다시 받아 복구한다
     */
    private async loadInto(session: WindSession, fetcher: () => Promise<LoadResult>, opts: LoadOpts): Promise<void> {
        const requestId = ++session.requestId
        const current = () => !session.cancelled && requestId === session.requestId
        session.busy = true
        this.state.setState({ loading: true, error: null, ...(opts.notice === undefined ? { notice: null } : {}) })
        try {
            const res = await fetcher()
            if (!current()) return
            if (res.frameId !== null && this.session === session) {
                // 받는 사이에 목록이 바뀌어 선택이 다른 프레임이 됐다(그린 것이 아직 없어 syncShownFrame이 못 잡는 첫 받기 포함) —
                // 늦게 온 옛 프레임은 그리지 않고(캐시에는 남는다) 지금 선택된 프레임을 받는다
                const cur = this.state.getState()
                const sel = cur.frameIndex >= 0 ? cur.frames[cur.frameIndex] : undefined
                const source = this.currentSource()
                if (sel && sel.id !== res.frameId && source && typeof source.frame === 'function') {
                    await this.loadInto(session, this.frameFetcher(source, sel.id), opts)
                    return
                }
            }
            if (res.data == null) {
                // 받을 데이터가 없다. 재생 중이면 멈춘다 — 다음 이동을 예약할 곳이 없다
                this.pause()
                if (res.frameId !== null && !opts.recovered) {
                    await this.recoverFrames(session)
                    return
                }
                this.failLoad(session, opts, MSG_FRAME_FAILED)
                return
            }
            this.applyData(session, res.data, res.frameId, res.scalar)
            if (opts.notice) this.state.setState({ notice: opts.notice })
        } catch (err) {
            if (current()) {
                this.failLoad(session, opts, errorMessage(err))
                this.pause()
            }
        } finally {
            if (current()) {
                session.busy = false
                this.state.setState({ loading: false })
            }
        }
    }

    /**
     * 받기 실패: 오류 문구를 두고, 선택을 지금 그려진 프레임으로 되돌린다(시각 글과 그림이 어긋나지 않게).
     * 기준은 그릴 때 확정해 둔 것: ① 현재 목록에 그려진 id가 있으면 그 자리 ② 같은 유효시각 자리 ③ 그 시각이 현재 목록에 없으면 그때의 목록 통째로(오래됨은 지금 시각으로 다시 계산)
     * ④ 그린 것이 없으면(latest()·첫 받기) 호출한 쪽이 알려 준 되돌릴 index
     */
    private failLoad(session: WindSession, opts: LoadOpts, message: string): void {
        this.lastFailure = 'frame'
        const { frames, frameIndex: target } = this.state.getState()
        this.retryIndex = target
        const byId = session.shownFrameId !== null ? frames.findIndex(f => f.id === session.shownFrameId) : -1
        const byValid = byId < 0 && session.shownValid !== null ? frames.findIndex(f => f.validTime === session.shownValid) : -1
        const back = byId >= 0 ? byId : byValid
        if (back >= 0) {
            this.state.setState({ error: message, frameIndex: back })
        } else if (session.shownList) {
            const r = session.shownList
            this.state.setState({ error: message, frames: r.frames, frameIndex: r.frameIndex, framesLoadedAt: r.framesLoadedAt, stale: windStaleKind(r.frames, this.now()) })
            // 목록을 되돌렸으니 다시 시도는 목록부터(되돌리기 전 목록의 index를 새 목록에 쓰지 않는다)
            this.lastFailure = 'frames'
        } else if (opts.revertTo !== undefined && opts.revertTo >= 0 && opts.revertTo < frames.length) {
            this.state.setState({ error: message, frameIndex: opts.revertTo })
        } else {
            this.state.setState({ error: message })
        }
    }

    /** 선택한 프레임이 서버에 없다(404) — 프레임 목록을 한 번 다시 받아 같은 유효시각(없으면 지금) 프레임으로 다시 받는다. 두 번째 실패는 오류로 둔다 */
    private async recoverFrames(session: WindSession): Promise<void> {
        const source = this.currentSource()
        if (!source || typeof source.frame !== 'function' || typeof source.frames !== 'function') {
            this.failLoad(session, {}, MSG_FRAME_FAILED)
            return
        }
        await this.fetchFrameList(true, false)
        if (session.cancelled || this.session !== session) return
        const after = this.state.getState()
        if (this.lastFailure === 'frames' && after.error !== null) {
            // 목록 받기가 실패 — 선택을 그려진 프레임으로 되돌리고 오류를 둔다(다시 시도는 목록부터)
            this.failLoad(session, {}, after.error)
            this.lastFailure = 'frames'
            return
        }
        // 새 프레임 받기가 또 실패하면 failLoad가 그릴 때 확정해 둔 기준(옛 목록의 그린 시각)으로 되돌린다 — 목록이 이미 바뀌었어도 기준은 그대로
        const frame = after.frameIndex >= 0 ? after.frames[after.frameIndex] : undefined
        if (!frame) {
            this.failLoad(session, {}, '예보 자료가 없습니다.')
            return
        }
        await this.loadInto(session, this.frameFetcher(source, frame.id), { recovered: true, notice: MSG_RECOVERED })
    }

    /** 받은 데이터를 보여 준다: 입자(켜져 있으면 첫 데이터에 레이어를 만들고, 이미 있으면 데이터만 교체)·오버레이(켜져 있으면 이미지 다시 만들기) */
    private applyData(session: WindSession, data: WindField, frameId: number | null, scalar?: ScalarPart): void {
        if (!this.map) return
        session.field = data
        session.shownFrameId = frameId
        session.scalarToken++ // 이전 스칼라 요청(변수 바꾸기)은 이 프레임 것이 아니므로 버린다
        this.captureShown(session)
        // 스칼라: 지금 고른 변수와 같은 변수로 함께 받았으면 바람과 같이 바꾼다. 아니면(받는 사이에 변수가 바뀜) 비우고 새로 받는다
        const ov = this.state.getState().overlayVar
        let resync = false
        if (isWindScalarVar(ov)) {
            if (scalar && scalar.var === ov) {
                session.scalar = scalar.grid ? { var: ov, frameId, grid: scalar.grid } : null
                if (scalar.grid) session.scalarRecoveredKey = null
                this.setOverlayNote(scalar.note)
            } else {
                session.scalar = null
                resync = true
            }
        } else {
            session.scalar = null
            this.setOverlayNote(null)
        }
        this.renderLayers(session)
        this.notifyData()
        if (this.state.getState().playing) {
            this.prefetchNext()
            this.scheduleNext()
        }
        if (resync) this.syncScalar(session)
        else if (scalar && scalar.gone && isWindScalarVar(ov) && scalar.var === ov) this.recoverScalar(session, ov)
    }

    /** 상태(입자·오버레이 켬/끔)에 맞게 지도의 레이어를 만들고·바꾸고·뗀다 */
    private renderLayers(session: WindSession): void {
        const map = this.map
        const data = session.field
        if (!map || !data) return
        const st = this.state.getState()
        if (st.particlesVisible) {
            if (session.layer) session.layer.setData(data)
            else this.createLayer(session, map, data)
        } else {
            this.removeParticleLayer(session)
        }
        this.renderOverlay(session)
    }

    /** 색상 오버레이를 고른 값(overlayVar)에 맞게 만들고·바꾸고·뗀다. 스칼라는 그 프레임 것을 받았을 때만 칠하고 아니면 비운다(옛 시각 그림이 남지 않게) */
    private renderOverlay(session: WindSession): void {
        const map = this.map
        const data = session.field
        if (!map || !data) return
        const st = this.state.getState()
        const v = st.overlayVar
        if (v === 'none') {
            this.removeOverlay(session)
            return
        }
        if (!session.overlay) {
            session.overlay = createWindOverlay({ opacity: st.overlayOpacity, zIndex: OVERLAY_Z_INDEX })
            map.olMap.addLayer(session.overlay.layer)
        }
        if (v === 'speed') {
            session.overlay.update(data)
            return
        }
        const sc = session.scalar
        if (sc && sc.var === v && sc.frameId === session.shownFrameId) session.overlay.updateScalar(sc.grid, WX_COLOR_SCALES[v])
        else session.overlay.clear()
    }

    /** 옛 effect의 레이어 만들기(값·순서 그대로) — 배율이 1이면 옛 계산값 그대로 */
    private createLayer(session: WindSession, map: GisMap, data: WindField): void {
        const olMap = map.olMap
        const view = olMap.getView()
        const initialResolution = view.getResolution() ?? 14
        const minResolution = view.getMinResolution()
        const maxResolution = view.getMaxResolution()
        session.view = view
        session.minResolution = minResolution
        session.maxResolution = maxResolution

        const { velocityScale, paths } = this.resolutionOptions(initialResolution, minResolution, maxResolution)
        const layer = new WindLayer(data, {
            windOptions: {
                velocityScale,
                paths,
                frameRate: 50,
                lineWidth: 2.5,
                colorScale: this.colorScale(),
            },
        })
        layer.setZIndex(PARTICLE_Z_INDEX)
        // LDAPS 격자(약 2.2km)보다 훨씬 가깝게 확대하면(대략 동 블록 단위 이하)
        // 실제 데이터가 표현할 수 있는 수준을 넘어서므로 레이어를 숨긴다.
        // layer.setMinResolution(MIN_RESOLUTION)
        olMap.addLayer(layer)
        session.layer = layer

        // 줌이 바뀔 때마다 velocityScale을 재계산해서 화면상 선 길이를 일정하게 유지
        const handleResolutionChange = () => {
            const resolution = view.getResolution()
            if (resolution == null) return
            layer.setWindOptions(this.resolutionOptions(resolution, minResolution, maxResolution))
        }
        view.on('change:resolution', handleResolutionChange)
        session.unsubscribeResolution = () => view.un('change:resolution', handleResolutionChange)
    }

    /** 입자 레이어와 해상도 구독을 뗀다(데이터는 그대로). ol-wind가 한 번도 그려지기 전에 떼면 던지는 오류는 무시 */
    private removeParticleLayer(session: WindSession): void {
        session.unsubscribeResolution?.()
        session.unsubscribeResolution = null
        if (session.layer) {
            try {
                this.map?.olMap.removeLayer(session.layer)
            } catch {
                /* 아직 그려진 적 없는 ol-wind 레이어를 뗄 때의 내부 오류 — 이미 지도 레이어 목록에서는 빠졌다 */
            }
            session.layer = null
        }
    }

    private removeOverlay(session: WindSession): void {
        if (!session.overlay) return
        this.map?.olMap.removeLayer(session.overlay.layer)
        session.overlay.destroy()
        session.overlay = null
    }

    /** 옛 effect 정리 함수 */
    private stop(): void {
        this.clearTimer()
        const session = this.session
        if (!session) return
        this.session = null
        session.cancelled = true
        this.removeParticleLayer(session)
        this.removeOverlay(session)
        session.field = null
        this.clearCache()
        if (!this.destroyed) {
            this.state.setState({ loading: false, playing: false, overlayNote: null })
            this.notifyData()
        }
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
