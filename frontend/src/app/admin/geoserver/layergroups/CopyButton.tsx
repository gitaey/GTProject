'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'

interface CopyButtonProps {
    text: string
    /** 단추 글자. 비우면 아이콘만 */
    label?: string
    title?: string
}

/** 클립보드 복사 — 보안 컨텍스트가 아니면(http) navigator.clipboard가 없어 textarea 방식으로 대신한다 */
async function copyText(text: string): Promise<boolean> {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text)
            return true
        }
    } catch {
        // 아래 대체 방식으로
    }
    try {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(ta)
        return ok
    } catch {
        return false
    }
}

/** 눌러서 글자를 복사하고 잠깐 '복사됨'을 보여 주는 작은 단추 */
export default function CopyButton({ text, label, title = '복사' }: CopyButtonProps) {
    const [copied, setCopied] = useState(false)
    const timer = useRef<number | null>(null)

    useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])

    const copy = async () => {
        if (!(await copyText(text))) return
        setCopied(true)
        if (timer.current) window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setCopied(false), 1500)
    }

    return (
        <button type="button" onClick={copy} title={title} aria-label={title}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-sans cursor-pointer"
            style={{ color: copied ? '#10b981' : 'var(--text-muted)' }}>
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? '복사됨' : label}
        </button>
    )
}
