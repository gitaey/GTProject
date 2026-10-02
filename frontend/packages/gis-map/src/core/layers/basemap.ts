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
 * 지도(OL)에 실제로 보이는지는 이 값이 체크박스 상태보다 우선한다(옛 resolveVisible).
 */
export function getBasemapVisibility(layer: LayerDef, mode: BasemapMode, modes: BasemapModeNames): boolean | null {
    if (layer.type !== 'XYZ') return null
    if (!allBasemapNames(modes).includes(layer.layerName ?? '')) return null
    return modes[mode].includes(layer.layerName ?? '')
}

/**
 * 체크박스 상태에서 배경지도 모드를 거꾸로 정한다(옛 toggleLayer의 역방향 동기화).
 * 일반 목록만 전부 켜짐 → normal, 위성 목록만 전부 켜짐 → satellite, 그 밖 → none.
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
    const names = allBasemapNames(modes)
    const only = (mode: Exclude<BasemapMode, 'none'>): boolean => {
        const own = modes[mode]
        if (own.length === 0) return false
        return names.every(n => (own.includes(n) ? isOn(n) : !isOn(n)))
    }
    if (only('normal')) return 'normal'
    if (only('satellite')) return 'satellite'
    return 'none'
}
