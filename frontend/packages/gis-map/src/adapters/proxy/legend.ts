// 범례 소스 — VWorld 범례 스타일(SLD, 호스트 프록시 {proxyBaseUrl}/vworld/legend-style)과 GeoServer GetLegendGraphic 이미지.
// 파서·URL 조립은 옛 components/map/layer/LayerItem.tsx의 parseVWorldLegendStyle·fetchVWorldLegend·getGsLegendEntries 그대로.
import { isVWorldUrl } from '../../core'
import type { LayerDef, LegendSource, SourceContext, VWorldLegendItem } from '../../core'

/** VWorld GetLegendStyle(SLD XML) → 범례 항목. 같은 제목의 규칙은 하나로 합치고, 무늬 이미지는 나중 규칙 것이 이긴다 */
export function parseVWorldLegendStyle(xml: string): VWorldLegendItem[] {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xml, 'application/xml')
    const rules = Array.from(doc.querySelectorAll('Rule'))
    const grouped = new Map<string, VWorldLegendItem>()

    for (const rule of rules) {
        const title = rule.querySelector('Title')?.textContent?.trim() ?? ''
        if (!title) continue

        const fillColor = rule.querySelector('Fill > CssParameter[name="fill"]')?.textContent?.trim() ?? '#ffffff'
        const fillOpacity = parseFloat(rule.querySelector('Fill > CssParameter[name="fill-opacity"]')?.textContent ?? '0')
        const strokeColor = rule.querySelector('Stroke > CssParameter[name="stroke"]')?.textContent?.trim() ?? '#000000'
        const strokeOpacity = parseFloat(rule.querySelector('Stroke > CssParameter[name="stroke-opacity"]')?.textContent ?? '1')
        const patternUrl = rule.querySelector('OnlineResource')?.getAttribute('xlink:href') ?? undefined

        if (!grouped.has(title)) {
            grouped.set(title, { title, fillColor, fillOpacity, strokeColor, strokeOpacity, patternUrl: patternUrl || undefined })
        } else {
            const existing = grouped.get(title)!
            if (patternUrl) existing.patternUrl = patternUrl
        }
    }

    return [...grouped.values()]
}

/** GeoServer 이미지 범례 URL. VWorld·WMS 아님·레이어 이름 없음·geoserverUrl 없음이면 null */
export function geoserverLegendUrl(geoserverUrl: string, layer: LayerDef): string | null {
    if (layer.type !== 'WMS' || !layer.layerName || isVWorldUrl(layer.url)) return null
    if (!geoserverUrl) return null
    const style = layer.styleName ? `&STYLE=${encodeURIComponent(layer.styleName)}` : ''
    return `${geoserverUrl}/ows?service=WMS&version=1.1.0&request=GetLegendGraphic&format=image%2Fpng&width=20&height=20&LAYER=${encodeURIComponent(layer.layerName)}${style}`
}

export function proxyLegend(ctx: SourceContext): LegendSource {
    return {
        async vworldLegend(layerName: string): Promise<VWorldLegendItem[]> {
            const proxy = ctx.host().endpoints.proxyBaseUrl
            const res = await ctx.http.fetch(`${proxy}/vworld/legend-style?layer=${encodeURIComponent(layerName)}`)
            if (!res.ok) return []
            const xml = await res.text()
            return parseVWorldLegendStyle(xml)
        },
        imageUrl(layer: LayerDef): string | null {
            return geoserverLegendUrl(ctx.host().endpoints.geoserverUrl, layer)
        },
    }
}
