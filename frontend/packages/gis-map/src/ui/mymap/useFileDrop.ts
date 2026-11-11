'use client'

// 파일 끌어다 놓기 도우미 — 업로드 창과 나만의지도 패널이 함께 쓴다. 상태는 컴포넌트 안(ref·state)에만 있다.
//  · 파일이 아닌 것(글자·링크 끌기)은 무시한다(dataTransfer.types에 'Files'가 있어야 한다)
//  · 덮개 표시는 dragenter/dragleave 계수로 — 자식 요소를 드나들어도 깜빡이지 않는다
//  · 받지 않는 상태(accepting=false)에서도 dragover·drop의 기본 동작은 막는다(브라우저가 파일을 열어 페이지를 떠나는 사고 방지)
//  · **파일 끌기 이벤트는 네 핸들러 모두 전파를 멈춘다.** 업로드 창은 패널 DOM·React 트리 안에 그려지므로, 가장 안쪽의 놓기 영역(창)이 이벤트를 차지해야
//    부모(패널)의 훅이 창이 정한 dropEffect('copy')를 'none'으로 덮어쓰지 않는다(브라우저는 dragover가 끝났을 때 'none'이면 drop 자체를 취소한다).
//    창 바깥(어두운 배경) 이벤트는 창 핸들러를 거치지 않으므로 패널까지 올라가 패널(받지 않음)이 'none'을 정한다 — 의도한 동작.
//  · reset(): 계수를 0으로 되돌린다(창이 열리거나 닫혀서 dragleave가 안 오는 경우 덮개가 남지 않게)
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent as ReactDragEvent } from 'react'

function hasFiles(dt: DataTransfer | null): boolean {
    if (!dt || !dt.types) return false
    return Array.from(dt.types).includes('Files')
}

/** 덮개 계수의 다음 값(순수). enter는 +1, leave는 -1(0 아래로 안 내려감), 창 밖으로 나갔거나 reset이면 0 */
export function stepDepth(depth: number, event: 'enter' | 'leave' | 'reset', leftOutside = false): number {
    if (event === 'reset') return 0
    if (event === 'enter') return depth + 1
    return leftOutside ? 0 : Math.max(0, depth - 1)
}

export interface FileDropBind {
    onDragEnter: (e: ReactDragEvent<HTMLElement>) => void
    onDragOver: (e: ReactDragEvent<HTMLElement>) => void
    onDragLeave: (e: ReactDragEvent<HTMLElement>) => void
    onDrop: (e: ReactDragEvent<HTMLElement>) => void
}

export interface UseFileDropOptions {
    /** false면 놓아도 무시(기본 동작 방지만 한다). 덮개 표시(dragging)는 그대로 켜지므로 호출한 쪽이 "받지 않는 중" 덮개로 바꿔 보여 줄 수 있다 */
    accepting: boolean
    /** 파일을 놓았을 때(accepting일 때만). DataTransfer는 이 호출이 끝나면 비므로 바로 filesFromDataTransfer에 넘긴다 */
    onDropFiles: (dt: DataTransfer) => void
}

export function useFileDrop({ accepting, onDropFiles }: UseFileDropOptions): { dragging: boolean; bind: FileDropBind; reset: () => void } {
    const depth = useRef(0)
    const [dragging, setDragging] = useState(false)
    const acceptingRef = useRef(accepting)
    acceptingRef.current = accepting
    const dropRef = useRef(onDropFiles)
    dropRef.current = onDropFiles

    const reset = useCallback(() => {
        depth.current = stepDepth(depth.current, 'reset')
        setDragging(false)
    }, [])
    const onDragEnter = useCallback((e: ReactDragEvent<HTMLElement>) => {
        if (!hasFiles(e.dataTransfer)) return
        e.preventDefault()
        e.stopPropagation()
        depth.current = stepDepth(depth.current, 'enter')
        setDragging(true)
    }, [])
    const onDragOver = useCallback((e: ReactDragEvent<HTMLElement>) => {
        if (!hasFiles(e.dataTransfer)) return
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = acceptingRef.current ? 'copy' : 'none'
    }, [])
    const onDragLeave = useCallback((e: ReactDragEvent<HTMLElement>) => {
        if (!hasFiles(e.dataTransfer)) return
        e.stopPropagation()
        const to = e.relatedTarget as Node | null
        // 창 밖으로 나갔다(받는 쪽이 아닌 곳으로 이동)
        const outside = !!to && !e.currentTarget.contains(to)
        depth.current = stepDepth(depth.current, 'leave', outside)
        if (depth.current === 0) setDragging(false)
    }, [])
    const onDrop = useCallback((e: ReactDragEvent<HTMLElement>) => {
        if (!hasFiles(e.dataTransfer)) return
        e.preventDefault()
        e.stopPropagation()
        depth.current = stepDepth(depth.current, 'reset')
        setDragging(false)
        if (acceptingRef.current) dropRef.current(e.dataTransfer)
    }, [])

    const bind = useMemo<FileDropBind>(() => ({ onDragEnter, onDragOver, onDragLeave, onDrop }), [onDragEnter, onDragOver, onDragLeave, onDrop])
    return { dragging, bind, reset }
}

/**
 * 켜져 있는 동안(창이 열려 있는 동안) 창 어디에 놓아도 브라우저가 파일을 열지 않게 한다. 닫히면 리스너를 푼다.
 * 받는 대상(창) 밖(어두운 배경)에서는 커서를 '안 됨'으로.
 */
export function useBlockBrowserFileOpen(active: boolean, allowTarget: () => Element | null): void {
    const allowRef = useRef(allowTarget)
    allowRef.current = allowTarget
    useEffect(() => {
        if (!active) return
        const block = (e: Event) => {
            const dt = (e as DragEvent).dataTransfer
            if (!hasFiles(dt)) return
            e.preventDefault()
            if (e.type === 'dragover' && dt) {
                const allow = allowRef.current()
                // 받는 대상(창) 안이면 그쪽 핸들러가 정한 커서를 그대로 둔다
                if (!(allow && e.target instanceof Node && allow.contains(e.target))) dt.dropEffect = 'none'
            }
        }
        window.addEventListener('dragover', block)
        window.addEventListener('drop', block)
        return () => {
            window.removeEventListener('dragover', block)
            window.removeEventListener('drop', block)
        }
    }, [active])
}
