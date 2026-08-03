'use client'

import { useLayerStore } from '@/stores/map/layerStore'
import LayerItem from '@/components/map/layer/LayerItem'
import { RefreshCw, Settings } from 'lucide-react'

export default function LayerPanel() {
    const { tree, loadTree } = useLayerStore()

    return (
        <>
            <div style={{
                padding: '10px 10px 10px 12px',
                background: '#1e293b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
            }}>
                <span style={{
                    fontSize: '12.5px',
                    fontWeight: 700,
                    color: '#f1f5f9',
                }}>
                    레이어
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                    <button
                        onClick={loadTree}
                        className="p-1 rounded transition-colors cursor-pointer"
                        style={{ color: '#94a3b8' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        title="새로고침"
                    >
                        <RefreshCw size={14} />
                    </button>
                    <button
                        className="p-1 rounded transition-colors cursor-pointer"
                        style={{ color: '#94a3b8' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        title="설정"
                    >
                        <Settings size={14} />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden" style={{ paddingTop: '4px', paddingBottom: '8px' }}>
                {tree?.groups.map(group => (
                    <LayerItem key={group.id} node={group} />
                ))}
                {tree?.ungroupedLayers.map(layer => (
                    <LayerItem key={layer.id} node={layer} />
                ))}
                {!tree && (
                    <div style={{ padding: '24px 16px', textAlign: 'center', color: '#a1a1aa', fontSize: '12px' }}>
                        레이어 없음
                    </div>
                )}
            </div>
        </>
    )
}
