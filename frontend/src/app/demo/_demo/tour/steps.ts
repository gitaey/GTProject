// 가이드 투어 단계 정의(한 곳) — 글·"해 보기" 동작·강조할 단추 선택자·링크가 전부 여기 있다.
// "해 보기"는 엔진 공개 API만 쓴다(view·flyTo·layers·vector·tools·print·플러그인). 출력·영역 분석 패널은 도구 모음의 로컬 상태라
// 엔진으로 못 연다 → "○○ 단추를 누르세요" + 그 단추를 강조 테두리로 가리킨다.
// 강조 선택자: 도구 모음·네비 단추에는 aria-label·title이 없어 단추 안 lucide 아이콘 class(lucide-<이름>)로 찾는다(:has — 지원 안 하는 브라우저는 강조만 빠진다).
import type { GisMap } from '@gtp/gis-map/core'
import type { WindPlugin } from '@gtp/gis-map/core/wind'
import { DEMO_BOUNDARY_LAYER } from '../demoSources'

export const GITHUB_URL = 'https://github.com/gitaey/GTProject'
export const STATIC_DEMO_URL = '/demo/umd/index.html'

export type TourStepId = 'layers' | 'search' | 'measure' | 'parcel' | 'mymap-style' | 'table-export' | 'big-data' | 'area' | 'print' | 'wind' | 'export'
export type TourTag = 'sample' | 'real' | 'browser'

export const TOUR_TAG_LABEL: Readonly<Record<TourTag, string>> = Object.freeze({
    sample: '샘플(가상) 데이터', real: '실제 GeoServer', browser: '브라우저에서 처리',
})

/** 패널 id(DEMO_PANELS) */
export type TourPanel = 'layer' | 'mymap' | 'wind'

export interface TourContext {
    map: GisMap
    /** 왼쪽 패널 열기(null = 닫기) — MapShell을 다시 마운트해 defaultPanel로 연다 */
    openPanel(panel: TourPanel | null): void
    /** 화면의 입력창 등에 포커스(선택자) */
    focus(selector: string): void
    /** 시범 구역 중심(경도, 위도)과 큰 합성 점 레이어(나만의지도 id) */
    center: readonly [number, number]
    bigLayerId: number
}

export interface TourAction {
    label: string
    run(ctx: TourContext): void | Promise<void>
}

export interface TourLink {
    label: string
    href: string
    external?: boolean
}

export interface TourStep {
    id: TourStepId
    title: string
    body: string
    tags: readonly TourTag[]
    /** 단계에 들어오면 열려 있어야 하는 패널(처음 진입·초기화 때) */
    panel?: TourPanel
    action?: TourAction
    /** 강조할 단추의 CSS 선택자(`.demo-root` 안). 여러 개면 모두 */
    highlight?: readonly string[]
    /** 패널 안 조작이라 모바일(768px 미만, 네비 없음)에서는 체험할 수 없는 단계 */
    desktopOnly?: boolean
    links?: readonly TourLink[]
    /** 다음 단계로 넘어갈 때(정리할 것이 있으면) */
    onLeave?(ctx: TourContext): void
}

const icon = (scope: string, name: string): string => `${scope}:has(.lucide-${name})`
const toolbarBtn = (name: string): string => icon('.gm-toolbar__btn', name)
const navItem = (name: string): string => icon('.gm-nav-rail__item', name)

/** 시범 구역을 화면에 가득 채우는 확대 수준(필지 한 칸을 누를 수 있는 크기) */
const PARCEL_ZOOM = 17
/** 영역 분석용 — 현재 화면이 10㎢ 경고 기준 안에 드는 수준 */
const AREA_ZOOM = 15

