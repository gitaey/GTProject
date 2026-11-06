'use client'

import { Folder, Globe, Lock } from 'lucide-react'
import Alert from './Alert'
import { MODES, OptionCard, inputStyle } from './GroupForm'
import { MAX_DESCRIPTION, MAX_TITLE, MODE_LABEL } from './types'

export interface GroupEditValue {
    title: string
    description: string
    /** SINGLE·NAMED, 또는 원래 값(OPAQUE_CONTAINER·CONTAINER) 그대로 */
    mode: string
}

interface GroupEditFormProps {
    /** 접두사 없는 그룹 이름(읽기 전용) */
    name: string
    /** null = 전역(읽기 전용) */
    workspace: string | null
    /** 편집을 시작할 때의 방식 — SINGLE·NAMED가 아니면 "현재 방식 그대로" 카드를 보여 준다 */
    originalMode: string
    value: GroupEditValue
    onChange: (patch: Partial<GroupEditValue>) => void
}

/** 수정 폼 — 이름·소속은 읽기 전용(GeoServer가 바꾸지 못하게 함), 제목·설명·방식만 고친다 */
export default function GroupEditForm({ name, workspace, originalMode, value, onChange }: GroupEditFormProps) {
    const keepOriginal = originalMode !== 'SINGLE' && originalMode !== 'NAMED'
    return (
        <div>
            <div className="grid gap-x-4 grid-cols-1 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5 mb-3.5 min-w-0">
                    <span className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                        그룹 이름 · 소속 <Lock size={12} style={{ color: 'var(--text-faint)' }} />
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[13px] rounded-lg px-3 py-2 min-w-0"
                            style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>
                            {workspace ? `${workspace}:${name}` : name}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-px rounded-full font-medium whitespace-nowrap"
                            style={{ background: 'var(--bg-hover)', color: 'var(--text-faint)', border: '1px solid var(--border)' }}>
                            {workspace ? <><Folder size={12} />작업공간 {workspace}</> : <><Globe size={12} />전역</>}
                        </span>
                    </div>
                    <div className="text-[11px] leading-relaxed" style={{ color: 'var(--text-faint)' }}>
                        이름·소속은 GeoServer가 바꾸지 못하게 합니다. 바꾸려면 새로 만들고 이 그룹을 삭제하세요.
                    </div>
                </div>

                <div className="flex flex-col gap-1.5 mb-3.5 min-w-0">
                    <label htmlFor="lg-edit-title" className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                        제목 <span className="font-normal" style={{ color: 'var(--text-faint)' }}>(선택)</span>
                    </label>
                    <input id="lg-edit-title" value={value.title} onChange={e => onChange({ title: e.target.value })}
                        placeholder="비우면 이름과 같음" maxLength={MAX_TITLE} style={inputStyle} />
                    <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>한글 가능</div>
                </div>
            </div>

            <div className="flex flex-col gap-1.5 mb-3.5">
                <label htmlFor="lg-edit-desc" className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    설명 <span className="font-normal" style={{ color: 'var(--text-faint)' }}>(선택)</span>
                </label>
                <textarea id="lg-edit-desc" value={value.description} onChange={e => onChange({ description: e.target.value })}
                    placeholder="GeoServer abstract 칸" maxLength={MAX_DESCRIPTION} rows={2}
                    style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
            </div>

            <fieldset className="m-0 mb-3.5 p-0 border-0 min-w-0">
                <legend className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>그리기 방식</legend>
                <div className="flex flex-wrap gap-2">
                    {keepOriginal && (
                        <OptionCard name="lg-edit-mode" checked={value.mode === originalMode} disabled={false}
                            onSelect={() => onChange({ mode: originalMode })}>
                            <b className="text-[13px] font-medium">
                                현재 방식 그대로 <span className="font-mono text-[11px] font-normal" style={{ color: 'var(--text-faint)' }}>{originalMode}</span>
                            </b>
                            <span className="block text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                                {MODE_LABEL[originalMode] ?? '다른 도구에서 정한 방식'}. 이 도구에서는 이 방식으로 새로 바꿀 수 없고, 아래 두 가지로만 바꿀 수 있습니다.
                            </span>
                        </OptionCard>
                    )}
                    {MODES.map(m => (
                        <OptionCard key={m.id} name="lg-edit-mode" checked={value.mode === m.id} disabled={false}
                            onSelect={() => onChange({ mode: m.id })}>
                            <b className="text-[13px] font-medium">
                                {m.title} <span className="font-mono text-[11px] font-normal" style={{ color: 'var(--text-faint)' }}>{m.id}</span>
                            </b>
                            <span className="block text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{m.desc}</span>
                        </OptionCard>
                    ))}
                </div>
            </fieldset>

            <Alert tone="info">
                <span className="text-xs">
                    레이어 구성(무엇이 들었는지)이 바뀌면 영역을 <b>다시 계산</b>합니다(레이어마다 GeoServer 2번 조회).
                    순서·제목·방식만 바꾸면 영역은 그대로입니다. 원래 있던 레이어의 스타일은 그대로 둡니다.
                </span>
            </Alert>
        </div>
    )
}
