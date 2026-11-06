'use client'

import { useState, type Ref } from 'react'
import { Eye, EyeOff } from 'lucide-react'

interface PasswordFieldProps {
    value: string
    onChange: (value: string) => void
    onEnter?: () => void
    inputRef?: Ref<HTMLInputElement>
    disabled?: boolean
    autoFocus?: boolean
}

/** 비밀번호 입력 — 값은 부모 state에만 있다(저장·로그 없음). 브라우저 자동 저장·자동 채움을 끈다 */
export default function PasswordField({ value, onChange, onEnter, inputRef, disabled, autoFocus }: PasswordFieldProps) {
    const [visible, setVisible] = useState(false)
    return (
        <div className="relative">
            <input
                ref={inputRef}
                type={visible ? 'text' : 'password'}
                value={value}
                onChange={e => onChange(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && onEnter) onEnter() }}
                disabled={disabled}
                autoFocus={autoFocus}
                autoComplete="new-password"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="비밀번호"
                className="w-full text-sm px-3 py-2 pr-9 rounded-lg outline-none disabled:opacity-50"
                style={{ background: 'var(--bg-page)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
            <button type="button" onClick={() => setVisible(v => !v)} tabIndex={-1}
                aria-label={visible ? '비밀번호 숨기기' : '비밀번호 보기'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer"
                style={{ color: 'var(--text-faint)' }}>
                {visible ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
        </div>
    )
}