export const TOUR_STEPS: readonly TourStep[] = Object.freeze([
    {
        id: 'layers', title: '레이어·배경지도', tags: ['real'] as const, panel: 'layer',
        body: "왼쪽 레이어 패널에서 '행정경계' 그룹의 시군구·읍면동·리 경계를 켜고 투명도를 바꿔 보세요. 이 경계는 실제 GeoServer가 그리는 그림이고 범례도 그 서버에서 받습니다. 머리줄의 일반·위성으로 배경도 바꿀 수 있습니다(위성은 누를 때만 불러옵니다).",
        highlight: [navItem('layers')],
        action: {
            label: '시군구 경계 켜기',
            run: ({ map, center, openPanel }) => {
                openPanel('layer')
                map.layers.enableLayerByName(DEMO_BOUNDARY_LAYER)
                map.flyTo({ lon: center[0], lat: center[1], zoom: 11 })
            },
        },
    },
    {
        id: 'search', title: '장소 검색', tags: ['sample'] as const,
        body: "머리줄 검색창에 '세종'을 입력하고 결과를 고르면 지도에 핀이 꽂히고 그 필지가 강조됩니다. 검색 대상은 샘플(가상) 장소 목록입니다.",
        highlight: ['.gm-search__field'],
        action: { label: '검색창 선택', run: ({ focus }) => focus('.gm-search__input') },
    },
    {
        id: 'measure', title: '거리·면적 측정', tags: ['browser'] as const,
        body: '도구 모음의 거리·면적 측정 단추를 누르고 지도에서 점을 찍어 보세요. 더블클릭으로 끝나고, 결과는 지도 위에 표시됩니다. 계산은 브라우저가 지도 좌표계로 합니다.',
        highlight: [toolbarBtn('ruler'), toolbarBtn('square-dashed')],
        action: { label: '거리 측정 시작', run: ({ map }) => map.tools.activate('measure-distance') },
    },
    {
        id: 'parcel', title: '필지 정보', tags: ['sample'] as const,
        body: '시범 구역의 필지를 누르면 지번·지목·면적·공시지가와 그 필지의 건물 목록이 카드로 뜹니다. 필지·건물은 전부 가상 데이터이고 PNU도 실제 지번과 겹치지 않는 가상 값입니다.',
        highlight: [toolbarBtn('land-plot')],
        action: {
            label: '필지 정보 켜기',
            run: ({ map, center }) => {
                map.flyTo({ lon: center[0], lat: center[1], zoom: PARCEL_ZOOM })
                map.tools.activate('parcel-info')
            },
        },
    },
    {
        id: 'mymap-style', title: '나만의지도 스타일·라벨', tags: ['sample'] as const, panel: 'mymap', desktopOnly: true,
        body: "나만의지도 패널에서 '공공시설(가상)' 레이어의 ⋯ 메뉴를 열어 스타일·라벨을 정하고 저장해 보세요. 구분 열 값별로 색을 나누거나, 필지 면은 공시지가 구간으로 칠할 수 있습니다. 바꾼 내용은 이 탭에서만 유지됩니다.",
        highlight: [navItem('map')],
        action: {
            label: '공공시설 보기',
            run: async ({ map, openPanel }) => {
                openPanel('mymap')
                await map.vector.zoomTo(1)
            },
        },
    },
    {
        id: 'table-export', title: '속성 표·내보내기', tags: ['sample', 'browser'] as const, panel: 'mymap', desktopOnly: true,
        body: "'필지(가상) 면' 레이어의 ⋯ 메뉴에서 속성 표를 엽니다. 열 머리를 눌러 정렬하고 값으로 거른 뒤, 내보내기에서 GeoJSON·엑셀과 좌표계(예: EPSG:5186)를 골라 저장해 보세요. 파일은 브라우저에서 만들어지고 서버로 가지 않습니다.",
        highlight: [navItem('map')],
        action: {
            label: '필지(가상) 면 보기',
            run: async ({ map, openPanel }) => {
                openPanel('mymap')
                await map.vector.zoomTo(2)
            },
        },
    },
    {
        id: 'big-data', title: '큰 데이터 묶음', tags: ['sample', 'browser'] as const,
        body: '합성 점 레이어를 켜 보세요. 화면 안 점이 많으면 격자 원(숫자 = 점 개수)으로 묶여 보이고, 원을 누르거나 확대하면 풀립니다. 점은 브라우저가 시드 고정으로 만든 가상 데이터입니다. 데스크톱은 10만 점, 모바일은 메모리 때문에 2만 점까지입니다.',
        action: { label: '큰 합성 점 켜기', run: async ({ map, bigLayerId }) => { await map.vector.zoomTo(bigLayerId) } },
    },
    {
        id: 'area', title: '영역 분석', tags: ['sample', 'real'] as const,
        body: '도구 모음의 영역 분석 단추를 누르고 영역(현재 화면 또는 직접 그리기)을 정한 뒤 레이어를 골라 분석하세요. 샘플(가상) 필지·용도지역은 브라우저에서, 행정경계(시군구·읍면동·리)는 실제 GeoServer에 영역 질의를 보냅니다. 데모는 서버 부하를 줄이려고 레이어를 하나씩 차례로 질의하고, 레이어당 1,000건까지만 받으며 10㎢가 넘는 영역은 경고합니다. VWorld 레이어는 데모에서 쓰지 않습니다.',
        highlight: [toolbarBtn('chart-pie')],
        action: { label: '시범 구역으로 이동', run: ({ map, center }) => map.flyTo({ lon: center[0], lat: center[1], zoom: AREA_ZOOM }) },
    },
    {
        id: 'print', title: '지도 출력', tags: ['browser'] as const,
        body: "도구 모음의 출력 단추를 누르면 지도 위에 출력 틀이 나옵니다. 용지(A4·A3)·방향·축척·제목·범례를 정하고 PNG·PDF로 저장하거나 인쇄하세요. 파일은 브라우저에서만 만들어지고, 출력물에는 '샘플(가상) 데이터' 출처가 들어갑니다.",
        highlight: [toolbarBtn('printer')],
        action: { label: '출력 틀 미리 보기', run: ({ map }) => map.print.showFrame({ paper: 'A4', orientation: 'landscape' }) },
        // 패널을 안 열고 단계를 떠나면 미리 보기 틀만 남지 않게 걷는다(패널이 열려 있으면 패널이 알아서 관리)
        onLeave: ({ map }) => {
            if (typeof document !== 'undefined' && !document.querySelector('.gm-toolbar__print-slot')) map.print.hideFrame()
        },
    },
    {
        id: 'wind', title: '바람지도', tags: ['sample'] as const, panel: 'wind',
        body: '바람지도 패널에서 가상 예보 프레임(9시간)을 재생해 보세요. 입자 흐름과 풍속 색이 프레임마다 바뀝니다. 바람 자료는 브라우저가 만든 가상 값이며 실제 기상 자료가 아닙니다.',
        highlight: [navItem('wind')],
        action: {
            label: '바람 켜기',
            run: ({ map, openPanel }) => {
                openPanel('wind')
                map.getPlugin<WindPlugin>('wind')?.setVisible(true)
            },
        },
    },
    {
        id: 'export', title: '다른 화면에 이식하기', tags: ['browser'] as const,
        body: '이 화면은 React MapShell로 만들었습니다. 같은 엔진을 JSP 같은 서버 화면에는 GisMap.create로, 이미 쓰는 ol 지도에는 GisMap.attach로 붙입니다. 서버 없이 폴더째 복사하면 열리는 정적 예제를 열어 보세요.',
        links: [
            { label: '정적 예제 열기', href: STATIC_DEMO_URL },
            { label: 'create 예제', href: '/demo/umd/create.html' },
            { label: 'attach 예제', href: '/demo/umd/attach.html' },
            { label: 'GitHub', href: GITHUB_URL, external: true },
        ],
    },
])

/** `?step=<id>` → 단계 번호(0부터). 없거나 모르는 id면 0 */
export function parseStepParam(search: string): number {
    const id = new URLSearchParams(search).get('step')
    const i = id ? TOUR_STEPS.findIndex(s => s.id === id) : -1
    return i < 0 ? 0 : i
}

/** 단계에 들어왔을 때 열려 있어야 하는 패널(없으면 닫힘) */
export function panelOfStep(index: number): TourPanel | null {
    return TOUR_STEPS[index]?.panel ?? null
}
