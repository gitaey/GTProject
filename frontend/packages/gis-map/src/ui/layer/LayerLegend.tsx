'use client'

// 레이어 범례(VWorld SLD 견본 / GeoServer 범례 이미지) — 레이어 행의 상세(투명도 아래)에 붙는다. 스타일: gm-layer-legend
// FE-5b-2: 옛 layer/LayerItem.tsx 안의 LayerLegend를 떼어 냈다(본문 그대로). 견본 색·테두리·무늬는 항목마다 달라 인라인 style
import { useState, useEffect } from 'react'
import type { LayerDef as DbLayer, VWorldLegendItem } from '../../core'
import { useGisMap } from '../../react'

function hexToRgba(hex: string, opacity: number): string {
    const h = hex.replace('#', '')
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    return `rgba(${r},${g},${b},${opacity})`
}

interface GsLegendEntry { url: string; label: string }

export default function LayerLegend({ layer, ctrlIndent }: { layer: DbLayer; ctrlIndent: number }) {
    const isVWorld = layer.url.includes('vworld.kr')
    const [vworldItems, setVworldItems] = useState<VWorldLegendItem[][]>([])
    // 범례 데이터는 엔진의 legend 소스(adapters/proxy)로만 받는다. 엔진마다 한 번 만들어지는 객체라 참조가 안정적이다
    const legend = useGisMap()?.sources.legend

    useEffect(() => {
        if (!isVWorld || !layer.layerName || !legend?.vworldLegend) return
        const names = layer.layerName.split(',').map(n => n.trim())
        Promise.all(names.map(n => legend.vworldLegend!(n))).then(setVworldItems)
    }, [isVWorld, layer.layerName, legend])

    const imageUrl = legend?.imageUrl?.(layer) ?? null
    const gsEntries: GsLegendEntry[] = imageUrl ? [{ url: imageUrl, label: layer.name }] : []
    const hasLegend = isVWorld ? vworldItems.some(items => items.length > 0) : gsEntries.length > 0

    if (!hasLegend && !isVWorld) return null
    if (isVWorld && vworldItems.length === 0) return null

    const allVWorldItems = vworldItems.flat()
    if (isVWorld && allVWorldItems.length === 0) return null

    return (
        <div className="gm-layer-legend">
            {isVWorld ? allVWorldItems.map((item, i) => (
                <div key={i} className="gm-layer-legend__item">
                    <span className="gm-layer-legend__label">
                        {i === 0 ? '범례' : ''}
                    </span>
                    <div className="gm-layer-legend__swatch-box">
                        <div className="gm-layer-legend__swatch" style={{
                            border: `1px solid ${hexToRgba(item.strokeColor, item.strokeOpacity)}`,
                            backgroundColor: hexToRgba(item.fillColor, item.fillOpacity),
                            backgroundImage: item.patternUrl ? `url(${item.patternUrl})` : undefined,
                        }} />
                    </div>
                    <span className="gm-layer-legend__title">{item.title}</span>
                </div>
            )) : gsEntries.map((entry, i) => (
                <div key={i} className="gm-layer-legend__item">
                    <span className="gm-layer-legend__label">
                        {i === 0 ? '범례' : ''}
                    </span>
                    <div className="gm-layer-legend__swatch-box">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={entry.url} alt={entry.label} className="gm-layer-legend__image" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    </div>
                    <span className="gm-layer-legend__title">{entry.label}</span>
                </div>
            ))}
        </div>
    )
}
