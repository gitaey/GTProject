// 지도 출력(PNG·PDF·인쇄) 공개 타입. 코어(React 없음) — 구현은 PrintController.ts.
import type { ReadableStore } from '../store'

export type PrintPaperSize = 'A4' | 'A3'
export type PrintOrientation = 'landscape' | 'portrait'

/** GisMapConfig.print — 엔진을 만들 때 한 번 주는, 기관마다 다른 고정값 */
export interface PrintLayoutConfig {
    /** 머리줄 오른쪽 기관명. 없으면 안 그린다 */
    organization?: string
    /** 로고 이미지 URL 또는 data URI. 다른 출처면 CORS(Access-Control-Allow-Origin)가 있어야 파일 저장에 들어간다(없으면 빼고 경고) */
    logo?: string
    /** 항상 붙일 출처 문구 */
    attributions?: readonly string[]
    /** 켜진 레이어 주소에 vworld.kr이 있으면 자동으로 붙일 문구. false = 끔. 기본 '배경지도: 브이월드(국토교통부)' */
    vworldAttribution?: string | false
    /** 캔버스 글꼴. 기본 "'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif" */
    fontFamily?: string
    /** 기본 150 */
    defaultDpi?: number
    /** 축척 선택지(분모). 기본 [1000, 2500, 5000, 10000, 25000, 50000] */
    scales?: readonly number[]
    /** 렌더 완료(rendercomplete)를 기다리는 최대 시간. 기본 15000ms — 넘으면 그 상태로 찍고 경고 */
    renderTimeoutMs?: number
}

export interface PrintElements {
    legend: boolean
    scaleBar: boolean
    northArrow: boolean
    date: boolean
    attribution: boolean
    logo: boolean
}

export interface PrintOptions {
    /** 기본: 컨트롤러 상태(처음 'A4') */
    paper?: PrintPaperSize
    /** 기본: 컨트롤러 상태(처음 'landscape') */
    orientation?: PrintOrientation
    /** 페이지 해상도. 72~200으로 자른다(1차). 기본 config.defaultDpi ?? 150 */
    dpi?: number
    /** 빈 값이면 제목 줄을 그리지 않는다 */
    title?: string
    /** undefined = 지도 중심 지역명(map.region) 자동, null 또는 '' = 없음 */
    subtitle?: string | null
    /** 기본 전부 true */
    show?: Partial<PrintElements>
}

export type PrintWarningCode = 'RENDER_TIMEOUT' | 'LEGEND_IMAGE_SKIPPED' | 'LOGO_SKIPPED' | 'LEGEND_TRUNCATED'

export interface PrintWarning {
    code: PrintWarningCode
    message: string
}

export interface PrintPage {
    canvas: HTMLCanvasElement
    widthMm: number
    heightMm: number
    /** 다른 출처 그림이 섞여 PNG·PDF 저장이 안 된다(인쇄는 된다) */
    tainted: boolean
    /** 오염 원인으로 보이는 켜진 레이어 이름(다른 출처 주소 + crossOrigin 없음) */
    taintSuspects: string[]
    /** 용지 위 실제 축척 분모(지도 중심 기준) */
    scaleDenominator: number
    /** 지도 그림이 용지에서 갖는 해상도(dpi) — 화면 픽셀 그대로 늘리므로 페이지 해상도와 다르다 */
    mapDpi: number
    warnings: PrintWarning[]
}

export interface PrintState {
    frameVisible: boolean
    paper: PrintPaperSize
    orientation: PrintOrientation
    /** null = 화면 그대로 */
    scale: number | null
    /** PNG·PDF·인쇄 내보내기 진행 중 */
    busy: boolean
}

export interface PrintController {
    readonly store: ReadableStore<PrintState>
    /** 지도 위에 용지 비율 틀을 띄운다(이미 떠 있으면 용지만 바꿈) */
    showFrame(opts?: { paper?: PrintPaperSize; orientation?: PrintOrientation }): void
    hideFrame(): void
    /** null = 화면 그대로. 숫자면 용지에서 1:N이 되도록 틀 크기(필요하면 줌 한 단계씩)를 바꾼다 */
    setScale(denominator: number | null): void
    /** 페이지를 캔버스로 만든다(파일로 내보내지 않음 — 미리보기·직접 처리용). 틀이 없으면 지도 가운데 용지 비율 영역 */
    render(opts?: PrintOptions): Promise<PrintPage>
    /** tainted면 GisPrintError('TAINTED') */
    exportPng(opts?: PrintOptions): Promise<Blob>
    exportPdf(opts?: PrintOptions): Promise<Blob>
    /** 브라우저 인쇄 창. tainted여도 된다. 인쇄 창이 닫히면 resolve */
    print(opts?: PrintOptions): Promise<void>
}

export type GisPrintErrorCode = 'TAINTED' | 'BUSY' | 'TOO_LARGE' | 'NO_MAP_SIZE' | 'DESTROYED'

export class GisPrintError extends Error {
    readonly code: GisPrintErrorCode

    constructor(code: GisPrintErrorCode, message?: string) {
        super(message ?? PRINT_ERROR_MESSAGES[code])
        this.name = 'GisPrintError'
        this.code = code
    }
}

const PRINT_ERROR_MESSAGES: Readonly<Record<GisPrintErrorCode, string>> = Object.freeze({
    TAINTED: '다른 출처의 그림이 섞여 있어 파일로 저장할 수 없습니다. 인쇄 창에서 PDF로 저장하세요.',
    BUSY: '다른 출력이 진행 중입니다.',
    TOO_LARGE: '출력 크기가 너무 큽니다. 해상도를 낮추세요.',
    NO_MAP_SIZE: '지도 크기를 알 수 없습니다.',
    DESTROYED: '지도가 이미 닫혔습니다.',
})
