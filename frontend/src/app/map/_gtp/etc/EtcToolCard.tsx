'use client'

// 기타 패널의 도구 카드(아코디언): 아이콘 타일 + 제목 + 한 줄 설명 + 펼침 화살표. 본문은 접어도 마운트해 둔다(입력 중인 값 보존).

import { ChevronDown } from 'lucide-react'
import type { EtcToolDef } from './etcTools'

interface EtcToolCardProps {
    tool: EtcToolDef
    open: boolean
    onToggle: (id: string) => void
}

export default function EtcToolCard({ tool, open, onToggle }: EtcToolCardProps) {
    const Icon = tool.icon
    const headId = `etc-tool-${tool.id}-head`
    const bodyId = `etc-tool-${tool.id}-body`
    return (
        <section
            className={`rounded-lg border bg-(--etc-surface) ${open ? 'border-(--etc-primary-line) shadow-[0_1px_2px_rgba(242,103,34,0.08)]' : 'border-(--etc-border)'}`}
        >
            <h3 className="m-0">
                <button
                    type="button"
                    id={headId}
                    aria-expanded={open}
                    aria-controls={bodyId}
                    onClick={() => onToggle(tool.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-[9px] text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--etc-primary)"
                >
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] bg-(--etc-primary-soft) text-(--etc-primary)">
                        <Icon size={16} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-[12.5px] font-semibold text-(--etc-text)">{tool.title}</span>
                        <span className="mt-px block text-[11px] leading-[1.35] text-(--etc-text-muted)">{tool.description}</span>
                    </span>
                    <ChevronDown
                        size={16}
                        aria-hidden
                        className={`shrink-0 transition-transform ${open ? 'rotate-180 text-(--etc-primary)' : 'text-(--etc-text-faint)'}`}
                    />
                </button>
            </h3>
            <div
                id={bodyId}
                role="region"
                aria-labelledby={headId}
                className={open ? 'flex flex-col gap-2 border-t border-(--etc-border-subtle) p-2.5' : 'hidden'}
            >
                {tool.render()}
            </div>
        </section>
    )
}
