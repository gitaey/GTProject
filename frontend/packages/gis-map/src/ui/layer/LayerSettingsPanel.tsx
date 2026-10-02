'use client'

// 레이어 설정 패널(개인 레이어 선택 저장/초기화) — 레이어 패널 위로 덮어 연다 (스타일: gm-layer-settings)
// FE-5b-2: 옛 panel/LayerPanel.tsx 안의 LayerSettingsPanel·SettingGroupNode를 떼어 냈다(본문 그대로)
// 들여쓰기·글자 크기처럼 깊이·선택 상태에 따라 바뀌는 값만 인라인 style로 남겼다
import { useEffect, useState } from 'react'
import { X, Save, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react'
import { allTreeLayers as flattenAll, flattenGroupLayers } from '../../core'
import type { LayerGroupDef as DbLayerGroup, LayerTree as LayerTreeResponse } from '../../core'
import { useGisHost, useGisMap } from '../../react'

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
            <div className="gm-layer-settings__row"
                style={{ paddingLeft: `${groupIndent}px` }}>
                <button onClick={() => setOpen(p => !p)} className="gm-layer-settings__chevron"
                    style={{ width: `${S_CHEV}px` }}>
                    {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>
                <input type="checkbox"
                    checked={allSelected}
                    ref={el => { if (el) el.indeterminate = !allSelected && someSelected }}
                    onChange={toggleGroup}
                    onClick={e => e.stopPropagation()}
                    className="gm-layer-settings__check gm-layer-settings__check--fixed"
                />
                <span className="gm-layer-settings__group-name"
                    style={{ fontSize: depth === 0 ? '12px' : '11.5px', fontWeight: depth === 0 ? 600 : 500, color: depth === 0 ? '#0f172a' : '#334155' }}>
                    {group.name}
                </span>
            </div>
            {open && (
                <>
                    {group.children.map(child => (
                        <SettingGroupNode key={child.id} group={child} selectedIds={selectedIds} onToggle={onToggle} depth={depth + 1} />
                    ))}
                    {group.layers.map(layer => (
                        <div key={layer.id} className="gm-layer-settings__row"
                            style={{ paddingLeft: `${layerIndent}px` }}>
                            <input type="checkbox"
                                checked={selectedIds.has(layer.id)}
                                onChange={() => onToggle(layer.id)}
                                className="gm-layer-settings__check gm-layer-settings__check--fixed"
                            />
                            <span className="gm-layer-settings__name"
                                style={{ color: selectedIds.has(layer.id) ? '#0f172a' : '#94a3b8' }}>
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
export default function LayerSettingsPanel({ onClose }: { onClose: () => void }) {
    // 권한 트리·개인 설정 조회/저장/초기화는 레이어 트리 소스(adapters/rest)의 userSelection으로만 한다
    const gis = useGisMap()
    const selection = gis?.sources.layerTree?.userSelection
    const loadTree = () => gis ? gis.layers.load() : Promise.resolve()
    // 사용자 객체 대신 원시값을 effect 의존성으로 쓴다(호스트가 getCurrentUser()마다 새 객체를 줘도 재요청 고리가 생기지 않게)
    const user = useGisHost().getCurrentUser()
    const userKey = user ? `${user.userId}|${user.role}` : null
    const [roleTree, setRoleTree] = useState<LayerTreeResponse | null>(null)
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
    const [hasCustom, setHasCustom] = useState(false)
    const [saving, setSaving] = useState(false)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const init = async () => {
            if (!userKey || !selection) return
            setLoading(true)
            try {
                // role 기반 전체 허용 트리 (선택 가능 범위)
                const tree = await selection.loadSelectable()
                setRoleTree(tree)

                // 현재 user-access 설정
                const userIds = await selection.get()
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
    }, [userKey, selection])

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
            await selection?.save([...selectedIds])
            await loadTree()
            onClose()
        } finally {
            setSaving(false)
        }
    }

    const handleReset = async () => {
        setSaving(true)
        try {
            await selection?.reset()
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
        <div className="gm-layer-settings">
            {/* 헤더 */}
            <div className="gm-layer-settings__header">
                <span className="gm-layer-settings__title">레이어 설정</span>
                <button onClick={onClose} className="gm-layer-settings__close">
                    <X size={14} />
                </button>
            </div>

            {/* 전체선택 바 */}
            {!loading && (
                <div className="gm-layer-settings__bar">
                    <input type="checkbox"
                        checked={allSelected}
                        ref={el => { if (el) el.indeterminate = !allSelected && someSelected }}
                        onChange={() => {
                            if (allSelected) setSelectedIds(new Set())
                            else setSelectedIds(new Set(allLayers.map(l => l.id)))
                        }}
                        className="gm-layer-settings__check"
                    />
                    <span className="gm-layer-settings__all-label">전체선택</span>
                    <span className="gm-layer-settings__count">
                        {selectedIds.size}개 선택
                    </span>
                </div>
            )}

            {/* 트리 */}
            <div className="gm-layer-settings__tree">
                {loading ? (
                    <div className="gm-panel__loading">
                        <div className="gm-layer-settings__spinner" />
                    </div>
                ) : roleTree ? (
                    <>
                        {roleTree.groups.map(group => (
                            <SettingGroupNode key={group.id} group={group} selectedIds={selectedIds} onToggle={toggle} />
                        ))}
                        {roleTree.ungroupedLayers.map(layer => (
                            <div key={layer.id} className="gm-layer-settings__row gm-layer-settings__row--root">
                                <input type="checkbox"
                                    checked={selectedIds.has(layer.id)}
                                    onChange={() => toggle(layer.id)}
                                    className="gm-layer-settings__check"
                                />
                                <span className="gm-layer-settings__name"
                                    style={{ color: selectedIds.has(layer.id) ? '#0f172a' : '#94a3b8' }}>
                                    {layer.name}
                                </span>
                            </div>
                        ))}
                    </>
                ) : null}
            </div>

            {/* 하단 버튼 */}
            <div className="gm-layer-settings__footer">
                {hasCustom && (
                    <button onClick={handleReset} disabled={saving}
                        className="gm-layer-settings__reset">
                        <RotateCcw size={11} /> 초기화
                    </button>
                )}
                <button onClick={handleSave} disabled={saving}
                    className="gm-layer-settings__save"
                    style={{ opacity: saving ? 0.6 : 1 }}>
                    <Save size={11} /> {saving ? '저장 중...' : '저장'}
                </button>
            </div>
        </div>
    )
}
