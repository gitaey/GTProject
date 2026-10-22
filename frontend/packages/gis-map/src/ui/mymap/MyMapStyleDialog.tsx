'use client'

// 나만의지도 스타일 설정 — 표시 방식(면/점) · 색(단색 / 값별 / 구간별) · 모양 · 라벨 · 클릭 팝업 컬럼. 등록자만 연다(패널이 소유 레이어에만 단추를 단다).
//   · 바꾸는 즉시 지도에 미리 반영한다(map.vector.previewStyle — GeoJSON을 다시 받지 않는다). 지도를 움직여 가며 볼 수 있게 어두운 막을 깔지 않는 떠 있는 카드다
//   · 닫기·Esc·저장 실패 뒤 닫기 = 저장된 스타일로 되돌린다(endPreview). 저장 = 목록 객체의 saveStyle(PATCH) — 기본값과 같으면 서버 값을 지운다("")
//   · 컬럼·값 개수·숫자 값은 지도에 올라온 피처에서 센다(map.vector.columns/categories/numbers) → 레이어가 꺼져 있으면 먼저 켠다
//   · 서버가 거절하면(403 등) 그 message를 그대로 보여 준다
// 스타일: gm-style-dialog(styles/gis-map-ui.css). 동적 값(색 견본·색 띠)만 인라인 style
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X, Loader2, RotateCcw } from 'lucide-react'
import {
    COLOR_RAMPS, DEFAULT_LABEL_COLOR, DEFAULT_LABEL_HALO, DEFAULT_LABEL_MIN_ZOOM, DEFAULT_LABEL_SIZE,
    STYLE_FILL_OPACITY, STYLE_MAX_BREAK_CLASSES, STYLE_MAX_CATEGORIES, STYLE_MIN_BREAK_CLASSES, STYLE_POINT_RADIUS, STYLE_POINT_STROKE_WIDTH,
    MYMAP_STYLE_MAX_BYTES, STYLE_MAX_POPUP_FIELDS, STYLE_MAX_TEXT, STYLE_STROKE_WIDTH, buildCategorizedStyle, buildGraduatedStyle, findRamp,
    findRampIdByColors, isDefaultMyMapStyle, isNetworkError, labelFloorZoom, popupFieldsFor, rampColors, readNumberDetail, sameMyMapStyle,
    serializeMyMapStyle, utf8Length,
} from '../../core'
import type { MyMapBreakMethod, MyMapCatalog, MyMapColumnInfo, MyMapStyleConfig } from '../../core'
import { useGisMap } from '../../react'
import { cx } from '../cx'
import { formatCount, formatNumber } from './format'

interface MyMapStyleDialogProps {
    id: number
    name: string
    /** 저장(PATCH)은 목록 객체가 한다. 없으면 저장 단추가 막힌다(미리보기만) */
    catalog: MyMapCatalog | null
    onClose: () => void
    /** 저장 요청이 도는 동안 true — 패널이 그 사이 다른 레이어의 스타일 창을 못 열게 막는 데 쓴다 */
    onSavingChange?: (saving: boolean) => void
}

type ColorMode = 'single' | 'categorical' | 'graduated'

const LABEL_SIZES: readonly number[] = Object.freeze([10, 11, 12, 13, 14, 16, 18, 20, 24])
const LABEL_ZOOMS: readonly number[] = Object.freeze([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20])
const BREAK_METHOD_LABELS: Readonly<Record<MyMapBreakMethod, string>> = Object.freeze({
    quantile: '분위(같은 개수)', equal: '같은 간격', manual: '직접 입력',
})

/**
 * 값별 색 나누기에 먼저 고를 컬럼: 같은 값이 되풀이되는(값 종류 < 값 있는 피처 수) 글자 컬럼 중 값이 12가지 이하인 첫 컬럼
 * → 값이 30가지 이하인 글자 컬럼 → 값이 2가지 이상인 아무 컬럼 → 값이 있는 첫 컬럼. (이름처럼 값이 전부 다른 컬럼은 맨 뒤로)
 */
function pickCategoryColumn(columns: readonly MyMapColumnInfo[]): MyMapColumnInfo | null {
    const filled = columns.filter(c => c.filled > 0)
    const usable = filled.filter(c => c.distinct >= 2)
    return (
        usable.find(c => c.kind === 'text' && c.distinct <= STYLE_MAX_CATEGORIES && c.distinct < c.filled) ??
        usable.find(c => c.kind === 'text' && c.distinct <= 30) ??
        usable[0] ??
        filled[0] ??
        null
    )
}

