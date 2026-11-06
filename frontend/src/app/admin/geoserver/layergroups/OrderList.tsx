'use client'

import {
    DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors,
    type DragEndEvent,
} from '@dnd-kit/core'
import {
    SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDown, ArrowUp, GripVertical, Layers, Undo2, X } from 'lucide-react'
import Alert from './Alert'
import { splitQualified } from './types'

/** 순서 목록의 한 줄. 만들기에서는 id = 'ws:layer'(중복 불가). 수정 모드는 같은 레이어가 두 번 있을 수 있어 id를 따로 준다 */
export interface OrderItem {
    id: string
    type: 'layer' | 'layerGroup'
    /** 'ws:layer' */
    name: string
    /** 수정 모드의 원래 멤버만: null = 기본 스타일. undefined = 스타일 표시 안 함 */
    style?: string | null
    /** 수정 모드에서 새로 넣은 레이어 */
    isNew?: boolean
}

interface OrderListProps {
    items: OrderItem[]
    /** 422 뒤 서버에 없다고 확인된 줄 id */
    missingIds: ReadonlySet<string>
    /** 소속 규칙 위반(다른 작업공간)인 줄 id */
    otherWorkspaceIds: ReadonlySet<string>
    onReorder: (next: OrderItem[]) => void
    onMove: (id: string, delta: -1 | 1) => void
    onRemove: (id: string) => void
    onRemoveMissing: () => void
    /** 수정 모드에서 뺀 원래 멤버 이름(되돌리기용) */
    removedNames?: string[]
    onRestoreRemoved?: () => void
    disabled?: boolean
}

interface RowProps {
    item: OrderItem
    index: number
    count: number
    missing: boolean
    otherWorkspace: boolean
    disabled: boolean
    onMove: (id: string, delta: -1 | 1) => void
    onRemove: (id: string) => void
}

function Chip({ tone, children }: { tone: 'err' | 'warn' | 'new' | 'gray'; children: React.ReactNode }) {
    const styles: Record<string, React.CSSProperties> = {
        err: { background: 'rgba(239,68,68,0.08)', color: '#ef4444' },
        warn: { background: 'rgba(245,158,11,0.1)', color: '#b45309' },
        new: { background: 'var(--accent-bg)', color: 'var(--accent)', border: '1px solid var(--accent-border)' },
        gray: { background: 'var(--bg-hover)', color: 'var(--text-faint)', border: '1px solid var(--border)' },
    }
    return (
        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-px rounded-full font-medium whitespace-nowrap align-middle"
            style={styles[tone]}>
            {children}
        </span>
    )
}

function Row({ item, index, count, missing, otherWorkspace, disabled, onMove, onRemove }: RowProps) {
    const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
        useSortable({ id: item.id, disabled })
    const [ws, layer] = splitQualified(item.name)
    const bad = missing || otherWorkspace
    const btn = 'flex items-center justify-center w-8 h-8 sm:w-7 sm:h-7 rounded-md cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed'
    return (
        <li ref={setNodeRef}
            className="flex items-center gap-2 py-1.5 pl-1 pr-1.5 rounded-lg text-[13px] min-w-0"
            style={{
                transform: CSS.Transform.toString(transform),
                transition,
                zIndex: isDragging ? 5 : undefined,
                position: 'relative',
                background: isDragging ? 'var(--bg-active)' : bad ? 'rgba(239,68,68,0.08)' : 'var(--bg-surface)',
                border: `1px solid ${isDragging ? 'var(--accent)' : bad ? 'rgba(239,68,68,0.25)' : 'var(--border)'}`,
                boxShadow: isDragging ? '0 8px 20px rgba(0,0,0,0.18)' : undefined,
            }}>
            <button type="button" ref={setActivatorNodeRef} disabled={disabled} aria-label={`${item.name} 끌어서 순서 바꾸기`} title="끌어서 옮기기"
                {...attributes} {...listeners}
                className="flex p-1 shrink-0 cursor-grab disabled:cursor-not-allowed"
                style={{ color: 'var(--text-faint)', touchAction: 'none', background: 'transparent' }}>
                <GripVertical size={14} />
            </button>
            <span title={`그리는 순서 ${index + 1}`}
                className="w-[22px] h-[22px] rounded-md text-[11px] flex items-center justify-center shrink-0"
                style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                {index + 1}
            </span>
            <span className="flex-1 min-w-0 font-mono leading-snug" style={{ overflowWrap: 'anywhere', color: 'var(--text-primary)' }}>
                {ws && <span style={{ color: 'var(--text-faint)' }}>{ws}:</span>}
                {layer}{' '}
                {missing && <Chip tone="err">서버에 없음</Chip>}
                {!missing && otherWorkspace && <Chip tone="warn">다른 작업공간</Chip>}
                {!bad && item.isNew && <Chip tone="new">새로</Chip>}
                {!bad && item.type === 'layerGroup' && <Chip tone="gray"><Layers size={12} />그룹</Chip>}
                {item.style !== undefined && (
                    <span className="block text-[11px] font-sans" style={{ color: 'var(--text-faint)' }}>
                        {item.style ? `스타일 ${item.style}` : '기본 스타일'}
                    </span>
                )}
            </span>
            <span className="flex shrink-0">
                <button type="button" disabled={disabled || index === 0} onClick={() => onMove(item.id, -1)}
                    title="위로(더 먼저 그림)" aria-label={`${item.name} 위로`} className={btn} style={{ color: 'var(--text-muted)' }}>
                    <ArrowUp size={14} />
                </button>
                <button type="button" disabled={disabled || index === count - 1} onClick={() => onMove(item.id, 1)}
                    title="아래로(더 나중에 그림)" aria-label={`${item.name} 아래로`} className={btn} style={{ color: 'var(--text-muted)' }}>
                    <ArrowDown size={14} />
                </button>
                <button type="button" disabled={disabled} onClick={() => onRemove(item.id)}
                    title="빼기" aria-label={`${item.name} 빼기`} className={btn} style={{ color: 'var(--text-muted)' }}>
                    <X size={14} />
                </button>
            </span>
        </li>
    )
}

