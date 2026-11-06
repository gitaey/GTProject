'use client'

import { CheckCircle2, Folder, Globe, Info, Layers, Pencil } from 'lucide-react'
import Alert from './Alert'
import CopyButton from './CopyButton'
import { MODE_LABEL, formatBounds, type LayerGroupDetail, type LayerGroupUpdateResult } from './types'

interface SaveResultProps {
    /** 만들기 성공 뒤 GeoServer에서 다시 읽은 값(verified=false면 요청값) */
    detail: LayerGroupDetail
    onClearAll: () => void
    onShowList: () => void
}

function Chip({ children }: { children: React.ReactNode }) {
    return (
        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-px rounded-full font-medium whitespace-nowrap"
            style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            {children}
        </span>
    )
}

/** 만들기 성공 카드 — WMS 이름 복사, 소속·방식, 영역·좌표계, 레이어 순서 */
export default function SaveResult({ detail, onClearAll, onShowList }: SaveResultProps) {
    return (
        <div className="rounded-[10px] px-3.5 py-3 flex flex-col gap-2.5 min-w-0"
            style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)' }}>
            <div className="flex items-start gap-2.5 min-w-0">
                <CheckCircle2 size={20} className="shrink-0" style={{ color: '#10b981' }} />
                <div className="flex-1 min-w-0">
                    <b className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>레이어 그룹을 만들었습니다</b>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <span className="inline-flex items-center gap-1.5 rounded-lg pl-2.5 pr-1 py-0.5 font-mono text-[13px] min-w-0"
                            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', overflowWrap: 'anywhere' }}>
                            {detail.wmsName}
                            <CopyButton text={detail.wmsName} label="복사" title="WMS 이름 복사" />
                        </span>
                        <Chip>
                            {detail.workspace ? <><Folder size={12} />작업공간 {detail.workspace}</> : <><Globe size={12} />전역</>}
                        </Chip>
                        <Chip>{detail.mode}{MODE_LABEL[detail.mode] ? ` · ${MODE_LABEL[detail.mode]}` : ''}</Chip>
                        <Chip>레이어 {detail.members.length}개</Chip>
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-2.5 sm:pl-[30px] min-w-0">
                {!detail.verified && (
                    <Alert tone="warn" compact>
                        만들기는 끝났지만 결과를 다시 읽지 못했습니다 — 그룹 목록에서 확인하세요. 아래 값은 보낸 내용입니다.
                    </Alert>
                )}

                <div className="grid gap-x-5 gap-y-2.5 grid-cols-1 sm:grid-cols-3 text-[13px]">
                    <div className="min-w-0 break-words">
                        <span className="block text-[11px] mb-0.5" style={{ color: 'var(--text-faint)' }}>제목</span>
                        {detail.title || <span style={{ color: 'var(--text-faint)' }}>—</span>}
                    </div>
                    <div className="min-w-0">
                        <span className="block text-[11px] mb-0.5" style={{ color: 'var(--text-faint)' }}>영역 (GeoServer 자동 계산)</span>
                        {detail.bounds
                            ? <span className="font-mono text-xs break-words">{formatBounds(detail.bounds)}</span>
                            : <span style={{ color: 'var(--text-faint)' }}>—</span>}
                    </div>
                    <div className="min-w-0">
                        <span className="block text-[11px] mb-0.5" style={{ color: 'var(--text-faint)' }}>좌표계</span>
                        {detail.bounds?.crs ?? <span style={{ color: 'var(--text-faint)' }}>—</span>}
                    </div>
                </div>

                {detail.verified && !detail.bounds && (
                    <Alert tone="warn" compact>
                        GeoServer가 영역을 계산하지 않았습니다. GeoServer 관리 화면에서 그룹을 열어 &quot;영역 생성&quot;을 누르세요.
                    </Alert>
                )}

                <div>
                    <div className="text-[11px] mb-1" style={{ color: 'var(--text-faint)' }}>레이어 순서</div>
                    <ul className="list-none m-0 p-0 rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                        {detail.members.map((m, i) => (
                            <li key={`${i}-${m.name}`} className="flex items-center gap-2 px-2.5 py-1.5 text-xs min-w-0"
                                style={{ borderBottom: i < detail.members.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                                <span className="w-4 shrink-0" style={{ color: 'var(--text-faint)' }}>{i + 1}</span>
                                <span className="flex-1 min-w-0 font-mono" style={{ overflowWrap: 'anywhere' }}>{m.name}</span>
                                <span style={{ color: m.style ? 'var(--text-muted)' : 'var(--text-faint)' }}>{m.style ?? '기본 스타일'}</span>
                            </li>
                        ))}
                    </ul>
                    <div className="text-[11px] mt-1" style={{ color: 'var(--text-faint)' }}>1번이 가장 먼저 그려져 지도에서 맨 아래에 깔립니다.</div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={onClearAll}
                        className="px-2.5 py-1 text-xs rounded-lg cursor-pointer"
                        style={{ border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-secondary)' }}>
                        입력 모두 비우기
                    </button>
                    <button type="button" onClick={onShowList}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg cursor-pointer"
                        style={{ border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-secondary)' }}>
                        <Layers size={12} />
                        그룹 목록에서 보기
                    </button>
                    <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                        이름 칸만 비웠습니다 — 고른 레이어로 하나 더 만들 수 있습니다.
                    </span>
                </div>
            </div>
        </div>
    )
}

