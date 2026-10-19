'use client'

// 바람지도 패널 — 바람길 플러그인(map.use(createWindPlugin()))의 상태를 조절한다. 스타일: gm-panel(머리줄 공용), gm-wind-panel
// 구성(위 → 아래): 머리줄 · (자료 오래됨 경고) · 발표시각(+예보 범위) · 예보시각(◀ 재생 ▶ + 슬라이더) · 표출(입자 애니메이션 · 입자 풍속 색 ·
//   색상 오버레이 없음/풍속/기온/습도(/강수량) + 진하기) · 입자 밀도 · 애니메이션 속도 · 범례(고른 오버레이 값) · 마우스 값(바람 + 고른 변수) ·
//   켜기/끄기(+ 오류·안내) · 유의사항
// 기온·습도·강수량은 소스에 field()가 있고 서버가 프레임마다 id를 줄 때만 선택지가 나온다(없으면 풍속만). 고르기 전에는 스칼라를 받지 않는다.
// 열기만 해서는 바람 데이터를 받지 않는다 — 프레임 **목록**(가벼움)만 처음 열 때 한 번(플러그인이 중복 요청을 막고, 30분이 넘었거나 자료가 오래됐을 때만 다시 받는다).
// 데이터는 "바람 켜기"에서. 바람 켬 여부는 플러그인 상태 하나(툴바 바람 버튼과 공유)라 패널을 닫아도 유지되고, 이 패널은 언마운트 때 구독만 푼다.
// 참조 안정성: 상태 선택자·고정 목록은 모듈 상수, 콜백은 useCallback, 눈금은 useMemo(frames가 바뀔 때만).
import { memo, useCallback, useEffect, useMemo } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, Info, Loader2, Pause, Play } from 'lucide-react'
import {
    EMPTY_WIND_STATE, WIND_DENSITY_MAX, WIND_DENSITY_MIN, WIND_LEGEND_MAX_SPEED, WIND_OVERLAY_OPACITY_MAX, WIND_OVERLAY_OPACITY_MIN,
    WIND_OVERLAY_OPACITY_STEP, WIND_SCALE_STEP, WIND_SPEED_MAX, WIND_SPEED_MIN, WIND_STALE_CHECK_MS,
    WX_COLOR_SCALES, WX_SCALAR_VARS, formatForecastHourShort, formatForecastRange, formatForecastTime, formatIssueTime, formatScalarValue,
    formatWindSample, isWindScalarVar,
} from '../../core'
import type { WindFrameMeta, WindOverlayVar, WindScalarVar, WindState } from '../../core'
import type { WindPlugin } from '../../core/wind'
import { useStoreValue, useWindPlugin, useWindPointerValues } from '../../react'
import { cx } from '../cx'
import { WIND_LEGEND_TICKS, windGradientCss, wxGradientCss, wxLegendTicks } from '../overlay/windGradient'

const selectState = (s: WindState): WindState => s

/** 범례 막대(0 ~ WIND_LEGEND_MAX_SPEED m/s) — 모서리 범례와 같은 눈금 */
const LEGEND_GRADIENT = windGradientCss(WIND_LEGEND_MAX_SPEED)

/** 프레임 눈금 글자가 겹치지 않게: 프레임이 이보다 많으면 한 칸 걸러 쓴다(슬라이더 폭 232px에 '09시' 글자 약 20px) */
const MARK_ALL_MAX = 8

interface RangeMark {
    key: string
    label: string
    /** 슬라이더 길이 안의 위치(0~1) */
    ratio: number
}

const DENSITY_MARKS: readonly RangeMark[] = Object.freeze([
    { key: 'less', label: '적게', ratio: 0 },
    { key: 'normal', label: '보통', ratio: (1 - WIND_DENSITY_MIN) / (WIND_DENSITY_MAX - WIND_DENSITY_MIN) },
    { key: 'more', label: '많게', ratio: 1 },
])

const NOTICE_LINE_1 = '기상청 국지예보모델(LDAPS) 예보를 약 2km 격자로 다시 나눈 값으로, 실제 관측값과 다를 수 있습니다.'

