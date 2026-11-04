'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { AlertTriangle, Code2, Eye, Star, X } from 'lucide-react'
import type { Category, PostFormState, PostStatusCode } from '@/types/post'
import { isFormDirty, toSlug } from '../_lib/postForm'
import BlogDialog from './BlogDialog'
import GradientPicker from './GradientPicker'
import MarkdownBody from './MarkdownBody'

interface PostEditorModalProps {
    open: boolean
    mode: 'create' | 'edit'
    initialForm: PostFormState
    categories: Category[]
    onClose: () => void
    /** throw하면 모달이 message를 보이고 입력은 유지한다. 성공하면 부모가 닫는다 */
    onSubmit: (form: PostFormState) => Promise<void>
}

type EditorTab = 'write' | 'preview'

const STATUS_OPTIONS: { value: PostStatusCode; label: string }[] = [
    { value: 'PUBLISHED', label: '발행' },
    { value: 'DRAFT', label: '임시저장' },
]

/** 글 작성·수정 겸용 모달. 작성/미리보기 탭, 닫기 확인 줄, 제출 중 중복 제출 방지 */
export default function PostEditorModal({
    open, mode, initialForm, categories, onClose, onSubmit,
}: PostEditorModalProps) {
    const isCreate = mode === 'create'
    const uid = useId()
    const id = (name: string) => `${uid}-${name}`

    const [form, setForm] = useState<PostFormState>(initialForm)
    const [tab, setTab] = useState<EditorTab>('write')
    const [error, setError] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const [confirmingClose, setConfirmingClose] = useState(false)
    const [prevOpen, setPrevOpen] = useState(open)

    const submittingRef = useRef(false)
    const titleRef = useRef<HTMLInputElement>(null)
    const writeTabRef = useRef<HTMLButtonElement>(null)
    const previewTabRef = useRef<HTMLButtonElement>(null)
    const keepRef = useRef<HTMLButtonElement>(null)
    const focusBeforeGuard = useRef<HTMLElement | null>(null)

    /* 열릴 때마다 처음 값으로 되돌린다 */
    if (open !== prevOpen) {
        setPrevOpen(open)
        if (open) {
            setForm(initialForm)
            setTab('write')
            setError(null)
            setSubmitting(false)
            setConfirmingClose(false)
        }
    }

    useEffect(() => {
        if (confirmingClose) keepRef.current?.focus()
    }, [confirmingClose])

    /* 작성 모드의 slug는 제목에서 자동으로 만들어지므로 비교에서 뺀다(제목을 지워도 "고친 것"으로 남지 않게) */
    const dirty = isFormDirty(initialForm, { ...form, slug: initialForm.slug })

    const patch = (next: Partial<PostFormState>) => setForm((f) => ({ ...f, ...next }))

    const handleTitleChange = (title: string) => {
        setForm((f) => ({ ...f, title, slug: isCreate ? toSlug(title) : f.slug }))
    }

    const dismissGuard = () => {
        setConfirmingClose(false)
        const target = focusBeforeGuard.current
        if (target && target.isConnected) target.focus()
        else titleRef.current?.focus()
    }

    /* Esc·바깥 클릭·닫기·취소가 모두 여기로 온다 */
    const requestClose = () => {
        if (submittingRef.current) return
        if (confirmingClose) { dismissGuard(); return }
        if (dirty) {
            focusBeforeGuard.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
            setConfirmingClose(true)
            return
        }
        onClose()
    }

    const handleSubmit = async () => {
        if (submittingRef.current) return
        submittingRef.current = true
        setSubmitting(true)
        setError(null)
        setConfirmingClose(false)
        try {
            await onSubmit(form)
        } catch (e) {
            setError(e instanceof Error ? e.message : isCreate ? '작성에 실패했습니다.' : '수정에 실패했습니다.')
        } finally {
            submittingRef.current = false
            setSubmitting(false)
        }
    }

    const handleTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        e.preventDefault()
        const next: EditorTab = tab === 'write' ? 'preview' : 'write'
        setTab(next)
        const nextRef = next === 'write' ? writeTabRef : previewTabRef
        nextRef.current?.focus()
    }

    const tagChips = form.tags.split(',').map((t) => t.trim()).filter(Boolean)
    const hasCategory = categories.some((c) => c.code === form.category)

    return (
        <BlogDialog
            open={open}
            onRequestClose={requestClose}
            labelledBy={id('title')}
            size="lg"
            initialFocusRef={titleRef}
        >
            <div className="blog-ed-head">
                <h2 id={id('title')}>{isCreate ? '새 글' : '글 수정'}</h2>
                <button
                    type="button"
                    className="blog-icon-btn"
                    aria-label="닫기"
                    onClick={requestClose}
                    disabled={submitting}
                >
                    <X size={18} aria-hidden="true" />
                </button>
            </div>

            <div className="blog-ed-body">
                <div className="blog-ed-main">
                    <input
                        ref={titleRef}
                        type="text"
                        className="blog-ed-title"
                        value={form.title}
                        onChange={(e) => handleTitleChange(e.target.value)}
                        placeholder="제목"
                        aria-label="제목"
                        aria-required="true"
                        autoComplete="off"
                    />

                    <div>
                        <label className="blog-ed-label" htmlFor={id('excerpt')}>
                            요약<span className="blog-ed-opt">(선택 · 목록에 보임, 최대 200자)</span>
                        </label>
                        <textarea
                            id={id('excerpt')}
                            className="blog-ctl blog-ctl-area"
                            rows={2}
                            value={form.excerpt}
                            onChange={(e) => patch({ excerpt: e.target.value })}
                            placeholder="목록에 보일 요약"
                        />
                    </div>

                    <div className="blog-ed-tabs" role="tablist" aria-label="본문 편집 방식">
                        <button
                            ref={writeTabRef}
                            type="button"
                            role="tab"
                            id={id('tab-write')}
                            aria-selected={tab === 'write'}
                            aria-controls={id('panel')}
                            tabIndex={tab === 'write' ? 0 : -1}
                            className="blog-ed-tab"
                            onClick={() => setTab('write')}
                            onKeyDown={handleTabKeyDown}
                        >
                            <Code2 size={14} aria-hidden="true" />
                            작성
                        </button>
                        <button
                            ref={previewTabRef}
                            type="button"
                            role="tab"
                            id={id('tab-preview')}
                            aria-selected={tab === 'preview'}
                            aria-controls={id('panel')}
                            tabIndex={tab === 'preview' ? 0 : -1}
                            className="blog-ed-tab"
                            onClick={() => setTab('preview')}
                            onKeyDown={handleTabKeyDown}
                        >
                            <Eye size={14} aria-hidden="true" />
                            미리보기
                        </button>
                        <span className="blog-ed-hint">마크다운 사용 가능</span>
                    </div>

                    <div
                        id={id('panel')}
                        role="tabpanel"
                        aria-labelledby={id(tab === 'write' ? 'tab-write' : 'tab-preview')}
                        className="blog-ed-panel"
                    >
                        {tab === 'write' ? (
                            <textarea
                                className="blog-ed-md"
                                value={form.content}
                                onChange={(e) => patch({ content: e.target.value })}
                                placeholder={'## 제목\n\n본문 내용을 마크다운으로 작성하세요.'}
                                aria-label="본문(마크다운)"
                                spellCheck={false}
                            />
                        ) : (
                            <div className="blog-ed-preview">
                                {form.content.trim()
                                    ? <MarkdownBody content={form.content} variant="preview" />
                                    : <p className="blog-empty-body">미리 볼 내용이 없습니다.</p>}
                            </div>
                        )}
                    </div>
                </div>

                <aside className="blog-ed-side" aria-label="글 설정">
                    <div>
                        <label className="blog-ed-label" htmlFor={id('category')}>
                            카테고리<span className="blog-ed-req" aria-hidden="true">*</span>
                        </label>
                        <select
                            id={id('category')}
                            className="blog-ctl"
                            value={hasCategory ? form.category : ''}
                            onChange={(e) => patch({ category: e.target.value })}
                            aria-required="true"
                        >
                            {!hasCategory && <option value="" disabled>선택</option>}
                            {categories.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                        </select>
                    </div>

                    <div>
                        <span className="blog-ed-label" id={id('status')}>상태</span>
                        <div className="blog-seg" role="radiogroup" aria-labelledby={id('status')}>
                            {STATUS_OPTIONS.map((s) => (
                                <label key={s.value}>
                                    <input
                                        type="radio"
                                        name={id('status-radio')}
                                        value={s.value}
                                        checked={form.status === s.value}
                                        onChange={() => patch({ status: s.value })}
                                    />
                                    <span>{s.label}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="blog-ed-label" htmlFor={id('tags')}>
                            태그<span className="blog-ed-opt">(쉼표로 구분)</span>
                        </label>
                        <input
                            id={id('tags')}
                            type="text"
                            className="blog-ctl"
                            value={form.tags}
                            onChange={(e) => patch({ tags: e.target.value })}
                            placeholder="React, TypeScript, 육아"
                            autoComplete="off"
                        />
                        {tagChips.length > 0 && (
                            <div className="blog-ed-chips" aria-hidden="true">
                                {tagChips.map((t, i) => <span key={`${t}-${i}`}>#{t}</span>)}
                            </div>
                        )}
                    </div>

                    <div>
                        <span className="blog-ed-label" id={id('color')}>포인트 색</span>
                        <GradientPicker
                            value={form.gradient}
                            onChange={(gradient) => patch({ gradient })}
                            labelledBy={id('color')}
                        />
                    </div>

                    <label className="blog-chk">
                        <input
                            type="checkbox"
                            checked={form.featured}
                            onChange={(e) => patch({ featured: e.target.checked })}
                        />
                        <Star size={14} aria-hidden="true" />
                        추천 글로 표시
                    </label>
                </aside>
            </div>

            {error && <div className="blog-ed-err" role="alert">{error}</div>}

            <div className="blog-ed-foot">
                {confirmingClose ? (
                    <>
                        <div className="blog-ed-guard" role="alert">
                            <AlertTriangle size={16} aria-hidden="true" />
                            작성 중인 내용이 사라집니다.
                        </div>
                        <button ref={keepRef} type="button" className="blog-btn blog-btn-ghost" onClick={dismissGuard}>
                            계속 작성
                        </button>
                        <button type="button" className="blog-btn blog-btn-danger" onClick={onClose}>
                            버리고 닫기
                        </button>
                    </>
                ) : (
                    <>
                        <button
                            type="button"
                            className="blog-btn blog-btn-ghost"
                            onClick={requestClose}
                            disabled={submitting}
                        >
                            취소
                        </button>
                        <button type="button" className="blog-btn blog-btn-ink" onClick={handleSubmit} disabled={submitting}>
                            {isCreate ? (submitting ? '발행 중...' : '발행') : (submitting ? '저장 중...' : '저장')}
                        </button>
                    </>
                )}
            </div>
        </BlogDialog>
    )
}
