'use client'

import { Folder, Globe } from 'lucide-react'
import Alert from './Alert'
import { MAX_DESCRIPTION, MAX_TITLE, wmsName, type LayerGroupMode } from './types'

export type GroupScope = 'workspace' | 'global'

export interface GroupFormValue {
    name: string
    title: string
    description: string
    scope: GroupScope
    mode: LayerGroupMode
}

interface GroupFormProps {
    value: GroupFormValue
    onChange: (patch: Partial<GroupFormValue>) => void
    /** 소속이 '작업공간'일 때의 작업공간(레이어를 고르는 작업공간과 같다). 없으면 빈 문자열 */
    workspace: string
    /** 이름 규칙·이미 있는 이름 — 빨간 문구, 단추 비활성 */
    nameProblem: string | null
    /** 서버(409)가 알려 준 이름 중복 — 빨간 테두리 + 문구 */
    nameServerError: string | null
    /** 막지는 않는 경고(레이어와 같은 이름) */
    nameWarning: string | null
    disabled?: boolean
}

export const inputStyle: React.CSSProperties = {
    background: 'var(--bg-page)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    borderRadius: '8px',
    padding: '8px 12px',
    fontSize: '14px',
    width: '100%',
    outline: 'none',
}

export const MODES: { id: LayerGroupMode; title: string; desc: string; recommended?: boolean }[] = [
    { id: 'SINGLE', title: '단일 레이어', desc: '그룹이 레이어 하나처럼 보입니다. 안의 레이어도 따로 계속 쓸 수 있습니다.', recommended: true },
    { id: 'NAMED', title: '이름 있는 트리', desc: '그룹 이름으로 한 장 요청 + 능력 문서에 안의 레이어가 하위로 보입니다.' },
]

