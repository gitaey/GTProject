'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import {
    ChevronDown, ChevronRight, GripVertical, Layers, Pencil,
    Plus, Save, Trash2, X, Eye, EyeOff, FolderPlus,
} from 'lucide-react'
import {
    DndContext, DragEndEvent, DragOverlay, DragStartEvent,
    PointerSensor, closestCenter, useSensor, useSensors,
} from '@dnd-kit/core'
import {
    SortableContext, arrayMove, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
    DbLayer, DbLayerFormState, DbLayerGroup, DbLayerType, DbLayerSourceType,
    LayerTreeResponse, EMPTY_LAYER_FORM, LAYER_TYPE_OPTIONS, LAYER_SOURCE_OPTIONS,
    PERMISSION_OPTIONS,
} from '@/types/layer'
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
    if (res.status === 204) return undefined as T
    if (res.status === 401) { window.location.href = '/login'; throw new Error('Unauthorized') }
    const json = await res.json()
    if (!json.success) throw new Error(json.message)
    return json.data
}

const inputStyle: React.CSSProperties = {
    background: 'var(--bg-page)', border: '1px solid var(--border)',
    color: 'var(--text-primary)', borderRadius: '8px',
}

const TYPE_COLOR: Record<DbLayerType, string> = {
    WMS: '#3b82f6', WMTS: '#8b5cf6', TMS: '#f59e0b',
    WFS: '#10b981', MVT: '#ec4899', GEOJSON: '#06b6d4',
    ARCGIS: '#f97316', XYZ: '#6b7280',
}

// ─── Sortable Layer Row ────────────────────────────────────────────────────

interface LayerRowProps {
    layer: DbLayer
    depth?: number
    permissionIds: Set<number> | null
    onTogglePermission?: (id: number) => void
    onEdit: (l: DbLayer) => void
    onDelete: (l: DbLayer) => void
    isDragOverlay?: boolean
}

function LayerRow({ layer, depth = 0, permissionIds, onTogglePermission, onEdit, onDelete, isDragOverlay }: LayerRowProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({ id: `layer-${layer.id}`, data: { type: 'layer', layer } })

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
        paddingLeft: `${16 + depth * 20}px`,
    }

    return (
        <div ref={setNodeRef}
            className="flex items-center gap-2 pr-3 py-2.5 group/row"
            style={{ ...style, borderBottom: '1px solid var(--border-subtle)' }}>

            <div {...listeners} {...attributes}
                className="cursor-grab p-1 rounded flex-shrink-0"
                style={{ color: 'var(--text-faint)', touchAction: 'none' }}>
                <GripVertical size={13} />
            </div>

            {layer.visible
                ? <Eye size={13} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
                : <EyeOff size={13} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />}

            <span className="flex-1 text-sm truncate font-medium" style={{ color: 'var(--text-primary)' }}>
                {layer.name}
            </span>

            <span className="text-xs px-1.5 py-0.5 rounded font-mono flex-shrink-0"
                style={{ background: `${TYPE_COLOR[layer.type]}22`, color: TYPE_COLOR[layer.type] }}>
                {layer.type}
            </span>

            <span className="hidden lg:block text-xs flex-shrink-0 w-16 text-center" style={{ color: 'var(--text-faint)' }}>
                {layer.sourceType}
            </span>

            {permissionIds !== null ? (
                <input type="checkbox" checked={permissionIds.has(layer.id)}
                    onChange={() => onTogglePermission?.(layer.id)}
                    className="w-4 h-4 flex-shrink-0 cursor-pointer"
                    style={{ accentColor: 'var(--accent)' }} />
            ) : (
                <div className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity flex-shrink-0">
                    <button onClick={() => onEdit(layer)}
                        className="p-1.5 rounded cursor-pointer" style={{ color: 'var(--text-faint)' }}>
                        <Pencil size={13} />
                    </button>
                    <button onClick={() => onDelete(layer)}
                        className="p-1.5 rounded cursor-pointer" style={{ color: 'var(--text-faint)' }}>
                        <Trash2 size={13} />
                    </button>
                </div>
            )}
        </div>
    )
}

// ─── Sortable Group Row ────────────────────────────────────────────────────

interface GroupNodeProps {
    group: DbLayerGroup
    depth?: number
    permissionIds: Set<number> | null
    onTogglePermission?: (id: number) => void
    onEditLayer: (l: DbLayer) => void
    onDeleteLayer: (l: DbLayer) => void
    onEditGroup: (g: DbLayerGroup) => void
    onDeleteGroup: (g: DbLayerGroup) => void
    onAddLayerToGroup: (groupId: number) => void
    onAddGroupToGroup: (parentGroupId: number) => void
}

