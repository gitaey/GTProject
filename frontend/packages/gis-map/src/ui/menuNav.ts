// 드롭다운 메뉴 키보드 이동 계산(순수 함수) — UserMenu·나만의지도 항목 메뉴가 같이 쓴다.
// at = 지금 포커스된 항목 번호(없으면 -1), count = 항목 수. 돌려주는 값 = 다음에 포커스할 번호, 메뉴가 쓰지 않는 키·항목 0개면 -1

export function menuNextIndex(key: string, at: number, count: number): number {
    if (count <= 0) return -1
    if (key === 'ArrowDown') return at < 0 ? 0 : (at + 1) % count
    if (key === 'ArrowUp') return at <= 0 ? count - 1 : at - 1
    if (key === 'Home') return 0
    if (key === 'End') return count - 1
    return -1
}