const HINT_HOVER = '지도 위에 마우스를 올리면 풍속·풍향이 표시됩니다'
const HINT_OFF = '바람을 켜면 풍속·풍향을 볼 수 있습니다'
const MSG_FRAME_FAILED = '예보 자료를 받지 못했습니다.'
/** 플러그인이 스칼라 받기 실패 안내를 이 말로 끝낸다 — 이 안내에만 "다시 시도"를 붙인다('아직 없습니다'는 서버가 채워야 해서 다시 해도 소용없다) */
const NOTE_FAILED_SUFFIX = '받지 못했습니다'

/** 오버레이 선택지 — 없음·풍속은 늘 있고, 기온·습도·강수량은 소스가 스칼라를 받을 수 있고 서버가 그 변수를 줄 때만(core WX_SCALAR_VARS) */
const OVERLAY_NONE = 'none'
const OVERLAY_SPEED = 'speed'

function isOverlayVar(value: string): value is WindOverlayVar {
    return value === OVERLAY_NONE || value === OVERLAY_SPEED || isWindScalarVar(value)
}

/** 유의사항 3번째 줄 — 서버가 주는 스칼라 변수 이름으로('기온·습도도 …'). 변수가 없으면 줄 자체를 뺀다 */
function noticeLine3(vars: readonly WindScalarVar[]): string | null {
    if (vars.length === 0) return null
    const names = vars.map(v => WX_COLOR_SCALES[v].label).join('·')
    return names + '도 같은 모델(LDAPS)의 예보값입니다.'
}

function densityLabel(scale: number): string {
    return scale < 1 ? '적게' : scale > 1 ? '많게' : '보통'
}

/** 1 → '1.0', 0.25 → '0.25', 1.5 → '1.5' */
function formatScale(scale: number): string {
    const text = scale.toFixed(2)
    return (text.endsWith('0') ? text.slice(0, -1) : text) + '×'
}

/** 유의사항 2번째 줄 — 예보 범위(시간)는 서버가 정한 값이라 프레임 목록에서 읽는다(목록이 없으면 그 부분을 뺀다) */
function noticeLine2(frames: readonly WindFrameMeta[]): string {
    const base = '하루 4회(03·09·15·21시) 발표분을 발표 1~2시간 뒤 반영하며'
    if (frames.length === 0) return base + ' 발표시각부터 일정 시간 동안의 예보입니다.'
    return base + ', 발표시각부터 ' + frames.length + '시간 동안의 예보입니다.'
}

/** 슬라이더 아래 눈금 글자. 위치는 슬라이더 막대 길이(손잡이 반폭을 뺀 안쪽)에 비례 */
const RangeMarks = memo(function RangeMarks({ marks, inset }: { marks: readonly RangeMark[]; inset?: boolean }) {
    return (
        <div className={cx('gm-wind-panel__marks', inset && 'gm-wind-panel__marks--inset')}>
            {marks.map(m => (
                <span key={m.key} className="gm-wind-panel__mark" style={{ left: `calc(7px + (100% - 14px) * ${m.ratio})` }}>
                    {m.label}
                </span>
            ))}
        </div>
    )
})

interface WindSectionProps {
    wind: WindPlugin
    state: WindState
}

/** 자료 오래됨 경고 — 모든 예보가 지났거나 발표가 오래됐을 때 숨기지 않고 알린다 */
function WindStaleAlert({ wind, state }: WindSectionProps) {
    const { stale, frames } = state
    const onReload = useCallback(() => void wind.reloadFrames(), [wind])
    if (!stale || frames.length === 0) return null
    const last = frames.reduce((a, b) => (b.forecastHour > a.forecastHour ? b : a), frames[0])
    const issued = formatIssueTime(frames[0])
    return (
        <div className="gm-wind-panel__alert" role="alert">
            <AlertTriangle size={14} className="gm-wind-panel__alert-icon" />
            <div className="gm-wind-panel__alert-body">
                <div className="gm-wind-panel__alert-title">자료가 오래됐습니다</div>
                <div className="gm-wind-panel__alert-text">
                    {stale === 'past'
                        ? '가장 늦은 예보가 ' + formatForecastTime(last) + '로 이미 지났습니다. 서버가 새 발표분을 아직 반영하지 못했을 수 있습니다.'
                        : (issued ?? '발표') + '로 12시간 넘게 지났습니다. 서버가 새 발표분을 아직 반영하지 못했을 수 있습니다.'}
                </div>
                <button type="button" className="gm-wind-panel__link" onClick={onReload}>예보 목록 다시 받기</button>
            </div>
        </div>
    )
}

