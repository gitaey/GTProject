// 대화상자 안에서 Tab·Shift+Tab이 맴돌게 하는 작은 도우미(의존성 없음). DOM만 만진다.
const FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex]'

/** 지금 화면에 보이고 Tab으로 갈 수 있는 요소들(문서 순서) */
export function focusablesIn(root: HTMLElement): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => {
        if ((el as HTMLButtonElement).disabled) return false
        if (el.tabIndex < 0) return false
        if (el instanceof HTMLInputElement && el.type === 'hidden') return false
        // display:none(숨긴 파일 input 등)은 getClientRects가 비어 있다
        return el.getClientRects().length > 0
    })
}

/** keydown 핸들러에서 호출: Tab이 맨 끝/맨 앞을 넘으려 하면 반대쪽으로 돌린다. 처리했으면 true */
export function trapTab(e: { key: string; shiftKey: boolean; preventDefault: () => void }, root: HTMLElement): boolean {
    if (e.key !== 'Tab') return false
    const items = focusablesIn(root)
    if (items.length === 0) {
        e.preventDefault()
        return true
    }
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault()
        last.focus()
        return true
    }
    if (!e.shiftKey && (active === last || !root.contains(active))) {
        e.preventDefault()
        first.focus()
        return true
    }
    return false
}

/** 어두운 배경(바깥)을 눌러도 포커스를 빼앗지 않는다 — 창 안에 있던 포커스가 body로 가면 Tab이 창 뒤 페이지로 나간다. 배경 자신을 눌렀을 때만(창 안 클릭은 그대로) */
export function keepFocusOnBackdrop(e: { target: unknown; currentTarget: unknown; preventDefault: () => void }): void {
    if (e.target === e.currentTarget) e.preventDefault()
}