/**
 * 그룹 순서 목록. 순서 방향은 GeoServer 관리 화면과 같다(D2) — 맨 위 줄(1번) = 가장 먼저 그림 = 지도에서 맨 아래,
 * 맨 아래 줄 = 지도에서 맨 위. 화면 순서 = API 배열 순서이고 어디서도 뒤집지 않는다.
 */
export default function OrderList({
    items, missingIds, otherWorkspaceIds, onReorder, onMove, onRemove, onRemoveMissing,
    removedNames, onRestoreRemoved, disabled = false,
}: OrderListProps) {
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    )

    const handleDragEnd = (e: DragEndEvent) => {
        const { active, over } = e
        if (!over || active.id === over.id) return
        const from = items.findIndex(i => i.id === active.id)
        const to = items.findIndex(i => i.id === over.id)
        if (from < 0 || to < 0) return
        onReorder(arrayMove(items, from, to))
    }

    const missingCount = items.filter(i => missingIds.has(i.id)).length

    return (
        <div className="rounded-[10px] overflow-hidden min-w-0" style={{ border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
            <div className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs"
                style={{ background: 'var(--bg-hover)', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                <span><b className="font-medium">그룹 순서</b> <span style={{ color: 'var(--text-faint)' }}>({items.length})</span></span>
                {missingCount > 0 ? (
                    <button type="button" onClick={onRemoveMissing} disabled={disabled}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg cursor-pointer disabled:opacity-50"
                        style={{ border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444' }}>
                        <X size={12} />
                        없는 레이어 빼기
                    </button>
                ) : (
                    <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>GeoServer 관리 화면과 같은 순서</span>
                )}
            </div>

            {items.length === 0 ? (
                <div className="px-3 py-7 text-center text-[13px]" style={{ color: 'var(--text-faint)' }}>
                    왼쪽에서 레이어를 고르세요.
                    <div className="text-[11px] mt-1">고른 레이어는 목록 맨 아래(지도에서 맨 위)에 붙습니다.</div>
                </div>
            ) : (
                <>
                    <div className="flex items-center justify-center gap-1.5 text-[11px] px-2.5 py-1.5"
                        style={{ color: 'var(--text-muted)', background: 'var(--bg-hover)', borderBottom: '1px solid var(--border-subtle)' }}>
                        <ArrowUp size={12} />
                        먼저 그림 — 지도에서 맨 아래에 깔림
                    </div>
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                            <ul className="list-none m-0 p-1.5 flex flex-col gap-1.5 min-h-[120px]">
                                {items.map((item, index) => (
                                    <Row key={item.id} item={item} index={index} count={items.length}
                                        missing={missingIds.has(item.id)} otherWorkspace={otherWorkspaceIds.has(item.id)}
                                        disabled={disabled} onMove={onMove} onRemove={onRemove} />
                                ))}
                            </ul>
                        </SortableContext>
                    </DndContext>
                    <div className="flex items-center justify-center gap-1.5 text-[11px] px-2.5 py-1.5"
                        style={{ color: 'var(--accent)', background: 'var(--accent-bg)', borderTop: '1px solid var(--border-subtle)' }}>
                        <ArrowDown size={12} />
                        나중에 그림 — 지도에서 맨 위에 보임
                    </div>
                </>
            )}

            {items.length === 1 && (
                <div className="p-2.5"><Alert tone="warn" compact>레이어가 1개인 그룹은 다른 이름으로 내보내는 용도입니다.</Alert></div>
            )}

            {removedNames && removedNames.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs"
                    style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                    <span>뺀 레이어 {removedNames.length}개: <span className="font-mono break-all">{removedNames.join(', ')}</span></span>
                    {onRestoreRemoved && (
                        <button type="button" onClick={onRestoreRemoved} disabled={disabled}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 cursor-pointer disabled:opacity-50"
                            style={{ color: 'var(--text-muted)' }}>
                            <Undo2 size={12} />
                            되돌리기
                        </button>
                    )}
                </div>
            )}

            <div className="px-3 pt-2 pb-2.5 text-[11px] leading-relaxed" style={{ color: 'var(--text-faint)' }}>
                위에서부터 차례로 그립니다. 맨 아래 줄 레이어가 지도에서 가장 위에 보입니다. 새로 고른 레이어는 맨 아래(지도에서 맨 위)에 붙습니다.
            </div>
        </div>
    )
}
