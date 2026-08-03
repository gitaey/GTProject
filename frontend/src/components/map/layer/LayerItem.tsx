'use client'

import { useState } from 'react'
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

interface LegendEntry { url: string; label: string }

function getLegendEntries(layer: DbLayer): LegendEntry[] {
    if (layer.type !== 'WMS' || !layer.layerName) return []
    if (layer.url.includes('vworld.kr')) {
        if (!layer.styleName) return []
        const LAYER_LABELS: Record<string, string> = {
            'lp_pa_cbnd_bubun': '부번',
            'lp_pa_cbnd_bonbun': '본번',
            'lt_c_spbd': '건물',
        }
        return layer.layerName.split(',').map(name => ({
            url: `/proxy/geoserver/legend/${encodeURIComponent(layer.styleName!)}`,
            label: LAYER_LABELS[name.trim()] ?? name.trim(),
        }))
    }
    const style = layer.styleName ? `&STYLE=${encodeURIComponent(layer.styleName)}` : ''
    return [{
        url: `${GS_URL}/ows?service=WMS&version=1.1.0&request=GetLegendGraphic&format=image%2Fpng&width=20&height=20&LAYER=${encodeURIComponent(layer.layerName)}${style}`,
        label: layer.name,
    }]
}

export default function LayerItem({ node, depth = 0 }: Props) {
    const { toggleLayer, toggleGroup, setOpacity } = useLayerStore()
    const visibleMap = useLayerStore(s => s.visibleMap)
    const opacityMap = useLayerStore(s => s.opacityMap)
    const [expanded, setExpanded] = useState(true)

    const di = Math.min(depth, DEPTH_COLORS.length - 1)

    if (isGroup(node)) {
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
                    onClick={() => setExpanded(p => !p)}
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
                        {/* 하위 그룹이 있는 경우, 직속 레이어 위에 구분선 */}
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
    const legendEntries = getLegendEntries(node)

    return (
        <div style={{ background: '#fff' }}>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '7px',
                    padding: `4px 10px 4px ${LAYER_INDENT[di]}px`,
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
            </div>

            {visible && (
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
                    {legendEntries.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            {legendEntries.map((entry, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '10.5px', color: '#94a3b8', flexShrink: 0, minWidth: '34px' }}>
                                        {i === 0 ? '범례' : ''}
                                    </span>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={entry.url}
                                        alt={entry.label}
                                        style={{ display: 'block', width: '16px', height: '16px', flexShrink: 0 }}
                                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                                    />
                                    <span style={{ fontSize: '10.5px', color: '#64748b' }}>{entry.label}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