/** 스타일에 쓸 수 있는 컬럼 이름: 비어 있지 않고 서버 한도(200자) 이하 — 넘으면 저장 때 조용히 빠지므로 처음부터 선택지에서 뺀다 */
function usableName(name: string): boolean {
    return name.trim() !== '' && name.length <= STYLE_MAX_TEXT
}

/** 구간 색 나누기를 할 수 있는 숫자 컬럼(최댓값 > 최솟값) */
function numberColumns(columns: readonly MyMapColumnInfo[]): MyMapColumnInfo[] {
    return columns.filter(c => c.kind === 'number' && c.min !== undefined && c.max !== undefined && c.max > c.min)
}

/** 선택지 목록에 지금 값이 없으면(서버에 다른 값이 저장돼 있을 때) 끼워 넣는다 — 다시 열었을 때 저장한 값이 그대로 보이게 */
function withCurrent(list: readonly number[], current: number | undefined): number[] {
    return current === undefined || list.includes(current) ? [...list] : [...list, current].sort((a, b) => a - b)
}

function errorText(e: unknown): string {
    if (isNetworkError(e)) return '네트워크 오류로 저장하지 못했습니다. 다시 시도해 주세요.'
    return e instanceof Error && e.message ? e.message : '저장하지 못했습니다'
}