interface UpdateSavedProps {
    res: LayerGroupUpdateResult
    /** 저장하는 순간의 변경 요약(diff.ts summaryParts) */
    parts: string[]
    /** 편집을 시작할 때의 영역 좌표계 — 좌표계가 바뀌었다고 알릴 때 쓴다 */
    previousCrs: string | null
    onShowList: () => void
    /** 저장된 내용(새 revision)으로 다시 채워 계속 수정 */
    onContinue: () => void
}

function NoteRow({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex items-start gap-2 text-xs rounded-lg px-2.5 py-2"
            style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            <Info size={14} className="shrink-0 mt-px" />
            <span>{children}</span>
        </div>
    )
}

/** 영역 처리 결과 한 줄 — KEPT·RECALCULATED(+좌표계 바뀜)·STALE */
function BoundsNote({ res, previousCrs }: { res: LayerGroupUpdateResult; previousCrs: string | null }) {
    const bounds = res.group.bounds
    const crs = bounds?.crs ?? '좌표계 모름'
    if (res.boundsAction === 'KEPT') {
        return <NoteRow><b className="font-medium">영역 그대로</b> — 레이어 구성이 그대로라(순서·제목 등만 바뀜) 영역은 바꾸지 않았습니다.</NoteRow>
    }
    if (res.boundsAction === 'STALE') {
        return (
            <Alert tone="warn" compact title="영역을 다시 계산하지 못했습니다(저장은 됨)">
                {res.boundsNote ?? '원래 영역을 그대로 두었습니다.'}{' '}
                GeoServer 관리 화면에서 그룹을 열어 &quot;영역 생성&quot;을 누르세요.
            </Alert>
        )
    }
    const boundsText = bounds ? <span className="block font-mono text-xs break-words">{formatBounds(bounds)}</span> : null
    if (res.boundsCrsChanged) {
        return (
            <Alert tone="warn" compact title={`영역을 다시 계산했고, 좌표계가 ${previousCrs ?? '이전 좌표계'} → ${crs}(으)로 바뀌었습니다`}>
                넣은 레이어의 좌표계가 서로 달라 경위도로 합쳤습니다. WMS는 그대로 쓸 수 있습니다.
                {res.boundsNote && <span className="block">{res.boundsNote}</span>}
                {boundsText}
            </Alert>
        )
    }
    return (
        <Alert tone="ok" compact title={`영역을 다시 계산했습니다 (${crs})`}>
            {res.boundsNote && <span className="block">{res.boundsNote}</span>}
            {boundsText}
        </Alert>
    )
}

/** 수정 저장 결과 카드 — 변경 요약, 영역 처리 결과, 타일 캐시 안내, [목록으로] [계속 수정] */
export function UpdateSaved({ res, parts, previousCrs, onShowList, onContinue }: UpdateSavedProps) {
    const g = res.group
    return (
        <div className="rounded-[10px] px-3.5 py-3 flex flex-col gap-2.5 min-w-0"
            style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)' }}>
            <div className="flex items-start gap-2.5 min-w-0">
                <CheckCircle2 size={20} className="shrink-0" style={{ color: '#10b981' }} />
                <div className="flex-1 min-w-0">
                    <b className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {res.changed ? '변경을 저장했습니다' : '바뀐 것이 없어 저장하지 않았습니다'} —{' '}
                        <span className="font-mono" style={{ overflowWrap: 'anywhere' }}>{g.wmsName}</span>
                    </b>
                    {res.changed && (
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                            {parts.map(p => (
                                <span key={p} className="inline-flex items-center text-[11px] px-2 py-px rounded-full font-medium whitespace-nowrap"
                                    style={p.startsWith('추가')
                                        ? { background: 'var(--accent-bg)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }
                                        : { background: 'var(--bg-hover)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                                    {p}
                                </span>
                            ))}
                            <Chip>레이어 {g.members.length}개</Chip>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex flex-col gap-2 sm:pl-[30px] min-w-0">
                {!g.verified && (
                    <Alert tone="warn" compact>
                        저장은 끝났지만 결과를 다시 읽지 못했습니다 — 그룹 목록에서 확인하세요.
                    </Alert>
                )}
                {res.changed && <BoundsNote res={res} previousCrs={previousCrs} />}
                {!res.changed && <NoteRow>바뀐 것이 없어 GeoServer에 보내지 않았습니다.</NoteRow>}
                {res.changed && (
                    <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                        GeoWebCache 타일을 쓰고 있다면 이 그룹의 타일 캐시를 비워야 새 그림이 보일 수 있습니다.
                    </div>
                )}
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <button type="button" onClick={onShowList}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg cursor-pointer"
                        style={{ border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-secondary)' }}>
                        <Layers size={12} />
                        목록으로
                    </button>
                    <button type="button" onClick={onContinue}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg cursor-pointer"
                        style={{ border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-secondary)' }}>
                        <Pencil size={12} />
                        계속 수정
                    </button>
                </div>
            </div>
        </div>
    )
}
