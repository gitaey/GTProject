// 출력 패널의 순수 함수·상수(React 없음, DOM 없음): 파일 이름, 선택지, 옵션 만들기, 안내 문구.
import { DEFAULT_PRINT_ELEMENTS, DEFAULT_PRINT_SCALES, GisPrintError, formatScaleRatio } from '../../core'
import type { PrintElements, PrintOptions, PrintOrientation, PrintPaperSize } from '../../core'

export interface PaperChoice {
    paper: PrintPaperSize
    orientation: PrintOrientation
    label: string
}

export const PAPER_CHOICES: readonly PaperChoice[] = Object.freeze([
    Object.freeze({ paper: 'A4' as PrintPaperSize, orientation: 'landscape' as PrintOrientation, label: 'A4 가로' }),
    Object.freeze({ paper: 'A4' as PrintPaperSize, orientation: 'portrait' as PrintOrientation, label: 'A4 세로' }),
    Object.freeze({ paper: 'A3' as PrintPaperSize, orientation: 'landscape' as PrintOrientation, label: 'A3 가로' }),
    Object.freeze({ paper: 'A3' as PrintPaperSize, orientation: 'portrait' as PrintOrientation, label: 'A3 세로' }),
])

export interface ScaleChoice {
    /** null = 화면 그대로 */
    value: number | null
    label: string
}

/** 축척 선택지: 화면 그대로 + 설정(config.print.scales) 또는 기본 목록 */
export function scaleChoices(scales: readonly number[] = DEFAULT_PRINT_SCALES): ScaleChoice[] {
    return [{ value: null, label: '화면 그대로' }, ...scales.map(n => ({ value: n, label: formatScaleRatio(n) }))]
}

export const ELEMENT_CHOICES: ReadonlyArray<{ key: keyof PrintElements; label: string }> = Object.freeze([
    Object.freeze({ key: 'legend' as keyof PrintElements, label: '범례' }),
    Object.freeze({ key: 'scaleBar' as keyof PrintElements, label: '축척 막대' }),
    Object.freeze({ key: 'northArrow' as keyof PrintElements, label: '방위표' }),
    Object.freeze({ key: 'date' as keyof PrintElements, label: '출력일' }),
    Object.freeze({ key: 'attribution' as keyof PrintElements, label: '출처' }),
    Object.freeze({ key: 'logo' as keyof PrintElements, label: '기관명·로고' }),
])

export const DPI_CHOICES: readonly number[] = Object.freeze([150, 200])

/** 패널 안에서 사용자가 고치는 값(용지·축척은 엔진 상태가 원본이라 여기 없다) */
export interface PrintForm {
    title: string
    /** undefined = 지도 중심 지역명(자동), '' = 없음 */
    subtitle: string | undefined
    show: PrintElements
    dpi: number
}

export function defaultPrintForm(defaultDpi?: number): PrintForm {
    return { title: '', subtitle: undefined, show: { ...DEFAULT_PRINT_ELEMENTS }, dpi: defaultDpi ?? DPI_CHOICES[0] }
}

/** 미리보기 해상도(실제와 같은 렌더러를 낮은 dpi로) */
export const PREVIEW_DPI = 72
/** 옵션·지도 변화 뒤 미리보기를 다시 그리기까지 기다리는 시간 */
export const PREVIEW_DELAY_MS = 300

export function toPrintOptions(form: PrintForm, dpi: number = form.dpi): PrintOptions {
    return { dpi, title: form.title, subtitle: form.subtitle, show: form.show }
}

const FORBIDDEN_FILE_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g

function pad2(n: number): string {
    return String(n).padStart(2, '0')
}

/** '{제목}_{YYYYMMDD_HHmm}.{확장자}' — 제목의 금지 문자 제거, 빈 제목은 '지도출력', 제목은 60자까지 */
export function printFileName(title: string, ext: string, now: Date): string {
    const cleaned = title.replace(FORBIDDEN_FILE_CHARS, '').replace(/\s+/g, '_').replace(/^[._]+|[._]+$/g, '').slice(0, 60)
    const stamp = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}_${pad2(now.getHours())}${pad2(now.getMinutes())}`
    return `${cleaned || '지도출력'}_${stamp}.${ext}`
}

/** PNG·PDF 저장이 막혔을 때(오염) 안내 */
export function taintMessage(suspects: readonly string[]): string {
    const who = suspects.length > 0 ? '(레이어: ' + suspects.slice(0, 3).join(', ') + (suspects.length > 3 ? ' 외 ' + (suspects.length - 3) + '개' : '') + ')' : ''
    return '다른 출처의 지도 그림' + who + '이 섞여 PNG·PDF로 저장할 수 없습니다. 인쇄 창에서 "PDF로 저장"은 됩니다.'
}

/** 지도 해상도 안내: 낮으면(120dpi 미만) 경고 문구를 덧붙인다. 지도 해상도 = 틀의 화면 픽셀 ÷ 용지 너비라 확대로는 안 오른다 */
export function mapDpiNote(mapDpi: number): string {
    if (!(mapDpi > 0)) return ''
    const v = Math.round(mapDpi)
    return '지도 해상도 약 ' + v + ' dpi' + (v < 120 ? ' (낮음 — 작은 용지를 고르거나 브라우저 창을 키우세요)' : '')
}

/** 축척이 "화면 그대로"일 때만: 용지를 바꿔도 지도 범위가 같다는 안내. 축척을 지정하면 빈 문자열 */
export function scaleNote(scale: number | null): string {
    return scale === null
        ? '"화면 그대로"는 용지를 바꿔도 지도 범위가 같고 크기만 달라집니다. 범위를 다르게 하려면 축척을 지정하세요.'
        : ''
}

/** 해상도(dpi) 안내: 종이 그림의 픽셀 수만 정하고 지도 그림은 화면 픽셀 그대로 */
export const DPI_NOTE = '해상도는 글자·범례·테두리의 선명도와 파일 크기를 정합니다. 지도 그림은 화면 해상도가 정해서 dpi를 올려도 더 선명해지지 않습니다.'

export function printErrorMessage(e: unknown): string {
    if (e instanceof GisPrintError) return e.message
    if (e instanceof Error && e.message) return e.message
    return '출력에 실패했습니다'
}
