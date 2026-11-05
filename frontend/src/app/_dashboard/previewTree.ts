// 레이어 트리 계산. 트리 "타입"만 지도 패키지에서 가져온다(import type은 번들에 안 들어간다).
// 런타임 값(allTreeLayers 등)을 @gtp/gis-map/core에서 import하면 OpenLayers 엔진 전체가 대시보드 번들에 딸려 오니 금지 —
// 그래서 summarizeTree·buildPreviewTree는 직접 재귀로 돌린다. 엔진이 필요한 코드(MapPreview)는 next/dynamic으로 불러오는 파일에만 둔다.
import type { LayerDef, LayerGroupDef, LayerTree } from '@gtp/gis-map/core'
import type { LayerCountEntry } from './format'

/** 배경지도 레이어 이름(엔진 DEFAULT_BASEMAP_MODES와 같은 값 — 일반 Base, 위성 Satellite·Hybrid) */
const BASEMAP_LAYER_NAMES: readonly string[] = ['Base', 'Satellite', 'Hybrid']
const BASEMAP_LABEL = '배경'

export interface TreeSummary {
    /** 잎 레이어 수 */
    layerCount: number
    groupCount: number
    /** 종류별 수(WMS·WFS 등) + '배경' (많은 순 정렬은 formatLayerBreakdown이 한다) */
    entries: LayerCountEntry[]
}

function collectLeafLayers(groups: readonly LayerGroupDef[], out: LayerDef[]): void {
    for (const g of groups) {
        out.push(...(g.layers ?? []))
        collectLeafLayers(g.children ?? [], out)
    }
}

function countGroups(groups: readonly LayerGroupDef[]): number {
    return groups.reduce((sum, g) => sum + 1 + countGroups(g.children ?? []), 0)
}

export type PreviewTheme = 'light' | 'dark'

/** 일반 배경지도 레이어 이름과 VWorld 타일 주소 안의 그 자리(`.../{키}/Base/{z}/{y}/{x}.png`) */
const BASE_LAYER_NAME = 'Base'
const BASE_URL_SEGMENT = '/Base/'
/** 다크 테마 배경지도 — 트리에는 없지만 같은 키·같은 주소 형식에서 이름만 바꾸면 된다(확인됨) */
const DARK_URL_SEGMENT = '/midnight/'

function findBaseLayer(tree: LayerTree): LayerDef | null {
    const leaves: LayerDef[] = []
    collectLeafLayers(tree.groups ?? [], leaves)
    leaves.push(...(tree.ungroupedLayers ?? []))
    return leaves.find((l) => l.type === 'XYZ' && l.layerName === BASE_LAYER_NAME) ?? null
}

/**
 * 미리보기용 트리 — 받은 트리에서 일반 배경지도(`Base`) 하나만 골라 켠 채로 담는다(주제 레이어는 켜지 않음 → GeoServer 요청 0).
 * 다크면 주소의 `/Base/`를 `/midnight/`로 바꾼 복사본을 쓴다. layerName은 'Base' 그대로 둬야 엔진의 배경지도 규칙(일반 모드)이 켠다.
 * 주소에 `/Base/`가 없으면(다른 형식) 다크여도 원본을 쓴다 — 라이트 지도라도 지도는 보이는 편이 낫다.
 * `Base`가 없으면 null(호출한 쪽이 정적 그림으로 대체). 원본 트리는 바꾸지 않는다.
 * 런타임 import가 없는 순수 함수 — OpenLayers 엔진을 대시보드 첫 번들에 끌어오지 않는다.
 */
export function buildPreviewTree(tree: LayerTree, theme: PreviewTheme): LayerTree | null {
    const base = findBaseLayer(tree)
    if (!base) return null
    const url = theme === 'dark' && base.url.includes(BASE_URL_SEGMENT) ? base.url.replace(BASE_URL_SEGMENT, DARK_URL_SEGMENT) : base.url
    return {
        groups: [],
        ungroupedLayers: [{ ...base, url, visible: true, groupId: null, groupName: null }],
    }
}

export function summarizeTree(tree: LayerTree): TreeSummary {
    const groups = tree.groups ?? []
    const leaves: LayerDef[] = []
    collectLeafLayers(groups, leaves)
    leaves.push(...(tree.ungroupedLayers ?? []))

    const counts = new Map<string, number>()
    for (const layer of leaves) {
        const isBasemap = layer.type === 'XYZ' && BASEMAP_LAYER_NAMES.includes(layer.layerName ?? '')
        const label = isBasemap ? BASEMAP_LABEL : layer.type
        counts.set(label, (counts.get(label) ?? 0) + 1)
    }
    return {
        layerCount: leaves.length,
        groupCount: countGroups(groups),
        entries: [...counts.entries()].map(([label, count]) => ({ label, count })),
    }
}
