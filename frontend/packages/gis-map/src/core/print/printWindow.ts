// 브라우저 인쇄 창: 숨은 iframe(같은 출처 srcdoc) 문서에 페이지 그림을 옮겨 그리고 그 창의 print()를 부른다.
//   · 호스트 페이지의 CSS·@media print에 영향을 주지 않는다(@page 규칙은 iframe 문서 안에만 있다).
//   · 캔버스가 오염(tainted)돼도 drawImage는 되므로 PNG·PDF가 막힌 화면에서도 인쇄는 된다 — 사용자는 인쇄 창에서 "PDF로 저장"을 고른다.
//   · 인쇄 창이 닫히면(afterprint, 또는 멈춰 있던 print()가 돌아오면 — 취소 포함) 또는 안전 타이머가 지나면 iframe을 지우고 resolve한다. dispose()로 즉시 정리할 수 있다.

/** 인쇄 창이 안 닫힌 것으로 보고 정리하기까지의 최대 시간(afterprint가 안 오는 브라우저 대비) */
export const PRINT_SAFETY_MS = 120000

/** print() 호출이 이 시간 이상 멈춰 있었으면 인쇄 창이 닫힌 뒤 돌아온 것으로 본다 */
const MODAL_PRINT_MS = 400

/** iframe 문서의 CSS: 용지 크기·여백 0, 캔버스 CSS 크기 = 용지 mm. 두 번째 빈 쪽이 안 생기게 넘치는 부분은 숨긴다 */
export function printCss(widthMm: number, heightMm: number): string {
    const w = widthMm + 'mm'
    const h = heightMm + 'mm'
    return [
        `@page{size:${w} ${h};margin:0}`,
        'html,body{margin:0;padding:0;background:#fff}',
        `body{width:${w};height:${h};overflow:hidden}`,
        `.gm-print-sheet{display:block;width:${w};height:${h};overflow:hidden;page-break-after:avoid;page-break-inside:avoid}`,
        '.gm-print-sheet canvas{display:block;width:100%;height:100%}',
    ].join('\n')
}

export interface PrintWindowHandle {
    /** 인쇄 창이 닫히면 resolve. 준비 중 오류면 reject */
    done: Promise<void>
    /** 즉시 정리(iframe 제거) — done도 resolve된다 */
    dispose(): void
}

export function printCanvas(
    doc: Document, source: HTMLCanvasElement, widthMm: number, heightMm: number, safetyMs: number = PRINT_SAFETY_MS,
): PrintWindowHandle {
    const iframe = doc.createElement('iframe')
    iframe.setAttribute('aria-hidden', 'true')
    iframe.tabIndex = -1
    // display:none이면 일부 브라우저가 인쇄하지 않는다 → 화면 밖 0 크기로 둔다
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;'
    let timer: ReturnType<typeof setTimeout> | null = null
    let finished = false
    let resolveDone: () => void = () => undefined
    let rejectDone: (e: unknown) => void = () => undefined
    const done = new Promise<void>((resolve, reject) => {
        resolveDone = resolve
        rejectDone = reject
    })
    const cleanup = (): void => {
        if (finished) return
        finished = true
        if (timer !== null) clearTimeout(timer)
        timer = null
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
    }
    const finish = (): void => {
        cleanup()
        resolveDone()
    }
    iframe.onload = () => {
        if (finished) return
        try {
            const win = iframe.contentWindow
            const idoc = iframe.contentDocument
            if (!win || !idoc) throw new Error('[gis-map] 인쇄용 창을 만들 수 없다')
            const style = idoc.createElement('style')
            style.textContent = printCss(widthMm, heightMm)
            idoc.head.appendChild(style)
            const sheet = idoc.createElement('div')
            sheet.className = 'gm-print-sheet'
            const copy = idoc.createElement('canvas')
            copy.width = source.width
            copy.height = source.height
            const ctx = copy.getContext('2d')
            if (!ctx) throw new Error('[gis-map] 2D 캔버스를 만들 수 없다')
            ctx.drawImage(source, 0, 0)
            sheet.appendChild(copy)
            idoc.body.appendChild(sheet)
            // 취소 때 숨은 iframe의 afterprint가 안 오는 브라우저가 있어 부모 창의 afterprint도 듣는다
            win.addEventListener('afterprint', finish)
            doc.defaultView?.addEventListener('afterprint', finish, { once: true })
            timer = setTimeout(finish, safetyMs)
            win.focus()
            const startedAt = Date.now()
            win.print()
            // print()가 인쇄 창이 닫힐 때까지 멈춰 있던 브라우저(데스크톱 Chrome·Firefox)는 돌아온 시점이 곧 닫힌 시점이다.
            // 바로 돌아오는 브라우저(일부 모바일)는 창이 아직 열려 있으므로 afterprint·안전 타이머를 기다린다.
            if (Date.now() - startedAt >= MODAL_PRINT_MS) finish()
        } catch (e) {
            cleanup()
            rejectDone(e)
        }
    }
    iframe.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><title>지도 출력</title></head><body></body></html>'
    doc.body.appendChild(iframe)
    return { done, dispose: finish }
}
