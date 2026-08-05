'use client'

import { useState, useEffect } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { DbLayer, DbLayerGroup } from '@/types/layer'
import { useLayerStore, flattenGroupLayers, getLayerVisible, getLayerOpacity } from '@/stores/map/layerStore'

interface Props {
    node: DbLayerGroup | DbLayer
    depth?: number
}

function isGroup(node: DbLayerGroup | DbLayer): node is DbLayerGroup {
    return 'children' in node
}

const GS_URL = process.env.NEXT_PUBLIC_GEOSERVER_URL ?? 'http://localhost:8600/geoserver'

const DEPTH_COLORS = ['#2563eb', '#0d9488', '#d97706', '#9333ea']
const GROUP_INDENT = [10, 18, 30, 42]
const LAYER_INDENT = [18, 28, 40, 52]
const CTRL_INDENT  = [32, 42, 54, 66]

interface VWorldLegendItem {
    title: string
    fillColor: string
    fillOpacity: number
    strokeColor: string
    strokeOpacity: number
    patternUrl?: string
}

function hexToRgba(hex: string, opacity: number): string {
    const h = hex.replace('#', '')
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    return `rgba(${r},${g},${b},${opacity})`
}

function parseVWorldLegendStyle(xml: string): VWorldLegendItem[] {
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

async function fetchVWorldLegend(layerName: string): Promise<VWorldLegendItem[]> {
    const res = await fetch(`/proxy/vworld/legend-style?layer=${encodeURIComponent(layerName)}`)
    if (!res.ok) return []
    const xml = await res.text()
    return parseVWorldLegendStyle(xml)
}

interface GsLegendEntry { url: string; label: string }

function getGsLegendEntries(layer: DbLayer): GsLegendEntry[] {
    if (layer.type !== 'WMS' || !layer.layerName || layer.url.includes('vworld.kr')) return []
    const style = layer.styleName ? `&STYLE=${encodeURIComponent(layer.styleName)}` : ''
    return [{
        url: `${GS_URL}/ows?service=WMS&version=1.1.0&request=GetLegendGraphic&format=image%2Fpng&width=20&height=20&LAYER=${encodeURIComponent(layer.layerName)}${style}`,
        label: layer.name,
    }]
}

function LayerLegend({ layer, ctrlIndent }: { layer: DbLayer; ctrlIndent: number }) {
    const isVWorld = layer.url.includes('vworld.kr')
    const [vworldItems, setVworldItems] = useState<VWorldLegendItem[][]>([])

    useEffect(() => {
        if (!isVWorld || !layer.layerName) return
        const names = layer.layerName.split(',').map(n => n.trim())
        Promise.all(names.map(fetchVWorldLegend)).then(setVworldItems)
    }, [isVWorld, layer.layerName])

    const gsEntries = getGsLegendEntries(layer)
    const hasLegend = isVWorld ? vworldItems.some(items => items.length > 0) : gsEntries.length > 0

    if (!hasLegend && !isVWorld) return null
    if (isVWorld && vworldItems.length === 0) return null

    const allVWorldItems = vworldItems.flat()
    if (isVWorld && allVWorldItems.length === 0) return null

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {isVWorld ? allVWorldItems.map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '10.5px', color: '#94a3b8', flexShrink: 0, minWidth: '34px' }}>
                        {i === 0 ? '범례' : ''}
                    </span>
                    <div style={{ width: '20px', height: '20px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{
                            width: '14px',
                            height: '14px',
                            border: `1px solid ${hexToRgba(item.strokeColor, item.strokeOpacity)}`,
                            backgroundColor: hexToRgba(item.fillColor, item.fillOpacity),
                            backgroundImage: item.patternUrl ? `url(${item.patternUrl})` : undefined,
                            backgroundSize: 'auto',
                        }} />
                    </div>
                    <span style={{ fontSize: '10.5px', color: '#64748b' }}>{item.title}</span>
                </div>
            )) : gsEntries.map((entry, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '10.5px', color: '#94a3b8', flexShrink: 0, minWidth: '34px' }}>
                        {i === 0 ? '범례' : ''}
                    </span>
                    <div style={{ width: '20px', height: '20px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={entry.url} alt={entry.label} style={{ display: 'block', width: '20px', height: '20px' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    </div>
                    <span style={{ fontSize: '10.5px', color: '#64748b' }}>{entry.label}</span>
                </div>
            ))}
        </div>
    )
}

