// 배경지도 모드(일반/위성/없음)와 배경지도 XYZ 레이어의 관계. 옛 layerStore의 규칙을 그대로 옮기고,
// 모드별 layerName 목록만 설정(config.layers.basemapModes)으로 바꿀 수 있게 했다.
import type { BasemapMode, LayerDef } from '../types/layer'
import { getLayerVisible } from './treeUtils'

export type BasemapModeNames = Readonly<Record<BasemapMode, readonly string[]>>

/** 기본값(옛 BASEMAP_LAYER_NAMES): 일반 = Base, 위성 = Satellite + Hybrid, 없음 = 없음 */
export const DEFAULT_BASEMAP_MODES: BasemapModeNames = Object.freeze({
    normal: Object.freeze(['Base']),
    satellite: Object.freeze(['Satellite', 'Hybrid']),
    none: Object.freeze([]),
})

export function resolveBasemapModes(
    modes?: Partial<Record<Exclude<BasemapMode, 'none'>, string[]>>,
): BasemapModeNames {
    return Object.freeze({
        normal: Object.freeze([...(modes?.normal ?? DEFAULT_BASEMAP_MODES.normal)]),
        satellite: Object.freeze([...(modes?.satellite ?? DEFAULT_BASEMAP_MODES.satellite)]),
        none: Object.freeze([]),
    })
}

function allBasemapNames(modes: BasemapModeNames): string[] {
    return Object.values(modes).flat()
}

/** 배경지도 레이어인가(XYZ이고 layerName이 어느 모드 목록에든 있음) */
export function isBasemapLayer(layer: LayerDef, modes: BasemapModeNames): boolean {
    return layer.type === 'XYZ' && allBasemapNames(modes).includes(layer.layerName ?? '')
}

/**
 * 배경지도 레이어면 그 모드에서 켜져야 하는지(true/false), 배경지도 레이어가 아니면 null.
 * 모드를 고르는 순간 체크박스를 이 값으로 맞추는 데 쓴다(setBasemapMode·트리 도착 때 초기 정렬).
 * 지도에 실제로 보이는지는 레이어마다 자기 체크박스를 따른다 — 위성·하이브리드를 따로 켜고 끌 수 있게
 * (옛 resolveVisible은 모드가 체크박스보다 우선해서 둘을 같이 켜야만 보였다).
 */
export function getBasemapVisibility(layer: LayerDef, mode: BasemapMode, modes: BasemapModeNames): boolean | null {
    if (layer.type !== 'XYZ') return null
    if (!allBasemapNames(modes).includes(layer.layerName ?? '')) return null
    return modes[mode].includes(layer.layerName ?? '')
}

/**
 * 체크박스 상태에서 배경지도 모드(상단 일반·위성·없음 단추의 표시)를 거꾸로 정한다.
 * 일반 목록 레이어가 하나라도 켜지고 위성 목록은 모두 꺼짐 → normal, 반대 → satellite
 * (위성 또는 하이브리드 하나만 켜도 satellite), 둘 다 꺼짐이거나 양쪽이 섞임 → none.
 * 이름마다 "그 layerName을 가진 첫 XYZ 레이어"의 체크 상태를 본다(없으면 꺼짐).
 */
export function deriveBasemapMode(
    layers: LayerDef[],
    visibleMap: Record<number, boolean>,
    modes: BasemapModeNames,
): BasemapMode {
    const isOn = (name: string): boolean => {
        const l = layers.find(x => x.layerName === name && x.type === 'XYZ')
        if (!l) return false
        return getLayerVisible(visibleMap, l)
    }
    const anyOn = (mode: Exclude<BasemapMode, 'none'>): boolean => modes[mode].some(isOn)
    const normal = anyOn('normal')
    const satellite = anyOn('satellite')
    if (normal && !satellite) return 'normal'
    if (satellite && !normal) return 'satellite'
    return 'none'
}
