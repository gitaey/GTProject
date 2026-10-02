// 코어 DOM 요소(커서 안내·텍스트 입력)를 지도 target 요소 안에 절대 위치로 띄우는 도우미.
// viewport(overflow: hidden) 밖, target 안에 붙이므로 OL 포인터 이벤트와 섞이지 않고 지도 가장자리에서 잘리지 않는다.
// document는 지도 요소의 ownerDocument만 쓴다(모듈 로드 시 전역 접근 없음 — SSR 안전).
import type OlMap from 'ol/Map'

/** 지도 target 요소의 document. 지도가 아직 화면에 없으면 null */
export function mapDocument(olMap: OlMap): Document | null {
    return olMap.getTargetElement()?.ownerDocument ?? null
}

/** el을 지도 target 요소 끝에 붙이고 left/top을 0으로 둔다. target이 없으면 false */
export function appendToMapTarget(olMap: OlMap, el: HTMLElement): boolean {
    const target = olMap.getTargetElement()
    if (!target) return false
    if (el.parentNode !== target) {
        el.style.left = '0px'
        el.style.top = '0px'
        target.appendChild(el)
    }
    return true
}

/** 절대 위치 요소 el의 기준점(containing block 원점)을 화면 좌표로. el의 left/top은 px 값이어야 한다 */
export function positionOrigin(el: HTMLElement): { left: number; top: number } {
    const r = el.getBoundingClientRect()
    return { left: r.left - (parseFloat(el.style.left) || 0), top: r.top - (parseFloat(el.style.top) || 0) }
}

export function removeElement(el: HTMLElement | null): void {
    if (el && el.parentNode) el.parentNode.removeChild(el)
}