/** 발표시각 + 예보시각(◀ 재생 ▶ + 슬라이더). 프레임 목록 상태에 따라 안내문으로 바뀐다 */
function WindFramesSection({ wind, state }: WindSectionProps) {
    const { frames, framesStatus, frameIndex, playing, visible } = state
    const current: WindFrameMeta | undefined = frames[Math.max(frameIndex, 0)]
    const issueBase = frames.length > 0 ? formatIssueTime(frames[0]) : null
    const rangeText = frames.length > 0 ? formatForecastRange(frames) : null
    const issueText = issueBase === null ? null : rangeText === null ? issueBase : issueBase + ' · ' + rangeText
    const last = frames.length - 1

    const marks = useMemo<RangeMark[]>(() => {
        const step = frames.length > MARK_ALL_MAX ? 2 : 1
        return frames
            .map((f, i) => ({ key: String(f.id), label: formatForecastHourShort(f), ratio: last > 0 ? i / last : 0, i }))
            .filter(m => m.i % step === 0 || m.i === last)
            .map(({ key, label, ratio }) => ({ key, label, ratio }))
    }, [frames, last])
    const onPrev = useCallback(() => void wind.stepFrame(-1), [wind])
    const onNext = useCallback(() => void wind.stepFrame(1), [wind])
    const onPlay = useCallback(() => wind.togglePlay(), [wind])
    const onSlide = useCallback((e: ChangeEvent<HTMLInputElement>) => void wind.setFrame(Number(e.target.value)), [wind])
    const onRetry = useCallback(() => void wind.reloadFrames(), [wind])

    let body: ReactNode
    if (framesStatus === 'idle' || framesStatus === 'loading') {
        body = (
            <div className="gm-wind-panel__note">
                <Loader2 size={12} className="gm-loader gm-loader--primary" /> 예보 목록을 불러오는 중…
            </div>
        )
    } else if (framesStatus === 'unsupported') {
        body = <div className="gm-wind-panel__note">이 서버는 시간별 예보를 제공하지 않아 현재 시각의 바람만 표시합니다.</div>
    } else if (framesStatus === 'error') {
        body = (
            <div className="gm-wind-panel__note gm-wind-panel__note--error">
                예보 목록을 받지 못했습니다.
                <button type="button" className="gm-wind-panel__link" onClick={onRetry}>다시 시도</button>
            </div>
        )
    } else if (!current) {
        body = <div className="gm-wind-panel__note">예보 자료가 아직 없습니다.</div>
    } else {
        body = (
            <>
                <div className="gm-wind-panel__time">{formatForecastTime(current)}</div>
                <div className="gm-wind-panel__transport">
                    <button type="button" className="gm-wind-panel__btn" title="이전 예보" aria-label="이전 예보"
                        disabled={frameIndex <= 0} onClick={onPrev}>
                        <ChevronLeft size={15} />
                    </button>
                    <button type="button" className={cx('gm-wind-panel__btn', 'gm-wind-panel__btn--play', playing && 'gm-is-active')}
                        title={playing ? '일시정지' : '재생'} aria-label={playing ? '일시정지' : '재생'}
                        disabled={!visible || frames.length < 2} onClick={onPlay}>
                        {playing ? <Pause size={14} /> : <Play size={14} />}
                    </button>
                    <button type="button" className="gm-wind-panel__btn" title="다음 예보" aria-label="다음 예보"
                        disabled={frameIndex >= last} onClick={onNext}>
                        <ChevronRight size={15} />
                    </button>
                </div>
                <input type="range" className="gm-layer-tree__opacity-range gm-wind-panel__range" aria-label="예보시각"
                    min={0} max={last} step={1} value={Math.max(frameIndex, 0)} onChange={onSlide} />
                <RangeMarks marks={marks} />
            </>
        )
    }

    return (
        <>
            <div className="gm-wind-panel__section">
                <span className="gm-wind-panel__label">발표시각</span>
                <span className="gm-wind-panel__issue">{issueText ?? '—'}</span>
            </div>
            <div className="gm-wind-panel__section">
                <span className="gm-wind-panel__label">예보시각</span>
                {body}
            </div>
        </>
    )
}