export default function LayerItem({ node, depth = 0 }: Props) {
    const { toggleLayer, toggleGroup, setOpacity, toggleExpanded, isExpanded } = useLayerStore()
    const visibleMap = useLayerStore(s => s.visibleMap)
    const opacityMap = useLayerStore(s => s.opacityMap)

    const di = Math.min(depth, DEPTH_COLORS.length - 1)

    if (isGroup(node)) {
        const expanded = isExpanded(node.id)
        const layers = [...node.layers, ...flattenGroupLayers(node.children)]
        const allVisible = layers.length > 0 && layers.every(l => getLayerVisible(visibleMap, l))
        const someVisible = layers.some(l => getLayerVisible(visibleMap, l))

        return (
            <div style={depth === 0 ? { borderBottom: '1px solid #e2e8f0' } : {}}>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '7px',
                        padding: `7px 10px 7px ${GROUP_INDENT[di]}px`,
                        background: depth === 0 ? '#f8fafc' : '#fff',
                        borderBottom: expanded ? '0.5px solid #e2e8f0' : 'none',
                        cursor: 'pointer',
                    }}
                    onClick={() => toggleExpanded(node.id)}
                >
                    {depth > 0 && (
                        <div style={{
                            width: '3px',
                            height: '14px',
                            borderRadius: '2px',
                            background: DEPTH_COLORS[di],
                            flexShrink: 0,
                        }} />
                    )}
                    <input
                        type="checkbox"
                        checked={allVisible}
                        ref={el => { if (el) el.indeterminate = !allVisible && someVisible }}
                        onChange={e => { e.stopPropagation(); toggleGroup(node) }}
                        onClick={e => e.stopPropagation()}
                        style={{ width: '14px', height: '14px', accentColor: '#2563eb', flexShrink: 0, cursor: 'pointer' }}
                    />
                    <span style={{
                        fontSize: depth === 0 ? '12px' : depth === 1 ? '11.5px' : '11px',
                        fontWeight: depth === 0 ? 600 : depth === 1 ? 500 : 400,
                        color: depth === 0 ? '#0f172a' : depth === 1 ? '#334155' : '#64748b',
                        flex: 1,
                        userSelect: 'none',
                    }}>
                        {node.name}
                    </span>
                    <span style={{ color: '#94a3b8', flexShrink: 0 }}>
                        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </span>
                </div>

                {expanded && (
                    <div>
                        {node.children.map(child => (
                            <LayerItem key={child.id} node={child} depth={depth + 1} />
                        ))}
                        {node.layers.length > 0 && (
                            <div style={node.children.length > 0 ? { borderTop: '0.5px solid #e2e8f0' } : {}}>
                                {node.layers.map(layer => (
                                    <LayerItem key={layer.id} node={layer} depth={depth + 1} />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        )
    }

    const visible = getLayerVisible(visibleMap, node)
    const opacity = getLayerOpacity(opacityMap, node)
    const [detailOpen, setDetailOpen] = useState(false)

    return (
        <div style={{ background: '#fff' }}>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '7px',
                    padding: `4px 6px 4px ${LAYER_INDENT[di]}px`,
                    cursor: 'pointer',
                }}
                onClick={() => toggleLayer(node.id)}
            >
                <input
                    type="checkbox"
                    checked={visible}
                    onChange={() => toggleLayer(node.id)}
                    onClick={e => e.stopPropagation()}
                    style={{ width: '13px', height: '13px', accentColor: '#2563eb', flexShrink: 0, cursor: 'pointer' }}
                />
                <span style={{
                    fontSize: '11.5px',
                    color: visible ? '#0f172a' : '#94a3b8',
                    fontWeight: visible ? 500 : 400,
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    userSelect: 'none',
                }}>
                    {node.name}
                </span>
                <button
                    onClick={e => { e.stopPropagation(); setDetailOpen(p => !p) }}
                    style={{
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '18px',
                        height: '18px',
                        borderRadius: '4px',
                        border: 'none',
                        background: 'transparent',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        padding: 0,
                        transition: 'transform 0.15s',
                        transform: detailOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}
                >
                    <ChevronDown size={11} />
                </button>
            </div>

            {visible && detailOpen && (
                <div style={{
                    paddingBottom: '7px',
                    paddingLeft: `${CTRL_INDENT[di]}px`,
                    paddingRight: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '5px',
                    minWidth: 0,
                    overflow: 'hidden',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                        <span style={{ fontSize: '10.5px', color: '#94a3b8', flexShrink: 0, minWidth: '34px' }}>투명도</span>
                        <input
                            type="range" min={0} max={1} step={0.01} value={opacity}
                            onChange={e => setOpacity(node.id, parseFloat(e.target.value))}
                            style={{ flex: 1, minWidth: 0, height: '3px', accentColor: '#2563eb', cursor: 'pointer' }}
                        />
                        <span style={{
                            fontFamily: 'ui-monospace, monospace',
                            fontSize: '10px',
                            color: '#94a3b8',
                            width: '28px',
                            textAlign: 'right',
                            flexShrink: 0,
                        }}>
                            {Math.round(opacity * 100)}
                        </span>
                    </div>
                    <LayerLegend layer={node} ctrlIndent={CTRL_INDENT[di]} />
                </div>
            )}
        </div>
    )
}