export default function MyMapStyleDialog({ id, name, catalog, onClose, onSavingChange }: MyMapStyleDialogProps) {
    // 엔진·컨트롤러는 엔진마다 하나(참조 고정) → 아래 effect가 다시 돌지 않는다
    const vector = useGisMap()?.vector ?? null
    const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
    const [columns, setColumns] = useState<readonly MyMapColumnInfo[]>([])
    const [draft, setDraft] = useState<MyMapStyleConfig | null>(null)
    // 저장돼 있는 스타일(설정이 없으면 기본값) — 바뀌었는지 비교하는 기준
    const [baseline, setBaseline] = useState<MyMapStyleConfig | null>(null)
    // 이름이 비었거나 200자를 넘어 선택지에서 뺀 컬럼 수
    const [skippedColumns, setSkippedColumns] = useState(0)
    const [featureCount, setFeatureCount] = useState(0)
    const [rampId, setRampId] = useState(COLOR_RAMPS[0].id)
    const [breakText, setBreakText] = useState<string[]>([])
    const [note, setNote] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const savingRef = useRef(false)
    // 저장 요청이 도는 동안 닫으면 결과를 볼 수 없고(성공하면 "취소했는데 저장됨") 미리보기만 끝나므로 닫기를 무시한다
    const requestClose = () => {
        if (!savingRef.current) onClose()
    }
    const requestCloseRef = useRef(requestClose)
    requestCloseRef.current = requestClose

    useEffect(() => {
        if (!vector) return
        let cancelled = false
        const start = vector.getStyle(id)
        setDraft(start)
        setBaseline(vector.getSavedStyle(id) ?? vector.defaultStyle(id))
        if (start.classify?.type === 'graduated') {
            setBreakText(start.classify.breaks.map(String))
            // 저장 JSON에는 색 띠 id가 없다(서버가 모르는 키를 거절) → 저장된 색에서 되찾아, 다시 열어도 같은 색 띠가 보이고 단계·방식을 바꿔도 색이 안 바뀐다
            setRampId(findRampIdByColors(start.classify.colors) ?? COLOR_RAMPS[0].id)
        }
        ;(async () => {
            // 컬럼·값은 지도에 올라온 피처로 센다 — 꺼져 있으면 먼저 켠다(이미 켜져 있으면 바로 돌아온다)
            await vector.show(id)
            if (cancelled) return
            const cols = vector.columns(id)
            if (!cols) {
                setPhase('error')
                return
            }
            const usable = cols.filter(c => usableName(c.name))
            setColumns(usable)
            setSkippedColumns(cols.length - usable.length)
            setFeatureCount(vector.featureCount(id) ?? 0)
            setPhase('ready')
        })()
        return () => {
            cancelled = true
            // 저장하지 않고 닫으면 저장된 스타일로(저장했다면 이미 restyle로 끝나 있다)
            vector.endPreview(id)
        }
    }, [vector, id])

    // 바꾸는 즉시 지도에 미리 반영
    useEffect(() => {
        if (vector && draft) vector.previewStyle(id, draft)
    }, [vector, id, draft])

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') requestCloseRef.current()
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [])

    const update = useCallback((patch: Partial<MyMapStyleConfig>) => {
        setError(null)
        setDraft(d => (d ? { ...d, ...patch } : d))
    }, [])

    const numCols = useMemo(() => numberColumns(columns), [columns])
    const catCol = useMemo(() => pickCategoryColumn(columns), [columns])
    // 값별 개수는 컬럼이 바뀔 때만 센다(색·투명도를 만질 때마다 피처 전체를 다시 훑지 않는다)
    const catField = draft?.classify?.type === 'categorical' ? draft.classify.field : null
    const catCounts = useMemo(() => (vector && catField !== null && phase === 'ready' ? vector.categories(id, catField) : null), [vector, id, catField, phase])
    const catCountMap = useMemo(() => new Map((catCounts?.entries ?? []).map(e => [e.value, e.count])), [catCounts])
    const dirty = !!draft && !!baseline && !sameMyMapStyle(draft, baseline)

    if (!vector) return null

    const mode: ColorMode = draft?.classify?.type ?? 'single'
    const classify = draft?.classify ?? null

    // ── 색 나누기 ──
    const applyCategorical = (field: string) => {
        const counts = vector.categories(id, field)
        if (!counts) return
        setNote(null)
        update({ classify: buildCategorizedStyle(field, counts.entries, draft?.classify ?? null) })
    }

    const applyGraduated = (req: { field: string; classes: number; method: MyMapBreakMethod; rampId: string; manualBreaks?: readonly number[] }) => {
        const values = vector.numbers(id, req.field) ?? []
        const prev = draft?.classify
        const res = buildGraduatedStyle({ ...req, values, otherColor: prev && prev.type === 'graduated' ? prev.otherColor : undefined })
        if (res.unavailable) {
            setNote(res.reason === 'narrow'
                ? '값의 범위가 너무 좁아 구간 경계를 나눌 수 없습니다(소수 20자리 안에서 구분되지 않음).'
                : '서로 다른 숫자 값이 모자라 구간을 만들 수 없습니다.')
            return
        }
        if (!res.style) return
        setNote(res.fellBack ? '같은 값이 많아 분위 대신 같은 간격으로 나눴습니다.' : null)
        setBreakText(res.style.breaks.map(String))
        update({ classify: res.style })
    }

    const switchMode = (next: ColorMode) => {
        if (next === mode) return
        setNote(null)
        if (next === 'single') {
            update({ classify: null })
        } else if (next === 'categorical') {
            if (catCol) applyCategorical(catCol.name)
        } else {
            const col = numCols[0]
            if (col) applyGraduated({ field: col.name, classes: 5, method: 'quantile', rampId })
        }
    }

    const graduated = classify && classify.type === 'graduated' ? classify : null
    const categorical = classify && classify.type === 'categorical' ? classify : null
    const countOf = (value: string): number => catCountMap.get(value) ?? 0
    const gradCol = graduated ? columns.find(c => c.name === graduated.field) : undefined

    const changeMethod = (method: MyMapBreakMethod) => {
        if (!graduated) return
        if (method === 'manual') {
            // 지금 경계값을 그대로 직접 입력의 시작값으로
            update({ classify: { ...graduated, method: 'manual' } })
            setBreakText(graduated.breaks.map(String))
            setNote(null)
            return
        }
        applyGraduated({ field: graduated.field, classes: graduated.colors.length, method, rampId })
    }

    const editBreak = (index: number, text: string) => {
        if (!graduated) return
        const next = breakText.map((t, i) => (i === index ? text : t))
        setBreakText(next)
        // 데이터 값을 읽는 규칙(readNumber)과 같다: 1,000·1e3·.5는 숫자, 0x10·12%는 숫자 아님, 크기는 ±1e15 미만
        const reads = next.map(t => readNumberDetail(t))
        if (reads.some(r => r.error === 'range')) {
            setNote('경계값은 절댓값이 1,000조(1e15) 미만인 숫자여야 합니다.')
            return
        }
        if (reads.some(r => r.error !== undefined)) {
            setNote('경계값은 숫자로(예: 1000, 1,000, 0.5) 입력하세요.')
            return
        }
        const nums = reads.map(r => r.value as number)
        if (!nums.every((n, i) => i === 0 || n > nums[i - 1])) {
            setNote('경계값은 작은 값부터 차례로(같은 값은 안 됨) 입력하세요.')
            return
        }
        // applyGraduated가 안내(note)를 비운다
        applyGraduated({ field: graduated.field, classes: graduated.colors.length, method: 'manual', rampId, manualBreaks: nums })
    }

    // ── 라벨 ──
    const label = draft?.label ?? null
    const floorZoom = labelFloorZoom(featureCount)
    const setLabelField = (field: string) => {
        if (field === '') {
            update({ label: null })
            return
        }
        update({
            label: label
                ? { ...label, field }
                : { field, size: DEFAULT_LABEL_SIZE, color: DEFAULT_LABEL_COLOR, halo: DEFAULT_LABEL_HALO, minZoom: Math.max(DEFAULT_LABEL_MIN_ZOOM, floorZoom) },
        })
    }

    // ── 팝업 ──
    const columnNames = columns.map(c => c.name)
    const popupFields = draft ? popupFieldsFor(draft.popup, columnNames) : []
    // 컬럼을 직접 골랐는데 하나도 없으면 "팝업 끔"(popup { fields: [] }) — 고르지 않은 것(null = 앞 5개)과 다르다
    const popupOff = !!draft && draft.popup !== null && draft.popup.fields.length === 0
    // 서버는 팝업 컬럼 30개까지만 받는다 — 30개를 채우면 나머지 체크는 막아 미리보기와 저장 결과가 달라지지 않게 한다
    const popupFull = popupFields.length >= STYLE_MAX_POPUP_FIELDS
    const togglePopupField = (field: string, on: boolean) => {
        const set = new Set(popupFields)
        if (on && set.size >= STYLE_MAX_POPUP_FIELDS) return
        if (on) set.add(field)
        else set.delete(field)
        update({ popup: { fields: columnNames.filter(n => set.has(n)) } })
    }
    const sampleOf = (n: string): string => columns.find(c => c.name === n)?.sample[0] ?? '-'

    // ── 저장·되돌리기 ──
    const handleReset = () => {
        setNote(null)
        setError(null)
        setRampId(COLOR_RAMPS[0].id)
        setBreakText([])
        setDraft(vector.defaultStyle(id))
    }

    const handleSave = async () => {
        if (!draft || !catalog || savingRef.current) return
        savingRef.current = true
        setSaving(true)
        onSavingChange?.(true)
        setError(null)
        try {
            // 기본(옛 고정) 스타일과 같으면 저장 대신 서버 값을 지운다
            const json = isDefaultMyMapStyle(draft, vector.defaultStyle(id).fill) ? null : serializeMyMapStyle(draft)
            // 서버는 16KB까지만 받는다. 보통은 6KB 안쪽이지만 긴 한글 컬럼 이름 30개를 팝업에 넣고 200자 범주 값 12개를 쓰면 27KB까지 갈 수 있다
            if (json !== null && utf8Length(json) > MYMAP_STYLE_MAX_BYTES) {
                throw new Error(`스타일 설정이 너무 커서(${formatCount(utf8Length(json))}바이트, 한도 ${formatCount(MYMAP_STYLE_MAX_BYTES)}바이트) 저장할 수 없습니다. 팝업 컬럼 수를 줄이거나 값별 색의 값·컬럼 이름이 너무 길지 않은지 확인하세요.`)
            }
            await catalog.saveStyle(id, json)
            onClose()
        } catch (e) {
            setError(errorText(e))
        } finally {
            savingRef.current = false
            setSaving(false)
            onSavingChange?.(false)
        }
    }

    const swatchInput = (value: string, onChange: (v: string) => void, title: string) => (
        <input type="color" className="gm-style-dialog__color" value={value} aria-label={title} title={title}
            onChange={e => onChange(e.target.value)} />
    )

    const numberInput = (value: number, r: { min: number; max: number }, step: number, onChange: (v: number) => void, title: string) => (
        <input type="number" className="gm-style-dialog__num" value={value} min={r.min} max={r.max} step={step} aria-label={title} title={title}
            onChange={e => {
                const n = e.target.valueAsNumber
                if (Number.isFinite(n)) onChange(Math.min(r.max, Math.max(r.min, n)))
            }} />
    )

    return (
        <div className="gm-style-dialog" role="dialog" aria-label="스타일 설정">
            <div className="gm-modal__header">
                <span className="gm-modal__title gm-style-dialog__title">스타일 — {name}</span>
                <button onClick={requestClose} disabled={saving} className="gm-modal__close" aria-label="닫기"><X size={16} /></button>
            </div>

            {phase === 'loading' || !draft ? (
                <div className="gm-modal__loading">
                    <Loader2 size={18} className="gm-loader gm-loader--primary" />
                </div>
            ) : phase === 'error' ? (
                <div className="gm-modal__body">
                    <div className="gm-modal__error">레이어를 불러오지 못해 스타일을 설정할 수 없습니다.</div>
                </div>
            ) : (
                <>
                    <div className="gm-style-dialog__body">
                        {skippedColumns > 0 && (
                            <span className="gm-style-dialog__hint gm-style-dialog__hint--warn">
                                컬럼 이름이 비었거나 {STYLE_MAX_TEXT}자를 넘는 {formatCount(skippedColumns)}개는 스타일에 쓸 수 없어 목록에서 뺐습니다.
                            </span>
                        )}
                        {/* 표시 방식 */}
                        <section className="gm-style-dialog__section">
                            <span className="gm-style-dialog__heading">표시 방식</span>
                            <div className="gm-style-dialog__radios">
                                <label className="gm-style-dialog__radio">
                                    <input type="radio" name={`gm-style-display-${id}`} checked={draft.display === 'polygon'}
                                        onChange={() => update({ display: 'polygon' })} />
                                    필지(면)
                                </label>
                                <label className="gm-style-dialog__radio">
                                    <input type="radio" name={`gm-style-display-${id}`} checked={draft.display === 'point'}
                                        onChange={() => update({ display: 'point' })} />
                                    점(필지 안쪽 대표점)
                                </label>
                            </div>
                        </section>

                        {/* 색 */}
                        <section className="gm-style-dialog__section">
                            <span className="gm-style-dialog__heading">색</span>
                            <div className="gm-style-dialog__seg" role="group" aria-label="색 방식">
                                <button type="button" className={cx('gm-style-dialog__seg-btn', mode === 'single' && 'gm-is-active')}
                                    aria-pressed={mode === 'single'} onClick={() => switchMode('single')}>단색</button>
                                <button type="button" className={cx('gm-style-dialog__seg-btn', mode === 'categorical' && 'gm-is-active')}
                                    aria-pressed={mode === 'categorical'} disabled={!catCol}
                                    title={catCol ? undefined : '쓸 수 있는 컬럼이 없습니다'} onClick={() => switchMode('categorical')}>값별(범주)</button>
                                <button type="button" className={cx('gm-style-dialog__seg-btn', mode === 'graduated' && 'gm-is-active')}
                                    aria-pressed={mode === 'graduated'} disabled={numCols.length === 0}
                                    title={numCols.length === 0 ? (columns.some(c => (c.tooLarge ?? 0) > 0) ? '값이 너무 큰 숫자(±1,000조 이상)가 많은 컬럼은 구간으로 나눌 수 없습니다' : '숫자로 읽히는 컬럼이 없습니다') : undefined} onClick={() => switchMode('graduated')}>구간별(숫자)</button>
                            </div>

                            {mode === 'single' && (
                                <div className="gm-style-dialog__grid">
                                    <span className="gm-style-dialog__label">채우기 색</span>
                                    {swatchInput(draft.fill, v => update({ fill: v }), '채우기 색')}
                                    <span className="gm-style-dialog__label">선 색</span>
                                    {swatchInput(draft.stroke, v => update({ stroke: v }), '선 색')}
                                    <span className="gm-style-dialog__label">점 색</span>
                                    <div className="gm-style-dialog__inline">
                                        {swatchInput(draft.pointColor ?? draft.stroke, v => update({ pointColor: v }), '점 색')}
                                        {draft.pointColor === null
                                            ? <span className="gm-style-dialog__hint">선 색을 따름</span>
                                            : <button type="button" className="gm-style-dialog__link" onClick={() => update({ pointColor: null })}>선 색 따르기</button>}
                                    </div>
                                </div>
                            )}

                            {categorical && (
                                <div className="gm-style-dialog__classify">
                                    <div className="gm-style-dialog__row">
                                        <label className="gm-style-dialog__label" htmlFor={`gm-style-cat-${id}`}>컬럼</label>
                                        <select id={`gm-style-cat-${id}`} className="gm-style-dialog__select" value={categorical.field}
                                            onChange={e => applyCategorical(e.target.value)}>
                                            {columns.filter(c => c.filled > 0).map(c => (
                                                <option key={c.name} value={c.name}>{c.name} (값 {formatCount(c.distinct)}{c.distinctCapped ? '+' : ''}개)</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="gm-style-dialog__classes">
                                        {categorical.classes.map((c, i) => (
                                            <div key={c.value} className="gm-style-dialog__class">
                                                {swatchInput(c.color, v => update({
                                                    classify: { ...categorical, classes: categorical.classes.map((x, j) => (j === i ? { ...x, color: v } : x)) },
                                                }), `${c.value} 색`)}
                                                <span className="gm-style-dialog__class-name" title={c.value}>{c.value}</span>
                                                <span className="gm-style-dialog__count">{formatCount(countOf(c.value))}개</span>
                                            </div>
                                        ))}
                                        <div className="gm-style-dialog__class">
                                            {swatchInput(categorical.otherColor, v => update({ classify: { ...categorical, otherColor: v } }), '기타·값 없음 색')}
                                            <span className="gm-style-dialog__class-name">기타·값 없음</span>
                                            <span className="gm-style-dialog__count">
                                                {formatCount(Math.max(0, (catCounts?.total ?? 0) - categorical.classes.reduce((n, c) => n + countOf(c.value), 0)))}개
                                            </span>
                                        </div>
                                    </div>
                                    {(catCounts?.entries.length ?? 0) > STYLE_MAX_CATEGORIES && (
                                        <span className="gm-style-dialog__hint">값이 많아 개수가 많은 {STYLE_MAX_CATEGORIES}가지만 색을 나누고 나머지는 기타 색입니다.</span>
                                    )}
                                </div>
                            )}

                            {graduated && (
                                <div className="gm-style-dialog__classify">
                                    <div className="gm-style-dialog__row">
                                        <label className="gm-style-dialog__label" htmlFor={`gm-style-grad-${id}`}>컬럼</label>
                                        <select id={`gm-style-grad-${id}`} className="gm-style-dialog__select" value={graduated.field}
                                            onChange={e => applyGraduated({ field: e.target.value, classes: graduated.colors.length, method: graduated.method === 'manual' ? 'quantile' : graduated.method, rampId })}>
                                            {numCols.map(c => (
                                                <option key={c.name} value={c.name}>{c.name} ({formatNumber(c.min ?? 0)}~{formatNumber(c.max ?? 0)})</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="gm-style-dialog__row">
                                        <select aria-label="구간 나누기" className="gm-style-dialog__select" value={graduated.method}
                                            onChange={e => changeMethod(e.target.value as MyMapBreakMethod)}>
                                            {(['quantile', 'equal', 'manual'] as const).map(m => (
                                                <option key={m} value={m}>{BREAK_METHOD_LABELS[m]}</option>
                                            ))}
                                        </select>
                                        <select aria-label="구간 수" className="gm-style-dialog__select gm-style-dialog__select--narrow"
                                            value={graduated.colors.length} disabled={graduated.method === 'manual'}
                                            onChange={e => applyGraduated({ field: graduated.field, classes: Number(e.target.value), method: graduated.method, rampId })}>
                                            {Array.from({ length: STYLE_MAX_BREAK_CLASSES - STYLE_MIN_BREAK_CLASSES + 1 }, (_, i) => STYLE_MIN_BREAK_CLASSES + i).map(n => (
                                                <option key={n} value={n}>{n}단계</option>
                                            ))}
                                        </select>
                                        <select aria-label="색 띠" className="gm-style-dialog__select gm-style-dialog__select--narrow" value={rampId}
                                            onChange={e => {
                                                setRampId(e.target.value)
                                                update({ classify: { ...graduated, colors: rampColors(findRamp(e.target.value).stops, graduated.colors.length) } })
                                            }}>
                                            {COLOR_RAMPS.map(r => (
                                                <option key={r.id} value={r.id}>{r.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="gm-style-dialog__ramp" aria-hidden="true">
                                        {graduated.colors.map((c, i) => (
                                            <span key={i} className="gm-style-dialog__ramp-cell" style={{ background: c }} />
                                        ))}
                                    </div>
                                    <div className="gm-style-dialog__ticks">
                                        <span>{formatNumber(gradCol?.min ?? 0)}</span>
                                        {graduated.breaks.map((b, i) => (
                                            <span key={i}>{formatNumber(b)}</span>
                                        ))}
                                        <span>{formatNumber(gradCol?.max ?? 0)}</span>
                                    </div>
                                    {(gradCol?.tooLarge ?? 0) > 0 && (
                                        <span className="gm-style-dialog__hint gm-style-dialog__hint--warn">
                                            값 {formatCount(gradCol?.tooLarge ?? 0)}개는 너무 커서(±1,000조 이상) 숫자로 읽지 않고 &quot;값 없음&quot; 색으로 칠합니다.
                                        </span>
                                    )}
                                    {graduated.method === 'manual' && (
                                        <div className="gm-style-dialog__breaks">
                                            {breakText.map((t, i) => (
                                                <input key={i} type="text" inputMode="decimal" className="gm-style-dialog__num gm-style-dialog__num--wide"
                                                    value={t} aria-label={`경계값 ${i + 1}`} onChange={e => editBreak(i, e.target.value)} />
                                            ))}
                                        </div>
                                    )}
                                    <div className="gm-style-dialog__class">
                                        {swatchInput(graduated.otherColor, v => update({ classify: { ...graduated, otherColor: v } }), '값 없음 색')}
                                        <span className="gm-style-dialog__class-name">숫자로 읽을 수 없는 값(값 없음)</span>
                                    </div>
                                </div>
                            )}
                            {note && <span className="gm-style-dialog__hint gm-style-dialog__hint--warn">{note}</span>}
                        </section>

                        {/* 모양 */}
                        <section className="gm-style-dialog__section">
                            <span className="gm-style-dialog__heading">모양</span>
                            <div className="gm-style-dialog__grid">
                                <label className="gm-style-dialog__label" htmlFor={`gm-style-opacity-${id}`}>채우기 투명도</label>
                                <div className="gm-style-dialog__slider">
                                    <input id={`gm-style-opacity-${id}`} type="range" className="gm-style-dialog__range"
                                        min={STYLE_FILL_OPACITY.min * 100} max={STYLE_FILL_OPACITY.max * 100} step={5}
                                        value={Math.round(draft.fillOpacity * 100)}
                                        onChange={e => update({ fillOpacity: Number(e.target.value) / 100 })} />
                                    <span className="gm-style-dialog__value">{Math.round(draft.fillOpacity * 100)}%</span>
                                </div>
                                <span className="gm-style-dialog__label">선 두께</span>
                                {numberInput(draft.strokeWidth, STYLE_STROKE_WIDTH, 0.5, v => update({ strokeWidth: v }), '선 두께(px, 0이면 선 없음)')}
                                <span className="gm-style-dialog__label">점 크기</span>
                                {numberInput(draft.pointRadius, STYLE_POINT_RADIUS, 1, v => update({ pointRadius: v }), '점 반지름(px)')}
                                <span className="gm-style-dialog__label">점 테두리</span>
                                <div className="gm-style-dialog__inline">
                                    {swatchInput(draft.pointStroke, v => update({ pointStroke: v }), '점 테두리 색')}
                                    {numberInput(draft.pointStrokeWidth, STYLE_POINT_STROKE_WIDTH, 0.5, v => update({ pointStrokeWidth: v }), '점 테두리 두께(px, 0이면 없음)')}
                                </div>
                            </div>
                        </section>

                        {/* 라벨 */}
                        <section className="gm-style-dialog__section">
                            <span className="gm-style-dialog__heading">라벨</span>
                            <div className="gm-style-dialog__row">
                                <select aria-label="라벨 컬럼" className="gm-style-dialog__select" value={label?.field ?? ''}
                                    onChange={e => setLabelField(e.target.value)}>
                                    <option value="">없음</option>
                                    {columns.map(c => (
                                        <option key={c.name} value={c.name}>{c.name}</option>
                                    ))}
                                </select>
                                <select aria-label="글자 크기" className="gm-style-dialog__select gm-style-dialog__select--narrow" disabled={!label}
                                    value={label?.size ?? DEFAULT_LABEL_SIZE}
                                    onChange={e => label && update({ label: { ...label, size: Number(e.target.value) } })}>
                                    {withCurrent(LABEL_SIZES, label?.size).map(s => (
                                        <option key={s} value={s}>{s}px</option>
                                    ))}
                                </select>
                                <select aria-label="보이는 줌" className="gm-style-dialog__select gm-style-dialog__select--narrow" disabled={!label}
                                    value={label?.minZoom ?? DEFAULT_LABEL_MIN_ZOOM}
                                    onChange={e => label && update({ label: { ...label, minZoom: Number(e.target.value) } })}>
                                    {withCurrent(LABEL_ZOOMS, label?.minZoom).map(z => (
                                        <option key={z} value={z} disabled={z < floorZoom}>줌 {z}부터</option>
                                    ))}
                                </select>
                            </div>
                            {label && (
                                <div className="gm-style-dialog__row">
                                    <span className="gm-style-dialog__label">글자 색</span>
                                    {swatchInput(label.color, v => update({ label: { ...label, color: v } }), '글자 색')}
                                    <span className="gm-style-dialog__label">외곽선(후광) 색</span>
                                    {swatchInput(label.halo, v => update({ label: { ...label, halo: v } }), '외곽선(후광) 색')}
                                </div>
                            )}
                            {label && (
                                <span className="gm-style-dialog__hint">
                                    겹치는 라벨은 자동으로 숨깁니다. 지도를 이 줌 이상으로 확대하면 나타납니다.
                                    {floorZoom > 0 && ` 피처가 ${formatCount(featureCount)}개라 줌 ${floorZoom} 아래에서는 라벨을 그리지 않습니다.`}
                                </span>
                            )}
                        </section>

                        {/* 팝업 */}
                        <section className="gm-style-dialog__section">
                            <span className="gm-style-dialog__heading">클릭하면 보일 컬럼</span>
                            <div className="gm-style-dialog__popup-grid">
                                {columns.map(c => (
                                    <label key={c.name} className="gm-style-dialog__check" title={c.name}>
                                        <input type="checkbox" checked={popupFields.includes(c.name)} disabled={popupFull && !popupFields.includes(c.name)}
                                            onChange={e => togglePopupField(c.name, e.target.checked)} />
                                        <span>{c.name}</span>
                                    </label>
                                ))}
                            </div>
                            <span className="gm-style-dialog__hint">
                                {draft.popup === null
                                    ? '고르지 않으면 앞 5개 컬럼을 보여 줍니다.'
                                    : popupOff ? '아무것도 고르지 않아서 이 레이어는 클릭해도 팝업이 열리지 않습니다(팝업 끔).' : null}
                                {draft.popup !== null && (
                                    <button type="button" className="gm-style-dialog__link" onClick={() => update({ popup: null })}>기본(앞 5개)으로</button>
                                )}
                            </span>
                            {popupFull && (
                                <span className="gm-style-dialog__hint gm-style-dialog__hint--warn">
                                    팝업 컬럼은 {STYLE_MAX_POPUP_FIELDS}개까지 고를 수 있습니다. 더 고르려면 다른 컬럼을 먼저 빼세요.
                                </span>
                            )}
                            {popupFields.length > 0 && (
                                <div className="gm-style-dialog__preview" aria-label="팝업 미리보기">
                                    <span className="gm-style-dialog__preview-title">팝업 미리보기</span>
                                    {popupFields.slice(0, 6).map(n => (
                                        <span key={n} className="gm-style-dialog__preview-row"><b>{n}</b> {sampleOf(n)}</span>
                                    ))}
                                </div>
                            )}
                        </section>
                    </div>

                    <div className="gm-style-dialog__footer">
                        <span className="gm-style-dialog__footer-note">바꾸면 지도에 바로 보입니다 · 등록자만 저장</span>
                        {error && <span className="gm-style-dialog__error" role="alert">{error}</span>}
                        <div className="gm-style-dialog__actions">
                            <button type="button" className="gm-wizard__back gm-style-dialog__reset" onClick={handleReset} disabled={saving}
                                title="색·모양·라벨·팝업을 처음 상태로 되돌립니다(저장해야 서버에 반영)">
                                <RotateCcw size={12} /> 기본값으로 되돌리기
                            </button>
                            <button type="button" className="gm-wizard__submit" onClick={handleSave}
                                disabled={saving || !dirty || !catalog}>
                                {saving && <Loader2 size={13} className="gm-loader" />}
                                저장
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