/** 표출(입자 · 입자 풍속 색 · 색상 오버레이 + 진하기) + 입자 밀도 + 애니메이션 속도 */
function WindOptionsSection({ wind, state }: WindSectionProps) {
    const { particlesVisible, colorBySpeed, baseVeil, overlayVisible, overlayVar, overlayNote, scalarSupported, scalarVars, overlayOpacity, densityScale, speedScale } = state
    const onParticles = useCallback((e: ChangeEvent<HTMLInputElement>) => wind.setParticlesVisible(e.target.checked), [wind])
    const onVeil = useCallback((e: ChangeEvent<HTMLInputElement>) => wind.setBaseVeil(e.target.checked), [wind])
    const onColor = useCallback((e: ChangeEvent<HTMLInputElement>) => wind.setColorBySpeed(e.target.checked), [wind])
    const onRetry = useCallback(() => wind.retry(), [wind])
    const onOverlay = useCallback((e: ChangeEvent<HTMLSelectElement>) => {
        if (isOverlayVar(e.target.value)) wind.setOverlayVar(e.target.value)
    }, [wind])
    // 스칼라 선택지: 소스가 스칼라를 받을 수 있을 때만. 서버가 안 주는 변수는 '(자료 없음)'으로 비활성(강수량은 서버가 줄 때만 보인다)
    const scalarOptions = scalarSupported ? WX_SCALAR_VARS.filter(v => v !== 'rain' || scalarVars.includes(v) || v === overlayVar) : []
    const onOpacity = useCallback((e: ChangeEvent<HTMLInputElement>) => wind.setOverlayOpacity(Number(e.target.value)), [wind])
    const onDensity = useCallback((e: ChangeEvent<HTMLInputElement>) => wind.setDensity(Number(e.target.value)), [wind])
    const onSpeed = useCallback((e: ChangeEvent<HTMLInputElement>) => wind.setSpeed(Number(e.target.value)), [wind])

    return (
        <>
            <div className="gm-wind-panel__section">
                <span className="gm-wind-panel__label">표출</span>
                <label className="gm-wind-panel__check">
                    <input type="checkbox" className="gm-wind-panel__check-input" checked={particlesVisible} onChange={onParticles} />
                    <span>바람 입자 애니메이션</span>
                </label>
                <label className={cx('gm-wind-panel__check', !particlesVisible && 'gm-is-disabled')}>
                    <input type="checkbox" className="gm-wind-panel__check-input" checked={colorBySpeed} disabled={!particlesVisible} onChange={onColor} />
                    <span>입자에 풍속 색상</span>
                </label>
                <label className={cx('gm-wind-panel__check', (!particlesVisible || overlayVar !== OVERLAY_NONE) && 'gm-is-disabled')}>
                    <input type="checkbox" className="gm-wind-panel__check-input" checked={baseVeil} disabled={!particlesVisible || overlayVar !== OVERLAY_NONE} onChange={onVeil} />
                    <span>바탕 깔기</span>
                </label>
            </div>
            <div className="gm-wind-panel__section">
                <div className="gm-layer-tree__opacity">
                    <span className="gm-layer-tree__ctrl-label gm-wind-panel__ctrl-label">색상 오버레이</span>
                    <select className="gm-wind-panel__select" aria-label="색상 오버레이" value={overlayVar} onChange={onOverlay}>
                        <option value={OVERLAY_NONE}>없음</option>
                        <option value={OVERLAY_SPEED}>풍속 (m/s)</option>
                        {scalarOptions.map(v => {
                            const has = scalarVars.includes(v)
                            return (
                                <option key={v} value={v} disabled={!has && v !== overlayVar}>
                                    {WX_COLOR_SCALES[v].legendTitle + (has ? '' : ' (자료 없음)')}
                                </option>
                            )
                        })}
                    </select>
                </div>
                {overlayNote && (
                    <div className="gm-wind-panel__note gm-wind-panel__note--info" role="status">
                        <Info size={12} /> {overlayNote}
                        {overlayNote.endsWith(NOTE_FAILED_SUFFIX) && (
                            <button type="button" className="gm-wind-panel__link" onClick={onRetry}>다시 시도</button>
                        )}
                    </div>
                )}
                <div className={cx('gm-layer-tree__opacity', !overlayVisible && 'gm-is-disabled')}>
                    <span className="gm-layer-tree__ctrl-label gm-wind-panel__ctrl-label">오버레이 진하기</span>
                    <input type="range" className="gm-layer-tree__opacity-range" aria-label="오버레이 진하기" disabled={!overlayVisible}
                        min={WIND_OVERLAY_OPACITY_MIN} max={WIND_OVERLAY_OPACITY_MAX} step={WIND_OVERLAY_OPACITY_STEP} value={overlayOpacity} onChange={onOpacity} />
                    <span className="gm-layer-tree__opacity-value gm-wind-panel__value-text">{Math.round(overlayOpacity * 100)}%</span>
                </div>
            </div>
            <div className="gm-wind-panel__section">
                <div className="gm-layer-tree__opacity">
                    <span className="gm-layer-tree__ctrl-label gm-wind-panel__ctrl-label">입자 밀도</span>
                    <input type="range" className="gm-layer-tree__opacity-range" aria-label="입자 밀도"
                        min={WIND_DENSITY_MIN} max={WIND_DENSITY_MAX} step={WIND_SCALE_STEP} value={densityScale} onChange={onDensity} />
                    <span className="gm-layer-tree__opacity-value gm-wind-panel__value-text">{densityLabel(densityScale)}</span>
                </div>
                <RangeMarks marks={DENSITY_MARKS} inset />
            </div>
            <div className="gm-wind-panel__section">
                <div className="gm-layer-tree__opacity">
                    <span className="gm-layer-tree__ctrl-label gm-wind-panel__ctrl-label">애니메이션 속도</span>
                    <input type="range" className="gm-layer-tree__opacity-range" aria-label="애니메이션 속도"
                        min={WIND_SPEED_MIN} max={WIND_SPEED_MAX} step={WIND_SCALE_STEP} value={speedScale} onChange={onSpeed} />
                    <span className="gm-layer-tree__opacity-value gm-wind-panel__value-text">{formatScale(speedScale)}</span>
                </div>
            </div>
        </>
    )
}

