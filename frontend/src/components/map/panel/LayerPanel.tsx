'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, Settings, X, Save, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react'
import { useLayerStore, flattenGroupLayers } from '@/stores/map/layerStore'
import { useAuthStore } from '@/stores/authStore'
import LayerItem from '@/components/map/layer/LayerItem'
import { DbLayer, DbLayerGroup, LayerTreeResponse } from '@/types/layer'
import { getToken } from '@/stores/authStore'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
    const token = getToken()
    const headers: Record<string, string> = {
        ...(options?.headers as Record<string, string> ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
    if (options?.body) headers['Content-Type'] = 'application/json'
    const res = await fetch(`${API}${url}`, { ...options, headers })
    const json = await res.json()
    if (!json.success) throw new Error(json.message)
    return json.data
}

function flattenAll(tree: LayerTreeResponse): DbLayer[] {
    return [...flattenGroupLayers(tree.groups), ...tree.ungroupedLayers]
}

const S_INDENT = 20 // depth당 들여쓰기 px
const S_BASE   = 10 // 최상위 시작 px
const S_CHEV   = 18 // 화살표 영역 너비 px

// 설정 패널 내 그룹 노드
function SettingGroupNode({
    group, selectedIds, onToggle, depth = 0,
}: {
    group: DbLayerGroup
    selectedIds: Set<number>
    onToggle: (id: number) => void
    depth?: number
}) {
    const [open, setOpen] = useState(true)
    const allLeaf = [...group.layers, ...flattenGroupLayers(group.children)]
    const allSelected = allLeaf.length > 0 && allLeaf.every(l => selectedIds.has(l.id))
    const someSelected = allLeaf.some(l => selectedIds.has(l.id))

    const toggleGroup = () => {
        allLeaf.forEach(l => {
            if (allSelected) { if (selectedIds.has(l.id)) onToggle(l.id) }
            else { if (!selectedIds.has(l.id)) onToggle(l.id) }
        })
    }

    const groupIndent = S_BASE + depth * S_INDENT
    // 레이어는 depth+1 수준으로 들여쓰기
    const layerIndent = S_BASE + (depth + 1) * S_INDENT + S_CHEV

    return (
        <div>
            <div className="flex items-center gap-1.5 py-1.5"
                style={{ paddingLeft: `${groupIndent}px`, paddingRight: '12px' }}>
                <button onClick={() => setOpen(p => !p)} className="flex-shrink-0"
                    style={{ color: '#64748b', width: `${S_CHEV}px`, display: 'flex', alignItems: 'center' }}>
                    {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>
                <input type="checkbox"
                    checked={allSelected}
                    ref={el => { if (el) el.indeterminate = !allSelected && someSelected }}
                    onChange={toggleGroup}
                    onClick={e => e.stopPropagation()}
                    style={{ width: '13px', height: '13px', accentColor: '#F26722', flexShrink: 0, cursor: 'pointer' }}
                />
                <span style={{ fontSize: depth === 0 ? '12px' : '11.5px', fontWeight: depth === 0 ? 600 : 500, color: '#f1f5f9', flex: 1 }}>
                    {group.name}
                </span>
            </div>
            {open && (
                <>
                    {group.children.map(child => (
                        <SettingGroupNode key={child.id} group={child} selectedIds={selectedIds} onToggle={onToggle} depth={depth + 1} />
                    ))}
                    {group.layers.map(layer => (
                        <div key={layer.id} className="flex items-center gap-1.5 py-1.5"
                            style={{ paddingLeft: `${layerIndent}px`, paddingRight: '12px' }}>
                            <input type="checkbox"
                                checked={selectedIds.has(layer.id)}
                                onChange={() => onToggle(layer.id)}
                                style={{ width: '13px', height: '13px', accentColor: '#F26722', flexShrink: 0, cursor: 'pointer' }}
                            />
                            <span style={{ fontSize: '11.5px', color: selectedIds.has(layer.id) ? '#cbd5e1' : '#64748b' }}>
                                {layer.name}
                            </span>
                        </div>
                    ))}
                </>
            )}
        </div>
    )
}

// 설정 슬라이드 패널
function LayerSettingsPanel({ onClose }: { onClose: () => void }) {
    const { tree: currentTree, loadTree } = useLayerStore()
    const user = useAuthStore(s => s.user)
    const [roleTree, setRoleTree] = useState<LayerTreeResponse | null>(null)
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
    const [hasCustom, setHasCustom] = useState(false)
    const [saving, setSaving] = useState(false)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const init = async () => {
            if (!user) return
            setLoading(true)
            try {
                // role 기반 전체 허용 트리 (선택 가능 범위)
                const tree = await apiFetch<LayerTreeResponse>(`/api/layers/tree/permission/${user.role}`)
                setRoleTree(tree)

                // 현재 user-access 설정
                const userIds = await apiFetch<number[] | null>('/api/layers/user-access')
                if (userIds !== null) {
                    setSelectedIds(new Set(userIds))
                    setHasCustom(true)
                } else {
                    // 설정 없으면 전체 선택 상태로 시작
                    const all = flattenAll(tree)
                    setSelectedIds(new Set(all.map(l => l.id)))
                    setHasCustom(false)
                }
            } finally {
                setLoading(false)
            }
        }
        init()
    }, [user])

    const toggle = (id: number) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            await apiFetch('/api/layers/user-access', {
                method: 'PUT',
                body: JSON.stringify([...selectedIds]),
            })
            await loadTree()
            onClose()
        } finally {
            setSaving(false)
        }
    }

    const handleReset = async () => {
        setSaving(true)
        try {
            await apiFetch('/api/layers/user-access', { method: 'DELETE' })
            await loadTree()
            onClose()
        } finally {
            setSaving(false)
        }
    }

    const allLayers = roleTree ? flattenAll(roleTree) : []
    const allSelected = allLayers.length > 0 && allLayers.every(l => selectedIds.has(l.id))
    const someSelected = allLayers.some(l => selectedIds.has(l.id))

    return (
        <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            background: '#1e293b', zIndex: 10,
            display: 'flex', flexDirection: 'column',
        }}>
            {/* 헤더 */}
            <div style={{
                padding: '10px 10px 10px 12px',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
            }}>
                <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#f1f5f9' }}>레이어 설정</span>
                <button onClick={onClose} style={{ color: '#94a3b8', cursor: 'pointer', display: 'flex' }}>
                    <X size={14} />
                </button>
            </div>

            {/* 전체선택 바 */}
            {!loading && (
                <div style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0,
                }}>
                    <input type="checkbox"
                        checked={allSelected}
                        ref={el => { if (el) el.indeterminate = !allSelected && someSelected }}
                        onChange={() => {
                            if (allSelected) setSelectedIds(new Set())
                            else setSelectedIds(new Set(allLayers.map(l => l.id)))
                        }}
                        style={{ width: '13px', height: '13px', accentColor: '#F26722', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '11px', color: '#94a3b8', flex: 1 }}>전체선택</span>
                    <span style={{ fontSize: '11px', color: '#F26722', fontWeight: 500 }}>
                        {selectedIds.size}개 선택
                    </span>
                </div>
            )}

            {/* 트리 */}
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingTop: '4px' }}>
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
                        <div style={{
                            width: '20px', height: '20px', borderRadius: '50%',
                            border: '2px solid #F26722', borderTopColor: 'transparent',
                            animation: 'spin 0.8s linear infinite',
                        }} />
                    </div>
                ) : roleTree ? (
                    <>
                        {roleTree.groups.map(group => (
                            <SettingGroupNode key={group.id} group={group} selectedIds={selectedIds} onToggle={toggle} />
                        ))}
                        {roleTree.ungroupedLayers.map(layer => (
                            <div key={layer.id} className="flex items-center gap-2 py-1.5"
                                style={{ paddingLeft: '28px', paddingRight: '12px' }}>
                                <input type="checkbox"
                                    checked={selectedIds.has(layer.id)}
                                    onChange={() => toggle(layer.id)}
                                    style={{ width: '13px', height: '13px', accentColor: '#F26722', cursor: 'pointer' }}
                                />
                                <span style={{ fontSize: '11.5px', color: selectedIds.has(layer.id) ? '#e2e8f0' : '#94a3b8' }}>
                                    {layer.name}
                                </span>
                            </div>
                        ))}
                    </>
                ) : null}
            </div>

            {/* 하단 버튼 */}
            <div style={{
                padding: '10px 12px',
                borderTop: '1px solid rgba(255,255,255,0.08)',
                display: 'flex', gap: '6px', flexShrink: 0,
            }}>
                {hasCustom && (
                    <button onClick={handleReset} disabled={saving}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '4px',
                            padding: '6px 10px', borderRadius: '6px', fontSize: '11.5px',
                            background: 'rgba(255,255,255,0.06)', color: '#94a3b8',
                            border: 'none', cursor: 'pointer',
                        }}>
                        <RotateCcw size={11} /> 초기화
                    </button>
                )}
                <button onClick={handleSave} disabled={saving}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '4px',
                        padding: '6px 10px', borderRadius: '6px', fontSize: '11.5px',
                        background: '#F26722', color: '#fff', border: 'none',
                        cursor: 'pointer', flex: 1, justifyContent: 'center',
                        opacity: saving ? 0.6 : 1,
                    }}>
                    <Save size={11} /> {saving ? '저장 중...' : '저장'}
                </button>
            </div>
        </div>
    )
}

export default function LayerPanel() {
    const { tree, loadTree } = useLayerStore()
    const [settingsOpen, setSettingsOpen] = useState(false)

    return (
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* 헤더 */}
            <div style={{
                padding: '10px 10px 10px 12px',
                background: '#1e293b',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
            }}>
                <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#f1f5f9' }}>레이어</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                    <button onClick={loadTree}
                        className="p-1 rounded transition-colors cursor-pointer"
                        style={{ color: '#94a3b8' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        title="새로고침">
                        <RefreshCw size={14} />
                    </button>
                    <button onClick={() => setSettingsOpen(true)}
                        className="p-1 rounded transition-colors cursor-pointer"
                        style={{ color: settingsOpen ? '#F26722' : '#94a3b8' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        title="레이어 설정">
                        <Settings size={14} />
                    </button>
                </div>
            </div>

            {/* 레이어 트리 */}
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

            {/* 설정 패널 슬라이드인 */}
            {settingsOpen && (
                <LayerSettingsPanel onClose={() => setSettingsOpen(false)} />
            )}
        </div>
    )
}