function GroupNode({
    group, depth = 0, permissionIds, onTogglePermission,
    onEditLayer, onDeleteLayer, onEditGroup, onDeleteGroup, onAddLayerToGroup, onAddGroupToGroup,
}: GroupNodeProps) {
    const [expanded, setExpanded] = useState(true)
    const layerIds = group.layers.map(l => `layer-${l.id}`)

    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({ id: `group-${group.id}`, data: { type: 'group', group } })

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
    }

    return (
        <div ref={setNodeRef} style={style}>
            {/* 그룹 헤더 */}
            <div className="flex items-center gap-2 pr-3 py-2.5 group/grp"
                style={{
                    paddingLeft: `${8 + depth * 20}px`,
                    borderBottom: '1px solid var(--border-subtle)',
                    background: depth === 0 ? 'var(--bg-hover)' : 'transparent',
                }}>
                <div {...listeners} {...attributes}
                    className="cursor-grab p-1 rounded flex-shrink-0"
                    style={{ color: 'var(--text-faint)', touchAction: 'none' }}>
                    <GripVertical size={13} />
                </div>

                <button onClick={() => setExpanded(e => !e)} className="cursor-pointer flex-shrink-0"
                    style={{ color: 'var(--text-secondary)' }}>
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>

                <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {group.name}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
                    {group.layers.length + group.children.reduce((s, c) => s + c.layers.length, 0)}개
                </span>

                {permissionIds === null && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover/grp:opacity-100 transition-opacity flex-shrink-0">
                        <button onClick={() => onAddGroupToGroup(group.id)} title="하위 그룹 추가"
                            className="p-1.5 rounded cursor-pointer" style={{ color: 'var(--text-faint)' }}>
                            <FolderPlus size={13} />
                        </button>
                        <button onClick={() => onAddLayerToGroup(group.id)} title="레이어 추가"
                            className="p-1.5 rounded cursor-pointer" style={{ color: 'var(--text-faint)' }}>
                            <Plus size={13} />
                        </button>
                        <button onClick={() => onEditGroup(group)}
                            className="p-1.5 rounded cursor-pointer" style={{ color: 'var(--text-faint)' }}>
                            <Pencil size={13} />
                        </button>
                        <button onClick={() => onDeleteGroup(group)}
                            className="p-1.5 rounded cursor-pointer" style={{ color: 'var(--text-faint)' }}>
                            <Trash2 size={13} />
                        </button>
                    </div>
                )}
            </div>

            {/* 자식 */}
            {expanded && (
                <>
                    {/* 하위 그룹 */}
                    <SortableContext items={group.children.map(c => `group-${c.id}`)} strategy={verticalListSortingStrategy}>
                        {group.children.map(child => (
                            <GroupNode key={child.id} group={child} depth={depth + 1}
                                permissionIds={permissionIds} onTogglePermission={onTogglePermission}
                                onEditLayer={onEditLayer} onDeleteLayer={onDeleteLayer}
                                onEditGroup={onEditGroup} onDeleteGroup={onDeleteGroup}
                                onAddLayerToGroup={onAddLayerToGroup}
                                onAddGroupToGroup={onAddGroupToGroup} />
                        ))}
                    </SortableContext>

                    {/* 레이어 */}
                    <SortableContext items={layerIds} strategy={verticalListSortingStrategy}>
                        {group.layers.map(layer => (
                            <LayerRow key={layer.id} layer={layer} depth={depth + 1}
                                permissionIds={permissionIds} onTogglePermission={onTogglePermission}
                                onEdit={onEditLayer} onDelete={onDeleteLayer} />
                        ))}
                    </SortableContext>

                    {group.layers.length === 0 && group.children.length === 0 && (
                        <div className="py-3 text-center text-xs" style={{ paddingLeft: `${36 + depth * 20}px`, color: 'var(--text-faint)' }}>
                            레이어 없음
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

// ─── Layer Form Modal ──────────────────────────────────────────────────────

function LayerModal({ mode, layer, groups, defaultGroupId, onClose, onSaved }: {
    mode: 'create' | 'edit'
    layer?: DbLayer
    groups: DbLayerGroup[]
    defaultGroupId?: number
    onClose: () => void
    onSaved: () => void
}) {
    const [form, setForm] = useState<DbLayerFormState>(() =>
        layer ? {
            name: layer.name, type: layer.type, sourceType: layer.sourceType,
            url: layer.url, layerName: layer.layerName ?? '', styleName: layer.styleName ?? '',
            styleConfig: layer.styleConfig ?? '', format: layer.format ?? '',
            projection: layer.projection ?? '', minZoom: layer.minZoom?.toString() ?? '',
            maxZoom: layer.maxZoom?.toString() ?? '', opacity: layer.opacity,
            visible: layer.visible, sortOrder: layer.sortOrder,
            groupName: layer.groupName ?? '', description: layer.description ?? '',
        } : EMPTY_LAYER_FORM
    )
    const [groupId, setGroupId] = useState<string>(
        layer?.groupId?.toString() ?? defaultGroupId?.toString() ?? ''
    )
    const [error, setError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const sf = <K extends keyof DbLayerFormState>(k: K, v: DbLayerFormState[K]) =>
        setForm(p => ({ ...p, [k]: v }))

    // 모든 그룹을 flat하게 (하위 그룹 포함)
    const flatGroups = (gs: DbLayerGroup[]): DbLayerGroup[] =>
        gs.flatMap(g => [g, ...flatGroups(g.children)])

    const allGroups = flatGroups(groups)

    const handleSave = async () => {
        setSaving(true); setError(null)
        try {
            const body = {
                name: form.name, type: form.type, sourceType: form.sourceType,
                url: form.url, layerName: form.layerName || null, styleName: form.styleName || null,
                styleConfig: form.styleConfig || null, format: form.format || null,
                projection: form.projection || null,
                minZoom: form.minZoom ? Number(form.minZoom) : null,
                maxZoom: form.maxZoom ? Number(form.maxZoom) : null,
                opacity: form.opacity, visible: form.visible, sortOrder: form.sortOrder,
                groupId: groupId ? Number(groupId) : null,
                description: form.description || null,
            }
            if (mode === 'create') {
                await apiFetch('/api/layers', { method: 'POST', body: JSON.stringify(body) })
            } else {
                await apiFetch(`/api/layers/${layer!.id}`, { method: 'PUT', body: JSON.stringify(body) })
            }
            onSaved()
        } catch (e) { setError(e instanceof Error ? e.message : '저장 실패') }
        finally { setSaving(false) }
    }

    return (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
            <div className="rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
                    <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {mode === 'create' ? '레이어 추가' : '레이어 수정'}
                    </h3>
                    <button onClick={onClose} className="cursor-pointer" style={{ color: 'var(--text-faint)' }}><X size={18} /></button>
                </div>
                <div className="px-6 py-4 space-y-3 overflow-y-auto flex-1">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>타입 *</label>
                            <select value={form.type} onChange={e => sf('type', e.target.value as DbLayerType)}
                                className="w-full px-3 py-2 text-sm focus:outline-none cursor-pointer" style={inputStyle}>
                                {LAYER_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>소스 *</label>
                            <select value={form.sourceType} onChange={e => sf('sourceType', e.target.value as DbLayerSourceType)}
                                className="w-full px-3 py-2 text-sm focus:outline-none cursor-pointer" style={inputStyle}>
                                {LAYER_SOURCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>이름 *</label>
                        <input value={form.name} onChange={e => sf('name', e.target.value)}
                            className="w-full px-3 py-2 text-sm focus:outline-none" style={inputStyle} />
                    </div>
                    <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>그룹</label>
                        <select value={groupId} onChange={e => setGroupId(e.target.value)}
                            className="w-full px-3 py-2 text-sm focus:outline-none cursor-pointer" style={inputStyle}>
                            <option value="">미분류</option>
                            {allGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>URL *</label>
                        <input value={form.url} onChange={e => sf('url', e.target.value)}
                            className="w-full px-3 py-2 text-sm font-mono focus:outline-none" style={inputStyle} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>layerName</label>
                            <input value={form.layerName} onChange={e => sf('layerName', e.target.value)}
                                placeholder="workspace:layer" className="w-full px-3 py-2 text-sm font-mono focus:outline-none" style={inputStyle} />
                        </div>
                        <div>
                            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>styleName</label>
                            <input value={form.styleName} onChange={e => sf('styleName', e.target.value)}
                                className="w-full px-3 py-2 text-sm font-mono focus:outline-none" style={inputStyle} />
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>포맷</label>
                            <input value={form.format} onChange={e => sf('format', e.target.value)}
                                placeholder="image/png" className="w-full px-3 py-2 text-sm focus:outline-none" style={inputStyle} />
                        </div>
                        <div>
                            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>좌표계</label>
                            <input value={form.projection} onChange={e => sf('projection', e.target.value)}
                                placeholder="EPSG:3857" className="w-full px-3 py-2 text-sm focus:outline-none" style={inputStyle} />
                        </div>
                        <div>
                            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>불투명도</label>
                            <input type="number" min={0} max={1} step={0.1} value={form.opacity}
                                onChange={e => sf('opacity', Number(e.target.value))}
                                className="w-full px-3 py-2 text-sm focus:outline-none" style={inputStyle} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>정렬 순서</label>
                            <input type="number" value={form.sortOrder} onChange={e => sf('sortOrder', Number(e.target.value))}
                                className="w-full px-3 py-2 text-sm focus:outline-none" style={inputStyle} />
                        </div>
                        <div className="flex items-end pb-1">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input type="checkbox" checked={form.visible} onChange={e => sf('visible', e.target.checked)}
                                    className="w-4 h-4" style={{ accentColor: 'var(--accent)' }} />
                                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>기본 표시</span>
                            </label>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>설명</label>
                        <textarea value={form.description} onChange={e => sf('description', e.target.value)}
                            rows={2} className="w-full px-3 py-2 text-sm focus:outline-none resize-none" style={inputStyle} />
                    </div>
                    {error && <p className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>{error}</p>}
                </div>
                <div className="flex gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
                    <button onClick={onClose} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg cursor-pointer"
                        style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>취소</button>
                    <button onClick={handleSave} disabled={saving}
                        className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg cursor-pointer disabled:opacity-50"
                        style={{ background: 'var(--accent)', color: '#fff' }}>
                        {saving ? '저장 중...' : '저장'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ─── Group Form Modal ──────────────────────────────────────────────────────

function GroupModal({ mode, group, allGroups, defaultParentId, onClose, onSaved }: {
    mode: 'create' | 'edit'
    group?: DbLayerGroup
    allGroups: DbLayerGroup[]
    defaultParentId?: number
    onClose: () => void
    onSaved: () => void
}) {
    const [name, setName] = useState(group?.name ?? '')
    const [parentId, setParentId] = useState(group?.parentId?.toString() ?? defaultParentId?.toString() ?? '')
    const [sortOrder, setSortOrder] = useState(group?.sortOrder ?? 0)
    const [error, setError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    const flatGroups = (gs: DbLayerGroup[]): DbLayerGroup[] =>
        gs.flatMap(g => [g, ...flatGroups(g.children)])
    const candidates = flatGroups(allGroups).filter(g => g.id !== group?.id)

    const handleSave = async () => {
        setSaving(true); setError(null)
        try {
            const body = { name, parentId: parentId ? Number(parentId) : null, sortOrder }
            if (mode === 'create') {
                await apiFetch('/api/layer-groups', { method: 'POST', body: JSON.stringify(body) })
            } else {
                await apiFetch(`/api/layer-groups/${group!.id}`, { method: 'PUT', body: JSON.stringify(body) })
            }
            onSaved()
        } catch (e) { setError(e instanceof Error ? e.message : '저장 실패') }
        finally { setSaving(false) }
    }

    return (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
            <div className="rounded-2xl shadow-2xl w-full max-w-sm"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
                    <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {mode === 'create' ? '그룹 추가' : '그룹 수정'}
                    </h3>
                    <button onClick={onClose} className="cursor-pointer" style={{ color: 'var(--text-faint)' }}><X size={18} /></button>
                </div>
                <div className="px-6 py-4 space-y-3">
                    <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>그룹명 *</label>
                        <input value={name} onChange={e => setName(e.target.value)}
                            className="w-full px-3 py-2 text-sm focus:outline-none" style={inputStyle} />
                    </div>
                    <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>상위 그룹</label>
                        <select value={parentId} onChange={e => setParentId(e.target.value)}
                            className="w-full px-3 py-2 text-sm focus:outline-none cursor-pointer" style={inputStyle}>
                            <option value="">루트 (최상위)</option>
                            {candidates.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>정렬 순서</label>
                        <input type="number" value={sortOrder} onChange={e => setSortOrder(Number(e.target.value))}
                            className="w-full px-3 py-2 text-sm focus:outline-none" style={inputStyle} />
                    </div>
                    {error && <p className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>{error}</p>}
                </div>
                <div className="flex gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
                    <button onClick={onClose} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg cursor-pointer"
                        style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>취소</button>
                    <button onClick={handleSave} disabled={saving}
                        className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg cursor-pointer disabled:opacity-50"
                        style={{ background: 'var(--accent)', color: '#fff' }}>
                        {saving ? '저장 중...' : '저장'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ─── Delete Confirm ────────────────────────────────────────────────────────

function DeleteModal({ label, onClose, onConfirm }: { label: string; onClose: () => void; onConfirm: () => Promise<void> }) {
    const [deleting, setDeleting] = useState(false)
    const handleConfirm = async () => { setDeleting(true); await onConfirm(); setDeleting(false) }
    return (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
            <div className="rounded-2xl shadow-2xl w-full max-w-sm" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                <div className="px-6 pt-6 pb-4 text-center">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
                        style={{ background: 'rgba(239,68,68,0.12)' }}>
                        <Trash2 size={22} style={{ color: '#ef4444' }} />
                    </div>
                    <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>삭제 확인</h3>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{label}</span>을(를) 삭제하시겠습니까?
                    </p>
                </div>
                <div className="flex gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
                    <button onClick={onClose} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg cursor-pointer"
                        style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>취소</button>
                    <button onClick={handleConfirm} disabled={deleting}
                        className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg cursor-pointer disabled:opacity-50"
                        style={{ background: '#ef4444', color: '#fff' }}>
                        {deleting ? '삭제 중...' : '삭제'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ─── Main Page ─────────────────────────────────────────────────────────────

type Tab = 'tree' | 'permission'
type LayerModal_ = { mode: 'create'; defaultGroupId?: number } | { mode: 'edit'; layer: DbLayer }
type GroupModal_ = { mode: 'create'; defaultParentId?: number } | { mode: 'edit'; group: DbLayerGroup }
type DeleteModal_ = { type: 'layer'; item: DbLayer } | { type: 'group'; item: DbLayerGroup }

export default function LayerPage() {
    const [tab, setTab]       = useState<Tab>('tree')
    const [tree, setTree]     = useState<LayerTreeResponse | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError]   = useState<string | null>(null)

    const [layerModal, setLayerModal]   = useState<LayerModal_ | null>(null)
    const [groupModal, setGroupModal]   = useState<GroupModal_ | null>(null)
    const [deleteModal, setDeleteModal] = useState<DeleteModal_ | null>(null)

    // Permission tab state
    const [permission, setPermission]   = useState('VIEWER')
    const [permIds, setPermIds]         = useState<Set<number>>(new Set())
    const [permSaving, setPermSaving]   = useState(false)
    const [permDirty, setPermDirty]     = useState(false)

    // DnD active item
    const [activeId, setActiveId] = useState<string | null>(null)

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

    const loadTree = useCallback(async () => {
        setLoading(true); setError(null)
        try { setTree(await apiFetch<LayerTreeResponse>('/api/layers/tree')) }
        catch { setError('레이어 목록을 불러오지 못했습니다.') }
        finally { setLoading(false) }
    }, [])

    const loadPermission = useCallback(async (perm: string) => {
        try {
            const ids = await apiFetch<number[]>(`/api/layers/permissions/${perm}`)
            setPermIds(new Set(ids))
            setPermDirty(false)
        } catch { /* ignore */ }
    }, [])

    useEffect(() => { loadTree() }, [loadTree])
    useEffect(() => { if (tab === 'permission') loadPermission(permission) }, [tab, permission, loadPermission])

    // 모든 레이어 flat list (permission 탭용)
    const allLayers: DbLayer[] = []
    if (tree) {
        const collect = (groups: DbLayerGroup[]) => {
            for (const g of groups) { allLayers.push(...g.layers); collect(g.children) }
        }
        collect(tree.groups)
        allLayers.push(...tree.ungroupedLayers)
    }

    // 모든 그룹 flat list (modal용)
    const allGroups: DbLayerGroup[] = []
    if (tree) {
        const collect = (gs: DbLayerGroup[]) => { for (const g of gs) { allGroups.push(g); collect(g.children) } }
        collect(tree.groups)
    }

    const togglePermLayer = (id: number) => {
        setPermIds(prev => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
        setPermDirty(true)
    }

    const savePermission = async () => {
        setPermSaving(true)
        try {
            await apiFetch(`/api/layers/permissions/${permission}`, {
                method: 'PUT', body: JSON.stringify([...permIds]),
            })
            setPermDirty(false)
        } catch { /* ignore */ }
        finally { setPermSaving(false) }
    }

    // DnD handlers
    const handleDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id))
    const handleDragEnd = async (e: DragEndEvent) => {
        setActiveId(null)
        const { active, over } = e
        if (!over || active.id === over.id || !tree) return

        const activeIdStr = String(active.id)
        const overIdStr   = String(over.id)
        const isGroupDrag = activeIdStr.startsWith('group-')

        if (!isGroupDrag && overIdStr.startsWith('group-') === false && overIdStr.startsWith('layer-') === false) return

        // deep clone으로 불변성 보장
        const newTree: LayerTreeResponse = JSON.parse(JSON.stringify(tree))

        if (isGroupDrag) {
            const activeGroupId = Number(activeIdStr.replace('group-', ''))

            // active 그룹의 부모 id 탐색 (null = 루트)
            const findParentId = (groups: DbLayerGroup[], targetId: number, parentId: number | null = null): number | null | undefined => {
                for (const g of groups) {
                    if (g.id === targetId) return parentId
                    const r = findParentId(g.children, targetId, g.id)
                    if (r !== undefined) return r
                }
                return undefined
            }

            // 특정 부모의 children 배열 가져오기
            const getSiblings = (groups: DbLayerGroup[], pid: number | null): DbLayerGroup[] | null => {
                if (pid === null) return groups
                for (const g of groups) {
                    if (g.id === pid) return g.children
                    const r = getSiblings(g.children, pid)
                    if (r) return r
                }
                return null
            }

            // siblings 내에서 over 아이템이 위치한 인덱스 탐색
            const findOverIndex = (siblings: DbLayerGroup[], overId: string): number => {
                if (overId.startsWith('group-')) {
                    const id = Number(overId.replace('group-', ''))
                    const direct = siblings.findIndex(g => g.id === id)
                    if (direct !== -1) return direct
                    const contains = (gs: DbLayerGroup[], tid: number): boolean =>
                        gs.some(g => g.id === tid || contains(g.children, tid))
                    return siblings.findIndex(g => contains(g.children, id))
                }
                if (overId.startsWith('layer-')) {
                    const layerId = Number(overId.replace('layer-', ''))
                    const containsLayer = (g: DbLayerGroup, lid: number): boolean =>
                        g.layers.some(l => l.id === lid) || g.children.some(c => containsLayer(c, lid))
                    return siblings.findIndex(g => containsLayer(g, layerId))
                }
                return -1
            }

            const parentId = findParentId(newTree.groups, activeGroupId)
            if (parentId === undefined) return

            const siblings = getSiblings(newTree.groups, parentId)
            if (!siblings) return

            const oldIdx = siblings.findIndex(g => g.id === activeGroupId)
            const newIdx = findOverIndex(siblings, overIdStr)
            if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return

            const reordered = arrayMove([...siblings], oldIdx, newIdx)
            siblings.splice(0, siblings.length, ...reordered)
            setTree({ ...newTree })

            await apiFetch('/api/layers/reorder', {
                method: 'PUT',
                body: JSON.stringify({
                    groups: reordered.map((g, i) => ({ id: g.id, sortOrder: i, parentId })),
                }),
            })
        } else {
            const activeLayerId = Number(activeIdStr.replace('layer-', ''))

            // 레이어가 속한 컨테이너(layers 배열 + groupId) 탐색
            type Container = { layers: DbLayer[]; groupId: number | null }
            const findContainer = (groups: DbLayerGroup[], layerId: number): Container | null => {
                for (const g of groups) {
                    if (g.layers.some(l => l.id === layerId)) return { layers: g.layers, groupId: g.id }
                    const r = findContainer(g.children, layerId)
                    if (r) return r
                }
                return null
            }

            const src = findContainer(newTree.groups, activeLayerId)
                ?? (newTree.ungroupedLayers.some(l => l.id === activeLayerId)
                    ? { layers: newTree.ungroupedLayers, groupId: null } : null)
            if (!src) return

            // over 아이템의 타겟 컨테이너 + 삽입 위치 결정
            let dst: Container
            let insertIdx: number

            if (overIdStr.startsWith('layer-')) {
                const overLayerId = Number(overIdStr.replace('layer-', ''))
                const found = findContainer(newTree.groups, overLayerId)
                    ?? (newTree.ungroupedLayers.some(l => l.id === overLayerId)
                        ? { layers: newTree.ungroupedLayers, groupId: null } : null)
                if (!found) return
                dst = found
                insertIdx = dst.layers.findIndex(l => l.id === overLayerId)
            } else {
                // over가 그룹 헤더 → 해당 그룹의 layers 끝에 추가
                const overGroupId = Number(overIdStr.replace('group-', ''))
                const findGroupLayers = (groups: DbLayerGroup[], gid: number): DbLayer[] | null => {
                    for (const g of groups) {
                        if (g.id === gid) return g.layers
                        const r = findGroupLayers(g.children, gid)
                        if (r) return r
                    }
                    return null
                }
                const targetLayers = findGroupLayers(newTree.groups, overGroupId)
                if (!targetLayers) return
                dst = { layers: targetLayers, groupId: overGroupId }
                insertIdx = 0
            }

            if (src.groupId === dst.groupId) {
                // 같은 그룹 내 재정렬
                const aIdx = src.layers.findIndex(l => l.id === activeLayerId)
                if (aIdx === -1 || aIdx === insertIdx) return
                const reordered = arrayMove([...src.layers], aIdx, insertIdx)
                src.layers.splice(0, src.layers.length, ...reordered)
                setTree({ ...newTree })
                await apiFetch('/api/layers/reorder', {
                    method: 'PUT',
                    body: JSON.stringify({
                        layers: reordered.map((l, i) => ({ id: l.id, sortOrder: i, groupId: src.groupId })),
                    }),
                })
            } else {
                // 다른 그룹으로 이동
                const aIdx = src.layers.findIndex(l => l.id === activeLayerId)
                if (aIdx === -1) return
                const [moved] = src.layers.splice(aIdx, 1)

                // over가 레이어일 때 드래그 중심이 over 중심보다 아래면 그 다음에 삽입
                let finalIdx = insertIdx
                if (overIdStr.startsWith('layer-')) {
                    const translated = active.rect.current.translated
                    if (translated) {
                        const activeCenter = translated.top + translated.height / 2
                        const overCenter   = over.rect.top + over.rect.height / 2
                        if (activeCenter > overCenter) finalIdx = insertIdx + 1
                    }
                }

                const clampedIdx = Math.min(finalIdx, dst.layers.length)
                dst.layers.splice(clampedIdx, 0, moved)
                setTree({ ...newTree })
                await apiFetch('/api/layers/reorder', {
                    method: 'PUT',
                    body: JSON.stringify({
                        layers: [
                            ...src.layers.map((l, i) => ({ id: l.id, sortOrder: i, groupId: src.groupId })),
                            ...dst.layers.map((l, i) => ({ id: l.id, sortOrder: i, groupId: dst.groupId })),
                        ],
                    }),
                })
            }
        }
    }

    const handleDeleteLayer = async (layer: DbLayer) => {
        await apiFetch(`/api/layers/${layer.id}`, { method: 'DELETE' })
        setDeleteModal(null)
        loadTree()
    }

    const handleDeleteGroup = async (group: DbLayerGroup) => {
        await apiFetch(`/api/layer-groups/${group.id}`, { method: 'DELETE' })
        setDeleteModal(null)
        loadTree()
    }

    return (
        <div className="flex min-h-screen" style={{ background: 'var(--bg-page)' }}>
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">
                <Header title="레이어 관리" breadcrumb={['지도', '레이어 관리']} />

                <main className="flex-1 p-6 space-y-4">
                    {/* 탭 + 액션 버튼 */}
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                            {([['tree', '레이어 구조'], ['permission', '권한 설정']] as [Tab, string][]).map(([t, label]) => (
                                <button key={t} onClick={() => setTab(t)}
                                    className="px-4 py-1.5 text-sm font-medium rounded-md cursor-pointer transition-colors"
                                    style={tab === t
                                        ? { background: 'var(--accent)', color: '#fff' }
                                        : { color: 'var(--text-secondary)' }}>
                                    {label}
                                </button>
                            ))}
                        </div>

                        {tab === 'tree' && (
                            <div className="flex items-center gap-2">
                                <button onClick={() => setGroupModal({ mode: 'create' })}
                                    className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg cursor-pointer"
                                    style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                                    <FolderPlus size={15} /> 그룹 추가
                                </button>
                                <button onClick={() => setLayerModal({ mode: 'create' })}
                                    className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg cursor-pointer"
                                    style={{ background: 'var(--accent)', color: '#fff' }}>
                                    <Plus size={15} /> 레이어 추가
                                </button>
                            </div>
                        )}

                        {tab === 'permission' && (
                            <div className="flex items-center gap-2">
                                <select value={permission} onChange={e => setPermission(e.target.value)}
                                    className="px-3 py-2 text-sm rounded-lg focus:outline-none cursor-pointer" style={inputStyle}>
                                    {PERMISSION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                                <button onClick={savePermission} disabled={!permDirty || permSaving}
                                    className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg cursor-pointer disabled:opacity-40"
                                    style={{ background: 'var(--accent)', color: '#fff' }}>
                                    <Save size={15} /> {permSaving ? '저장 중...' : '저장'}
                                </button>
                            </div>
                        )}
                    </div>

                    {error && (
                        <div className="px-4 py-3 rounded-lg text-sm flex items-center justify-between"
                            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                            {error} <button onClick={() => setError(null)} className="cursor-pointer"><X size={14} /></button>
                        </div>
                    )}

                    {/* 트리 / 권한 패널 */}
                    <div className="rounded-xl overflow-hidden"
                        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>

                        {tab === 'permission' && (
                            <div className="px-4 py-3 flex items-center gap-2"
                                style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-hover)' }}>
                                <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
                                    체크된 레이어만 해당 권한 사용자에게 표시됩니다.
                                </span>
                                <span className="ml-auto text-xs font-medium" style={{ color: 'var(--accent)' }}>
                                    {permIds.size}개 선택됨
                                </span>
                            </div>
                        )}

                        {loading ? (
                            <div className="flex items-center justify-center py-16">
                                <div className="w-6 h-6 border-2 rounded-full animate-spin"
                                    style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
                            </div>
                        ) : !tree || (tree.groups.length === 0 && tree.ungroupedLayers.length === 0) ? (
                            <div className="flex flex-col items-center justify-center py-16 gap-3">
                                <Layers size={32} style={{ color: 'var(--text-faint)' }} />
                                <p className="text-sm" style={{ color: 'var(--text-faint)' }}>레이어가 없습니다.</p>
                            </div>
                        ) : (
                            <DndContext sensors={sensors} collisionDetection={closestCenter}
                                onDragStart={handleDragStart} onDragEnd={handleDragEnd}>

                                {/* 그룹 트리 */}
                                <SortableContext
                                    items={tree.groups.map(g => `group-${g.id}`)}
                                    strategy={verticalListSortingStrategy}>
                                    {tree.groups.map(group => (
                                        <GroupNode key={group.id} group={group}
                                            permissionIds={tab === 'permission' ? permIds : null}
                                            onTogglePermission={togglePermLayer}
                                            onEditLayer={l => setLayerModal({ mode: 'edit', layer: l })}
                                            onDeleteLayer={l => setDeleteModal({ type: 'layer', item: l })}
                                            onEditGroup={g => setGroupModal({ mode: 'edit', group: g })}
                                            onDeleteGroup={g => setDeleteModal({ type: 'group', item: g })}
                                            onAddLayerToGroup={gid => setLayerModal({ mode: 'create', defaultGroupId: gid })}
                                            onAddGroupToGroup={gid => setGroupModal({ mode: 'create', defaultParentId: gid })} />
                                    ))}
                                </SortableContext>

                                {/* 미분류 레이어 */}
                                {tree.ungroupedLayers.length > 0 && (
                                    <div>
                                        <div className="px-4 py-2 text-xs font-medium"
                                            style={{ background: 'var(--bg-hover)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-faint)' }}>
                                            미분류
                                        </div>
                                        <SortableContext
                                            items={tree.ungroupedLayers.map(l => `layer-${l.id}`)}
                                            strategy={verticalListSortingStrategy}>
                                            {tree.ungroupedLayers.map(layer => (
                                                <LayerRow key={layer.id} layer={layer}
                                                    permissionIds={tab === 'permission' ? permIds : null}
                                                    onTogglePermission={togglePermLayer}
                                                    onEdit={l => setLayerModal({ mode: 'edit', layer: l })}
                                                    onDelete={l => setDeleteModal({ type: 'layer', item: l })} />
                                            ))}
                                        </SortableContext>
                                    </div>
                                )}

                                <DragOverlay>
                                    {activeId && activeId.startsWith('layer-') && (() => {
                                        const id = Number(activeId.replace('layer-', ''))
                                        const l = allLayers.find(x => x.id === id)
                                        return l ? (
                                            <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg"
                                                style={{ background: 'var(--bg-surface)', border: '1px solid var(--accent)', opacity: 0.9 }}>
                                                <GripVertical size={13} style={{ color: 'var(--text-faint)' }} />
                                                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{l.name}</span>
                                                <span className="text-xs px-1.5 py-0.5 rounded font-mono"
                                                    style={{ background: `${TYPE_COLOR[l.type]}22`, color: TYPE_COLOR[l.type] }}>{l.type}</span>
                                            </div>
                                        ) : null
                                    })()}
                                    {activeId && activeId.startsWith('group-') && (() => {
                                        const id = Number(activeId.replace('group-', ''))
                                        const g = allGroups.find(x => x.id === id)
                                        return g ? (
                                            <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg"
                                                style={{ background: 'var(--bg-surface)', border: '1px solid var(--accent)', opacity: 0.9 }}>
                                                <GripVertical size={13} style={{ color: 'var(--text-faint)' }} />
                                                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{g.name}</span>
                                            </div>
                                        ) : null
                                    })()}
                                </DragOverlay>
                            </DndContext>
                        )}
                    </div>
                </main>
            </div>

            {/* 모달 */}
            {layerModal && (
                <LayerModal mode={layerModal.mode}
                    layer={layerModal.mode === 'edit' ? layerModal.layer : undefined}
                    defaultGroupId={layerModal.mode === 'create' ? layerModal.defaultGroupId : undefined}
                    groups={tree?.groups ?? []}
                    onClose={() => setLayerModal(null)}
                    onSaved={() => { setLayerModal(null); loadTree() }} />
            )}
            {groupModal && (
                <GroupModal mode={groupModal.mode}
                    group={groupModal.mode === 'edit' ? groupModal.group : undefined}
                    defaultParentId={groupModal.mode === 'create' ? groupModal.defaultParentId : undefined}
                    allGroups={tree?.groups ?? []}
                    onClose={() => setGroupModal(null)}
                    onSaved={() => { setGroupModal(null); loadTree() }} />
            )}
            {deleteModal && (
                <DeleteModal
                    label={deleteModal.type === 'layer' ? deleteModal.item.name : deleteModal.item.name}
                    onClose={() => setDeleteModal(null)}
                    onConfirm={deleteModal.type === 'layer'
                        ? () => handleDeleteLayer(deleteModal.item as DbLayer)
                        : () => handleDeleteGroup(deleteModal.item as DbLayerGroup)} />
            )}
        </div>
    )
}