/** 범례 막대 — 고른 오버레이 값을 따른다. 스칼라 변수면 그 변수의 색 규칙(wxColorScales), 없음·풍속이면 풍속(입자·풍속 오버레이와 같은 WIND_COLOR_STOPS) */
const WindLegendSection = memo(function WindLegendSection({ overlayVar }: { overlayVar: WindOverlayVar }) {
    if (isWindScalarVar(overlayVar)) {
        const scale = WX_COLOR_SCALES[overlayVar]
        return (
            <div className="gm-wind-panel__section">
                <span className="gm-wind-panel__label">{'색상 오버레이 · ' + scale.legendTitle}</span>
                <div className="gm-wind-panel__legend-bar" style={{ background: wxGradientCss(scale) }} />
                <div className="gm-wind-panel__legend-ticks gm-wind-panel__legend-ticks--pos">
                    {wxLegendTicks(scale).map(t => (
                        <span key={t.key} className="gm-wind-panel__legend-tick gm-wind-panel__legend-tick--pos" style={{ left: t.percent + '%' }}>{t.label}</span>
                    ))}
                </div>
            </div>
        )
    }
    return (
        <div className="gm-wind-panel__section">
            <span className="gm-wind-panel__label">풍속 (m/s)</span>
            <div className="gm-wind-panel__legend-bar" style={{ background: LEGEND_GRADIENT }} />
            <div className="gm-wind-panel__legend-ticks">
                {WIND_LEGEND_TICKS.map(speed => <span key={speed} className="gm-wind-panel__legend-tick">{speed}</span>)}
            </div>
        </div>
    )
})

