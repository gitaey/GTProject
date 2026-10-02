// 색 변환 유틸(순수 함수)

/**
 * '#rgb' / '#rrggbb'(대소문자 무관, 앞뒤 공백 허용) → '#rrggbb'. 3자리는 6자리로 펼치고, 6자리는 글자 그대로(대소문자 유지) 돌려준다.
 * 그 밖의 값('red'·'rgb()'·8자리·문자열이 아닌 값 등)은 null — 예외를 던지지 않는다.
 * config.theme.primary의 입력 규칙은 이 함수 하나로 정한다(엔진 resolveTheme와 ui MapRoot의 CSS 변수 계산이 같이 쓴다)
 */
export function normalizeHexColor(color: unknown): string | null {
    if (typeof color !== 'string') return null
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())
    if (!m) return null
    return '#' + (m[1].length === 3 ? m[1].replace(/./g, c => c + c) : m[1])
}

/** '#rgb' / '#rrggbb' → [r, g, b](normalizeHexColor와 같은 입력 규칙). 그 밖의 값은 null */
export function parseHexColor(color: unknown): [number, number, number] | null {
    const hex = normalizeHexColor(color)
    if (!hex) return null
    return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
}

/** '#rrggbb' → 'rgba(r,g,b,a)' */
export function hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r},${g},${b},${alpha})`
}

/**
 * 측정 도구 채우기색: '#rrggbb' → 'rgba(r, g, b, a)'(옛 측정 훅의 글자 모양 그대로, 쉼표 뒤 공백).
 * '#rrggbb'가 아니면(예: 'rgba(...)', 'red') 그대로 돌려준다
 */
export function translucent(color: string, alpha: number): string {
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) return color
    const r = parseInt(color.slice(1, 3), 16)
    const g = parseInt(color.slice(3, 5), 16)
    const b = parseInt(color.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