export function OptionCard({ checked, onSelect, disabled, name, children }: {
    checked: boolean
    onSelect: () => void
    disabled: boolean
    name: string
    children: React.ReactNode
}) {
    return (
        <label className={`flex items-start gap-2.5 rounded-[10px] px-3 py-2.5 min-w-0 flex-[1_1_200px] ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
            style={{
                border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
                background: checked ? 'var(--accent-bg)' : 'var(--bg-page)',
            }}>
            <input type="radio" name={name} checked={checked} onChange={onSelect} disabled={disabled}
                className="mt-0.5 shrink-0" style={{ accentColor: 'var(--accent)' }} />
            <div className="min-w-0">{children}</div>
        </label>
    )
}

/** 만들기 폼 — 이름(필수)·제목·설명·소속·방식. 영역(bounds)은 GeoServer가 자동 계산한다 */
export default function GroupForm({
    value, onChange, workspace, nameProblem, nameServerError, nameWarning, disabled = false,
}: GroupFormProps) {
    const nameMessage = nameServerError ?? nameProblem
    const wsForPreview = value.scope === 'workspace' ? workspace : ''
    return (
        <div>
            <div className="grid gap-x-4 grid-cols-1 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5 mb-3.5 min-w-0">
                    <label htmlFor="lg-name" className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                        그룹 이름<span style={{ color: 'var(--accent)' }} className="ml-0.5">*</span>
                    </label>
                    <input id="lg-name" value={value.name} onChange={e => onChange({ name: e.target.value })}
                        disabled={disabled} placeholder="예: sejong_base" maxLength={120} autoComplete="off" spellCheck={false}
                        aria-invalid={!!nameMessage}
                        className="font-mono"
                        style={{
                            ...inputStyle, fontSize: '13px',
                            borderColor: nameMessage ? '#ef4444' : 'var(--border)',
                            boxShadow: nameMessage ? '0 0 0 3px rgba(239,68,68,0.08)' : undefined,
                        }} />
                    {nameMessage
                        ? <div className="text-[11px] leading-relaxed" style={{ color: '#ef4444' }}>{nameMessage}</div>
                        : <div className="text-[11px] leading-relaxed" style={{ color: 'var(--text-faint)' }}>
                            영문으로 시작, 영문·숫자·_·- (점·한글·공백 불가, 최대 100자)
                        </div>}
                    {nameWarning && <div className="text-[11px] leading-relaxed" style={{ color: '#b45309' }}>{nameWarning}</div>}
                    {value.name && !nameProblem && (
                        <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                            WMS 이름: <span className="font-mono break-all" style={{ color: 'var(--text-primary)' }}>
                                {wmsName(wsForPreview || null, value.name)}
                            </span>
                        </div>
                    )}
                </div>

                <div className="flex flex-col gap-1.5 mb-3.5 min-w-0">
                    <label htmlFor="lg-title" className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                        제목 <span className="font-normal" style={{ color: 'var(--text-faint)' }}>(선택)</span>
                    </label>
                    <input id="lg-title" value={value.title} onChange={e => onChange({ title: e.target.value })}
                        disabled={disabled} placeholder="비우면 이름과 같음" maxLength={MAX_TITLE} style={inputStyle} />
                    <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>능력 문서·QGIS 목록에 보이는 이름. 한글 가능</div>
                </div>
            </div>

            <div className="flex flex-col gap-1.5 mb-3.5">
                <label htmlFor="lg-desc" className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    설명 <span className="font-normal" style={{ color: 'var(--text-faint)' }}>(선택)</span>
                </label>
                <textarea id="lg-desc" value={value.description} onChange={e => onChange({ description: e.target.value })}
                    disabled={disabled} placeholder="GeoServer abstract 칸" maxLength={MAX_DESCRIPTION} rows={2}
                    style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
            </div>

            <fieldset className="m-0 mb-3.5 p-0 border-0 min-w-0">
                <legend className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>소속</legend>
                <div className="flex flex-wrap gap-2">
                    <OptionCard name="lg-scope" checked={value.scope === 'workspace'} disabled={disabled}
                        onSelect={() => onChange({ scope: 'workspace' })}>
                        <b className="flex items-center gap-1.5 text-[13px] font-medium">
                            <Folder size={14} />작업공간{workspace ? `(${workspace})` : ''} 소속
                        </b>
                        <span className="block text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                            그 작업공간 레이어만 넣을 수 있음. WMS 이름 <span className="font-mono">{workspace || '작업공간'}:이름</span>
                        </span>
                    </OptionCard>
                    <OptionCard name="lg-scope" checked={value.scope === 'global'} disabled={disabled}
                        onSelect={() => onChange({ scope: 'global' })}>
                        <b className="flex items-center gap-1.5 text-[13px] font-medium"><Globe size={14} />전역</b>
                        <span className="block text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                            여러 작업공간 레이어를 섞을 수 있음. WMS 이름 <span className="font-mono">이름</span>
                        </span>
                    </OptionCard>
                </div>
            </fieldset>

            <fieldset className="m-0 mb-3.5 p-0 border-0 min-w-0">
                <legend className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>그리기 방식</legend>
                <div className="flex flex-wrap gap-2">
                    {MODES.map(m => (
                        <OptionCard key={m.id} name="lg-mode" checked={value.mode === m.id} disabled={disabled}
                            onSelect={() => onChange({ mode: m.id })}>
                            <b className="text-[13px] font-medium">
                                {m.title} <span className="font-mono text-[11px] font-normal" style={{ color: 'var(--text-faint)' }}>{m.id}</span>
                                {m.recommended && (
                                    <span className="ml-1.5 text-[11px] px-2 py-px rounded-full font-medium"
                                        style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>추천</span>
                                )}
                            </b>
                            <span className="block text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{m.desc}</span>
                        </OptionCard>
                    ))}
                </div>
            </fieldset>

            <Alert tone="info">
                <span className="text-xs">
                    영역(bounds)·좌표계는 GeoServer가 고른 레이어로 <b>자동 계산</b>합니다(첫 레이어 좌표계 기준).
                    레이어별 스타일은 각 레이어의 기본 스타일을 씁니다. 만든 뒤 결과에서 확인하세요.
                </span>
            </Alert>
        </div>
    )
}