/** 마우스 아래 풍속·풍향(첫 줄) + 고른 스칼라 변수 값(둘째 줄) — 켜져 있는 동안에만 지도 pointermove를 구독한다(이 컴포넌트만 다시 그려진다) */
function WindPointerSection({ visible, overlayVar }: { visible: boolean; overlayVar: WindOverlayVar }) {
    const values = useWindPointerValues(visible)
    const sample = values?.wind ?? null
    const scalar = isWindScalarVar(overlayVar) ? values?.scalar ?? null : null
    return (
        <div className="gm-wind-panel__section">
            <span className="gm-wind-panel__label">마우스 위치의 바람</span>
            <div className={cx('gm-wind-panel__readout', sample && 'gm-is-active', isWindScalarVar(overlayVar) && 'gm-wind-panel__readout--multi')} aria-live="polite">
                <span>{sample ? formatWindSample(sample) : visible ? HINT_HOVER : HINT_OFF}</span>
                {scalar && <span>{formatScalarValue(scalar.var, scalar.value)}</span>}
            </div>
        </div>
    )
}

function WindPanelBody({ wind }: { wind: WindPlugin }) {
    const state = useStoreValue(wind.store, selectState, EMPTY_WIND_STATE)
    // 프레임 목록(가벼움)만 받는다. 열기만 해서는 바람 데이터를 받지 않는다. 같은 목록 요청은 플러그인이 하나로 합치고,
    // 받은 지 30분이 안 됐고 자료가 오래되지 않았으면 다시 받지 않는다(플러그인이 판단)
    useEffect(() => {
        void wind.loadFrames()
    }, [wind])
    // 패널이 열려 있는 동안 자료 오래됨을 1분마다 다시 따진다(목록을 새로 받지는 않는다 — 배너가 뜨면 사용자가 "다시 받기")
    useEffect(() => {
        wind.refreshStale()
        const id = setInterval(() => wind.refreshStale(), WIND_STALE_CHECK_MS)
        return () => clearInterval(id)
    }, [wind])
    const onToggle = useCallback(() => wind.toggle(), [wind])
    const onRetry = useCallback(() => wind.retry(), [wind])
    const { visible, loading, error, notice, frames, overlayVar, scalarVars } = state
    const notice2 = useMemo(() => noticeLine2(frames), [frames])
    const notice3 = useMemo(() => noticeLine3(scalarVars), [scalarVars])

    return (
        <div className="gm-panel">
            <div className="gm-panel__header">
                <span className="gm-panel__title">바람지도</span>
            </div>
            <div className="gm-wind-panel__body">
                <WindStaleAlert wind={wind} state={state} />
                <WindFramesSection wind={wind} state={state} />
                <WindOptionsSection wind={wind} state={state} />
                <WindLegendSection overlayVar={overlayVar} />
                <WindPointerSection visible={visible} overlayVar={overlayVar} />
                <div className="gm-wind-panel__section">
                    <button type="button" className={cx('gm-wind-panel__toggle', visible && 'gm-is-on')} onClick={onToggle}>
                        {visible ? '바람 끄기' : '바람 켜기'}
                    </button>
                    {loading && (
                        <div className="gm-wind-panel__note">
                            <Loader2 size={12} className="gm-loader gm-loader--primary" /> 바람 데이터를 받는 중…
                        </div>
                    )}
                    {!loading && error && state.framesStatus !== 'error' && (
                        <div className="gm-wind-panel__note gm-wind-panel__note--error" role="alert" title={error}>
                            {MSG_FRAME_FAILED}
                            <button type="button" className="gm-wind-panel__link" onClick={onRetry}>다시 시도</button>
                        </div>
                    )}
                    {!loading && !error && notice && (
                        <div className="gm-wind-panel__note gm-wind-panel__note--info">
                            <Info size={12} /> {notice}
                        </div>
                    )}
                </div>
                <div className="gm-wind-panel__notice">
                    <p className="gm-wind-panel__notice-line">{NOTICE_LINE_1}</p>
                    <p className="gm-wind-panel__notice-line">{notice2}</p>
                    {notice3 && <p className="gm-wind-panel__notice-line">{notice3}</p>}
                </div>
            </div>
        </div>
    )
}

/** 바람길 플러그인이 설치되지 않은 지도에서 열렸을 때 */
function WindPanelEmpty() {
    return (
        <div className="gm-panel">
            <div className="gm-panel__header">
                <span className="gm-panel__title">바람지도</span>
            </div>
            <div className="gm-panel__empty">바람길이 설치되지 않았습니다</div>
        </div>
    )
}

export default function WindPanel() {
    const wind = useWindPlugin()
    return wind ? <WindPanelBody wind={wind} /> : <WindPanelEmpty />
}
