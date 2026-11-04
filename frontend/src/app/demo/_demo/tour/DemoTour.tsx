'use client'

// 가이드 투어 패널 — 데스크톱은 지도 왼쪽 열, 모바일(768px 미만)은 지도 아래 시트(접으면 한 줄 막대).
// 지도를 가리지 않는 "배치"라서(겹쳐 올리지 않는다) 지도 위젯(z-index 10~50, 모달은 gm-root 포털 1000)과 쌓임 순서가 부딪히지 않는다.
// 진행을 강제하지 않는다 — 목록에서 아무 단계나 누를 수 있고 "해 보기"는 선택이다. 단계 글·동작·강조 선택자는 steps.ts 한 곳.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, ChevronUp, Compass, ExternalLink, Play, X } from 'lucide-react'
import { useGisMap } from '@gtp/gis-map/react'
import { TOUR_TAG_LABEL } from './steps'
import type { TourContext, TourPanel, TourStep } from './steps'

export interface DemoTourProps {
    steps: readonly TourStep[]
    index: number
    onIndexChange: (index: number) => void
    open: boolean
    onOpenChange: (open: boolean) => void
    mobile: boolean
    openPanel: (panel: TourPanel | null) => void
    center: readonly [number, number]
    bigLayerId: number
}

function cx(...parts: Array<string | false | null | undefined>): string {
    return parts.filter(Boolean).join(' ')
}

function focusSelector(selector: string): void {
    const el = document.querySelector(selector)
    if (el instanceof HTMLElement) el.focus()
}

/** 강조 규칙(현재 단계 한 개): `.demo-root` 안의 선택자에 안쪽 이중 테두리. 배경은 건드리지 않는다(켜진 단추의 흰 아이콘이 안 사라지게) */
export function highlightCss(selectors: readonly string[] | undefined): string | null {
    if (!selectors || selectors.length === 0) return null
    return selectors.map(s => '.demo-root ' + s).join(',\n') + ' { box-shadow: inset 0 0 0 2px #F26722, inset 0 0 0 4px #fff !important; }'
}

export default function DemoTour({ steps, index, onIndexChange, open, onOpenChange, mobile, openPanel, center, bigLayerId }: DemoTourProps) {
    const map = useGisMap()
    const step = steps[index]
    const [visited, setVisited] = useState<readonly number[]>([])
    const [busy, setBusy] = useState(false)
    const [message, setMessage] = useState<string | null>(null)
    const curRef = useRef<HTMLLIElement | null>(null)

    // 최신 값을 effect 정리에서 쓰려고 ref에 둔다(매 렌더 갱신)
    const ctxRef = useRef<TourContext | null>(null)
    ctxRef.current = map ? { map, openPanel, focus: focusSelector, center, bigLayerId } : null

    useEffect(() => {
        setVisited(v => (v.includes(index) ? v : [...v, index]))
        setMessage(null)
        const leaving = steps[index]
        return () => {
            const ctx = ctxRef.current
            if (!ctx || !leaving.onLeave) return
            try {
                leaving.onLeave(ctx)
            } catch (err) {
                console.warn('[demo-tour] 단계 정리 중 오류', err)
            }
        }
    }, [index, steps])

    useEffect(() => {
        curRef.current?.scrollIntoView?.({ block: 'nearest' })
    }, [index, open])

    const run = useCallback(async () => {
        const ctx = ctxRef.current
        if (!ctx || !step.action || busy) return
        setBusy(true)
        setMessage(null)
        try {
            await step.action.run(ctx)
            // 모바일은 시트가 지도를 가리므로 해 보기 뒤 접어서 결과가 보이게 한다
            if (mobile) onOpenChange(false)
        } catch (err) {
            setMessage('실행하지 못했습니다: ' + (err instanceof Error ? err.message : String(err)))
        } finally {
            setBusy(false)
        }
    }, [step, busy, mobile, onOpenChange])

    const css = highlightCss(step.highlight)
    const total = steps.length
    const blocked = step.desktopOnly === true && mobile

    return (
        <>
            {css && <style data-demo-highlight={step.id}>{css}</style>}
            <aside className={cx('demo-tour', !open && 'demo-tour--collapsed')} aria-label="가이드 투어">
                <button type="button" className="demo-tour__bar" onClick={() => onOpenChange(true)} aria-expanded={open}>
                    <Compass size={14} aria-hidden="true" />
                    <span className="demo-tour__bar-text">가이드 {index + 1}/{total} · {step.title}</span>
                    <ChevronUp size={14} aria-hidden="true" />
                </button>
                <div className="demo-tour__panel">
                    <div className="demo-tour__head">
                        <b>가이드 투어</b>
                        <span className="demo-tour__count">{index + 1} / {total}</span>
                        <button type="button" className="demo-tour__close" aria-label="가이드 접기" onClick={() => onOpenChange(false)}>
                            <X size={14} aria-hidden="true" />
                        </button>
                    </div>
                    <div className="demo-tour__prog" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={index + 1}>
                        <i style={{ width: ((index + 1) / total) * 100 + '%' }} />
                    </div>
                    <ol className="demo-tour__list">
                        {steps.map((s, i) => {
                            const cur = i === index
                            const done = !cur && visited.includes(i)
                            return (
                                <li key={s.id} data-step={s.id} ref={cur ? curRef : undefined}
                                    className={cx('demo-step', cur && 'demo-step--cur', done && 'demo-step--done')}>
                                    <button type="button" className="demo-step__head" aria-current={cur ? 'step' : undefined}
                                        onClick={() => onIndexChange(i)}>
                                        <span className="demo-step__n">{done ? <Check size={11} aria-hidden="true" /> : i + 1}</span>
                                        <span className="demo-step__title">{s.title}</span>
                                    </button>
                                    {cur && (
                                        <div className="demo-step__body">
                                            <p className="demo-step__text">{s.body}</p>
                                            <div className="demo-step__tags">
                                                {s.tags.map(t => <span key={t} className={cx('demo-tag', 'demo-tag--' + t)}>{TOUR_TAG_LABEL[t]}</span>)}
                                            </div>
                                            {blocked && <p className="demo-step__note">패널 안 조작이라 화면 폭 768px 이상(태블릿·PC)에서 체험할 수 있습니다.</p>}
                                            {(s.action || s.links) && (
                                                <div className="demo-step__acts">
                                                    {s.action && (
                                                        <button type="button" className="demo-btn demo-btn--pri" onClick={run} disabled={busy || blocked}>
                                                            <Play size={12} aria-hidden="true" />
                                                            {busy ? '진행 중…' : '해 보기: ' + s.action.label}
                                                        </button>
                                                    )}
                                                    {s.links?.map(l => (
                                                        <a key={l.href} className="demo-btn" href={l.href}
                                                            {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                                                            {l.label}
                                                            {l.external && <ExternalLink size={12} aria-hidden="true" />}
                                                        </a>
                                                    ))}
                                                </div>
                                            )}
                                            {message && <p className="demo-step__msg" role="status">{message}</p>}
                                        </div>
                                    )}
                                </li>
                            )
                        })}
                    </ol>
                    <div className="demo-tour__foot">
                        <button type="button" className="demo-btn" disabled={index <= 0} onClick={() => onIndexChange(index - 1)}>
                            <ChevronLeft size={12} aria-hidden="true" />이전
                        </button>
                        <button type="button" className="demo-btn demo-btn--pri demo-tour__next" disabled={index >= total - 1}
                            onClick={() => onIndexChange(index + 1)}>
                            다음<ChevronRight size={12} aria-hidden="true" />
                        </button>
                    </div>
                </div>
            </aside>
        </>
    )
}
