'use client'

// 레이어 트리 항목(그룹 행 / 레이어 행 + 투명도·범례 상세) — 스타일: gm-layer-tree
// FE-5b-2: 옛 layer/LayerItem.tsx(LayerItem). 범례(LayerLegend)는 LayerLegend.tsx로 떼어 냈다(본문 그대로)
// 들여쓰기·깊이 색·글자 크기·켜짐 상태처럼 깊이/상태에 따라 바뀌는 값만 인라인 style로 남겼다
import { useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { flattenGroupLayers, getLayerVisible, getLayerOpacity } from '../../core'
import type { LayerDef as DbLayer, LayerGroupDef as DbLayerGroup, LayerTreeState } from '../../core'
import { useGisMap, useLayerTreeState } from '../../react'
import LayerLegend from './LayerLegend'

interface Props {
    node: DbLayerGroup | DbLayer
    depth?: number
}

function isGroup(node: DbLayerGroup | DbLayer): node is DbLayerGroup {
    return 'children' in node
}


const DEPTH_COLORS = ['#2563eb', '#0d9488', '#d97706', '#9333ea']
const GROUP_INDENT = [10, 18, 30, 42]
const LAYER_INDENT = [18, 28, 40, 52]
const CTRL_INDENT  = [32, 42, 54, 66]

// 엔진 레이어 트리 상태 선택자(모듈 상수 — 스토어가 가진 객체를 그대로 돌려준다)
const selectVisible = (s: LayerTreeState) => s.visible
const selectOpacity = (s: LayerTreeState) => s.opacity
const selectExpanded = (s: LayerTreeState) => s.expanded

export default function LayerTreeItem({ node, depth = 0 }: Props) {
    // 가장 가까운 엔진(map.layers)의 상태를 읽고, 조작도 엔진에 시킨다
    const layerTree = useGisMap()?.layers
    const visibleMap = useLayerTreeState(selectVisible)
    const opacityMap = useLayerTreeState(selectOpacity)
    const expandedMap = useLayerTreeState(selectExpanded)
    const toggleLayer = (layerId: number) => layerTree?.toggleLayer(layerId)
    const toggleGroup = (group: DbLayerGroup) => layerTree?.toggleGroup(group)
    const setOpacity = (layerId: number, opacity: number) => layerTree?.setOpacity(layerId, opacity)
    const toggleExpanded = (groupId: number) => layerTree?.toggleExpanded(groupId)
    const isExpanded = (groupId: number) => (groupId in expandedMap ? expandedMap[groupId] : true)

    const di = Math.min(depth, DEPTH_COLORS.length - 1)

    if (isGroup(node)) {
        const expanded = isExpanded(node.id)
        const layers = [...node.layers, ...flattenGroupLayers(node.children)]
        const allVisible = layers.length > 0 && layers.every(l => getLayerVisible(visibleMap, l))
        const someVisible = layers.some(l => getLayerVisible(visibleMap, l))

        return (
            <div className="gm-layer-tree__group" style={depth === 0 ? { borderBottom: '1px solid #e2e8f0' } : {}}>
                <div
                    className="gm-layer-tree__group-row"
                    style={{
                        padding: `7px 10px 7px ${GROUP_INDENT[di]}px`,
                        background: depth === 0 ? '#f8fafc' : '#fff',
                        borderBottom: expanded ? '0.5px solid #e2e8f0' : 'none',
                    }}
                    onClick={() => toggleExpanded(node.id)}
                >
                    {depth > 0 && (
                        <div className="gm-layer-tree__depth-bar" style={{
                            background: DEPTH_COLORS[di],
                        }} />
                    )}
                    <input
                        type="checkbox"
                        checked={allVisible}
                        ref={el => { if (el) el.indeterminate = !allVisible && someVisible }}
                        onChange={e => { e.stopPropagation(); toggleGroup(node) }}
                        onClick={e => e.stopPropagation()}
                        className="gm-layer-tree__group-check"
                    />
                    <span className="gm-layer-tree__group-name" style={{
                        fontSize: depth === 0 ? '12px' : depth === 1 ? '11.5px' : '11px',
                        fontWeight: depth === 0 ? 600 : depth === 1 ? 500 : 400,
                        color: depth === 0 ? '#0f172a' : depth === 1 ? '#334155' : '#64748b',
                    }}>
                        {node.name}
                    </span>
                    <span className="gm-layer-tree__chevron">
                        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </span>
                </div>

                {expanded && (
                    <div>
                        {node.children.map(child => (
                            <LayerTreeItem key={child.id} node={child} depth={depth + 1} />
                        ))}
                        {node.layers.length > 0 && (
                            <div className="gm-layer-tree__layers" style={node.children.length > 0 ? { borderTop: '0.5px solid #e2e8f0' } : {}}>
                                {node.layers.map(layer => (
                                    <LayerTreeItem key={layer.id} node={layer} depth={depth + 1} />
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
        <div className="gm-layer-tree__layer">
            <div
                className="gm-layer-tree__layer-row"
                style={{
                    padding: `4px 6px 4px ${LAYER_INDENT[di]}px`,
                }}
                onClick={() => toggleLayer(node.id)}
            >
                <input
                    type="checkbox"
                    checked={visible}
                    onChange={() => toggleLayer(node.id)}
                    onClick={e => e.stopPropagation()}
                    className="gm-layer-tree__layer-check"
                />
                <span className="gm-layer-tree__layer-name" style={{
                    color: visible ? '#0f172a' : '#94a3b8',
                    fontWeight: visible ? 500 : 400,
                }}>
                    {node.name}
                </span>
                <button
                    onClick={e => { e.stopPropagation(); setDetailOpen(p => !p) }}
                    className="gm-layer-tree__detail-btn"
                    style={{
                        transform: detailOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}
                >
                    <ChevronDown size={11} />
                </button>
            </div>

            {visible && detailOpen && (
                <div className="gm-layer-tree__detail" style={{
                    paddingLeft: `${CTRL_INDENT[di]}px`,
                }}>
                    <div className="gm-layer-tree__opacity">
                        <span className="gm-layer-tree__ctrl-label">투명도</span>
                        <input
                            type="range" min={0} max={1} step={0.01} value={opacity}
                            onChange={e => setOpacity(node.id, parseFloat(e.target.value))}
                            className="gm-layer-tree__opacity-range"
                        />
                        <span className="gm-layer-tree__opacity-value">
                            {Math.round(opacity * 100)}
                        </span>
                    </div>
                    <LayerLegend layer={node} ctrlIndent={CTRL_INDENT[di]} />
                </div>
            )}
        </div>
    )
}
