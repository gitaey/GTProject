// 우클릭으로 도구 끝내기. 지도 viewport의 contextmenu만 가로챈다(브라우저 메뉴 대신 콜백).
import type OlMap from 'ol/Map'

/** 반환값 = 리스너 해제 */
export function bindRightClickFinish(olMap: OlMap, onFinish: () => void): () => void {
    const viewport = olMap.getViewport()
    const handler = (e: MouseEvent): void => {
        e.preventDefault()
        onFinish()
    }
    viewport.addEventListener('contextmenu', handler)
    return () => viewport.removeEventListener('contextmenu', handler)
}

/**
 * 측정 도구용: 오른쪽 버튼(button === 2)의 contextmenu만 받아 브라우저 메뉴를 막고 onRightClick.
 * 옛 측정 훅과 같은 조건이다(키보드 메뉴 키로 생긴 contextmenu(button 0)는 무시). 반환값 = 리스너 해제
 */
export function bindSecondaryContextMenu(olMap: OlMap, onRightClick: () => void): () => void {
    const viewport = olMap.getViewport()
    const handler = (e: MouseEvent): void => {
        if (e.button !== 2) return
        e.preventDefault()
        onRightClick()
    }
    viewport.addEventListener('contextmenu', handler)
    return () => viewport.removeEventListener('contextmenu', handler)
}
