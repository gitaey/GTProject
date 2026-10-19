// CSS 색 문자열의 상대 휘도(WCAG, 0=검정~1=흰색). React·ol·DOM 없음.
// '#rgb'·'#rrggbb'·'rgb(r,g,b)'·'rgba(r,g,b,a)'를 읽는다. 이름 색 등 못 읽는 형식은 null.

function channel(v: number): number {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

export function cssColorLuminance(color: string): number | null {
    let rgb: [number, number, number] | null = null
    const hex6 = /^#([0-9a-f]{6})$/i.exec(color.trim())
    const hex3 = /^#([0-9a-f]{3})$/i.exec(color.trim())
    const fn = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/i.exec(color.trim())
    if (hex6) rgb = [parseInt(hex6[1].slice(0, 2), 16), parseInt(hex6[1].slice(2, 4), 16), parseInt(hex6[1].slice(4, 6), 16)]
    else if (hex3) rgb = [parseInt(hex3[1][0] + hex3[1][0], 16), parseInt(hex3[1][1] + hex3[1][1], 16), parseInt(hex3[1][2] + hex3[1][2], 16)]
    else if (fn) rgb = [Math.min(255, Number(fn[1])), Math.min(255, Number(fn[2])), Math.min(255, Number(fn[3]))]
    if (!rgb) return null
    return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2])
}
