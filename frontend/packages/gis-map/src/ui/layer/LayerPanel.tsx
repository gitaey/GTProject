'use client'

// 레이어 패널: 머리줄(새로고침·설정) + 레이어 트리 + 설정 패널 (스타일: gm-panel__header, gm-layer-panel)
// FE-5b-2: 옛 panel/LayerPanel.tsx. 설정 패널(LayerSettingsPanel·SettingGroupNode)은 LayerSettingsPanel.tsx로 떼어 냈다(본문 그대로)
import { useState } from 'react'
import { RefreshCw, Settings } from 'lucide-react'
import type { LayerTreeState } from '../../core'
import { useGisMap, useLayerTreeState } from '../../react'
import LayerTreeItem from './LayerTreeItem'
import LayerSettingsPanel from './LayerSettingsPanel'

// 엔진 레이어 트리 상태 선택자(모듈 상수)
const selectTree = (s: LayerTreeState) => s.tree

export default function LayerPanel() {
    const gis = useGisMap()
    const tree = useLayerTreeState(selectTree)
    const loadTree = () => { void gis?.layers.load() }
    // 개인 레이어 설정 소스가 없으면 설정 버튼을 숨긴다(엔진 생성 전 첫 렌더에서는 옛 화면대로 보인다)
    const showSettings = !gis || !!gis.sources.layerTree?.userSelection
    const [settingsOpen, setSettingsOpen] = useState(false)

    return (
        <div className="gm-layer-panel">
            {/* 헤더 */}
            <div className="gm-panel__header gm-layer-panel__header">
                <span className="gm-panel__title">레이어</span>
                <div className="gm-layer-panel__actions">
                    <button onClick={loadTree}
                        className="gm-layer-panel__icon-btn"
                        onMouseEnter={e => (e.currentTarget.style.background = '#e2e8f0')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        title="새로고침">
                        <RefreshCw size={14} />
                    </button>
                    {showSettings && (
                    <button onClick={() => setSettingsOpen(true)}
                        className="gm-layer-panel__icon-btn"
                        style={{ color: settingsOpen ? 'var(--gm-primary)' : '#64748b' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#e2e8f0')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        title="레이어 설정">
                        <Settings size={14} />
                    </button>
                    )}
                </div>
            </div>

            {/* 레이어 트리 */}
            <div className="gm-layer-panel__tree">
                {tree?.groups.map(group => (
                    <LayerTreeItem key={group.id} node={group} />
                ))}
                {tree?.ungroupedLayers.map(layer => (
                    <LayerTreeItem key={layer.id} node={layer} />
                ))}
                {!tree && (
                    <div className="gm-layer-panel__empty">
                        레이어 없음
                    </div>
                )}
            </div>

            {/* 설정 패널 슬라이드인 */}
            {settingsOpen && (
                <LayerSettingsPanel onClose={() => setSettingsOpen(false)} />
            )}
        </div>
    )
}
