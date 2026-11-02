// 출력용 범례 모으기(순수 로직 + 주입받은 로더). 화면 범례(ui/layer/LayerLegend)와 같은 데이터(sources.legend)를 쓰되 캔버스에 그릴 수 있는 모양으로 다시 모은다.
//   켜진 비배경 레이어(VWorld SLD 견본 / GeoServer 범례 이미지) + 켜진 나만의지도(단일·범주·구간) + 켜진 GeoTIFF(이름만)
import { hexToRgba, translucent } from '../lib/color'
import type { LegendSource } from '../sources'
import type { LayerDef } from '../types/layer'
import type { MyMapStyleConfig } from '../types/mymap'
import type { VWorldLegendItem } from '../types/search'
import type { PrintWarning } from './types'

export type LegendSwatch =
    | { kind: 'polygon'; fill: string; stroke: string }
    | { kind: 'point'; fill: string; stroke: string }
    | { kind: 'image'; image: HTMLImageElement }

export interface LegendEntry {
    label: string
    /** null = 견본 없이 글자만(GeoTIFF) */
    swatch: LegendSwatch | null
}

export interface LegendGroup {
    /** '' = 제목 줄 없이 항목만 */
    title: string
    entries: LegendEntry[]
    /** 칸 부족이 아니라 분류 수 제한(8개)으로 못 보인 분류 수 */
    more: number
}

/** 범주·구간 스타일에서 그리는 분류 최대 수(나머지는 "외 n개") */
export const LEGEND_MAX_CLASSES = 8

export interface LegendBuildDeps {
    /** 지금 켜진 비배경 트리 레이어(트리 순서) */
    layers: readonly LayerDef[]
    legend?: LegendSource
    /** 범례 SLD 견본(레이어 이름 → 항목). 호출한 쪽이 캐시한다 */
    vworldItems(layerName: string): Promise<VWorldLegendItem[]>
    /** 범례 이미지 읽기(crossOrigin 'anonymous'). 실패하면 null */
    loadImage(url: string): Promise<HTMLImageElement | null>
    myMaps: ReadonlyArray<{ name: string; style: MyMapStyleConfig }>
    rasters: ReadonlyArray<{ name: string }>
}

export interface LegendBuildResult {
    groups: LegendGroup[]
    warnings: PrintWarning[]
}

function formatNumber(n: number): string {
    return Number(n.toPrecision(6)).toLocaleString('ko-KR')
}

/** 구간 스타일 라벨: '< 10', '10 ~ 20', '≥ 30' */
export function graduatedLabels(breaks: readonly number[], count: number): string[] {
    const out: string[] = []
    for (let i = 0; i < count; i++) {
        if (breaks.length === 0) out.push('전체')
        else if (i === 0) out.push('< ' + formatNumber(breaks[0]))
        else if (i >= breaks.length) out.push('≥ ' + formatNumber(breaks[breaks.length - 1]))
        else out.push(formatNumber(breaks[i - 1]) + ' ~ ' + formatNumber(breaks[i]))
    }
    return out
}

function mymapSwatch(style: MyMapStyleConfig, color: string | null): LegendSwatch {
    if (style.display === 'point') {
        return { kind: 'point', fill: color ?? style.pointColor ?? style.stroke, stroke: style.pointStroke }
    }
    const base = color ?? style.fill
    return { kind: 'polygon', fill: translucent(base, style.fillOpacity), stroke: color ?? style.stroke }
}

/** 나만의지도 한 레이어의 범례 묶음 */
export function mymapLegendGroup(name: string, style: MyMapStyleConfig): LegendGroup {
    const c = style.classify
    if (!c) return { title: '', entries: [{ label: name, swatch: mymapSwatch(style, null) }], more: 0 }
    const title = name + ' (' + c.field + ')'
    if (c.type === 'categorical') {
        const shown = c.classes.slice(0, LEGEND_MAX_CLASSES)
        const entries: LegendEntry[] = shown.map(x => ({ label: x.value, swatch: mymapSwatch(style, x.color) }))
        entries.push({ label: '기타', swatch: mymapSwatch(style, c.otherColor) })
        return { title, entries, more: Math.max(0, c.classes.length - shown.length) }
    }
    const labels = graduatedLabels(c.breaks, c.colors.length)
    const shown = Math.min(labels.length, LEGEND_MAX_CLASSES)
    return {
        title,
        entries: labels.slice(0, shown).map((label, i) => ({ label, swatch: mymapSwatch(style, c.colors[i]) })),
        more: labels.length - shown,
    }
}

function vworldEntry(item: VWorldLegendItem): LegendEntry {
    return {
        label: item.title,
        swatch: { kind: 'polygon', fill: hexToRgba(item.fillColor, item.fillOpacity), stroke: hexToRgba(item.strokeColor, item.strokeOpacity) },
    }
}

async function layerGroup(layer: LayerDef, deps: LegendBuildDeps, warnings: PrintWarning[]): Promise<LegendGroup | null> {
    const isVWorld = layer.url.includes('vworld.kr')
    if (isVWorld) {
        if (!layer.layerName || !deps.legend?.vworldLegend) return null
        const names = layer.layerName.split(',').map(n => n.trim()).filter(n => n !== '')
        const lists = await Promise.all(names.map(n => deps.vworldItems(n).catch((): VWorldLegendItem[] => [])))
        const entries = lists.flat().map(vworldEntry)
        return entries.length > 0 ? { title: layer.name, entries, more: 0 } : null
    }
    const url = deps.legend?.imageUrl?.(layer) ?? null
    if (!url) return null
    const image = await deps.loadImage(url)
    if (!image) {
        warnings.push({ code: 'LEGEND_IMAGE_SKIPPED', message: '범례 이미지를 불러오지 못해 뺐습니다: ' + layer.name })
        return null
    }
    return { title: '', entries: [{ label: layer.name, swatch: { kind: 'image', image } }], more: 0 }
}

/** 순서: 트리 레이어 → 나만의지도 → GeoTIFF. 병렬로 받되 결과 순서는 유지한다 */
export async function buildLegendGroups(deps: LegendBuildDeps): Promise<LegendBuildResult> {
    const warnings: PrintWarning[] = []
    const treeGroups = await Promise.all(deps.layers.map(l => layerGroup(l, deps, warnings)))
    const groups: LegendGroup[] = treeGroups.filter((g): g is LegendGroup => g !== null)
    for (const m of deps.myMaps) groups.push(mymapLegendGroup(m.name, m.style))
    for (const r of deps.rasters) groups.push({ title: '', entries: [{ label: r.name, swatch: null }], more: 0 })
    return { groups, warnings }
}
