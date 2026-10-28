// 떠 있는 메뉴(position: fixed)의 자리 계산(순수 함수). 패널의 스크롤 영역에 잘리지 않게 화면 기준 좌표를 쓴다.
// 가로: 단추 오른쪽 끝에 메뉴 오른쪽 끝을 맞추고 화면 밖으로 나가면 안으로 민다. 세로: 기본은 단추 아래,
// 아래 공간이 모자라고 위가 더 넓으면 위로. 어느 쪽도 안 들어가면 화면 안으로 밀어 넣는다.

export interface MenuAnchor { left: number; top: number; right: number; bottom: number }
export interface MenuSize { width: number; height: number }
export interface MenuPlacement { left: number; top: number; above: boolean }

/** 메뉴와 단추·화면 가장자리 사이 간격(px) */
export const MENU_GAP = 4
export const MENU_MARGIN = 8

export function computeMenuPosition(anchor: MenuAnchor, size: MenuSize, viewport: MenuSize): MenuPlacement {
    let left = anchor.right - size.width
    left = Math.min(left, viewport.width - size.width - MENU_MARGIN)
    left = Math.max(left, MENU_MARGIN)

    const spaceBelow = viewport.height - anchor.bottom - MENU_GAP - MENU_MARGIN
    const spaceAbove = anchor.top - MENU_GAP - MENU_MARGIN
    const above = size.height > spaceBelow && spaceAbove > spaceBelow
    let top = above ? anchor.top - MENU_GAP - size.height : anchor.bottom + MENU_GAP
    top = Math.min(top, viewport.height - size.height - MENU_MARGIN)
    top = Math.max(top, MENU_MARGIN)
    return { left, top, above }
}
