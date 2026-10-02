// config.theme.primary → CSS 변수(--gm-primary·--gm-primary-rgb·--gm-primary-hover·--gm-primary-deep) 계산.
// 기본값(styles/gis-map.css)과 같은 색이면 아무것도 돌려주지 않는다 → 기본 테마에서는 루트 요소에 style 속성이 생기지 않는다.
// 입력 규칙은 엔진 resolveTheme와 같다(core normalizeHexColor): #rgb·#rrggbb만 받고, 그 밖의 값은 기본 테마로 본다.
import type { CSSProperties } from 'react'
import { DEFAULT_THEME, normalizeHexColor, parseHexColor } from '../../core'

/** 검정을 amount(0~1)만큼 섞은 #rrggbb */
export function shadeHex(rgb: readonly [number, number, number], amount: number): string {
    return '#' + rgb.map(v => Math.round(v * (1 - amount)).toString(16).padStart(2, '0')).join('')
}

/** 기본 테마 파생값의 근삿값으로 정한 비율(옛 hover #e05d19·로고 끝색 #e04e0a는 디자이너가 고른 값이라 정확한 비율이 없다) */
const HOVER_SHADE = 0.08
const DEEP_SHADE = 0.12

/**
 * 테마 주 색이 기본값과 다를 때만 CSS 변수 묶음(4개)을 만든다. #rgb는 #rrggbb로 펼쳐 넣는다.
 * #rgb·#rrggbb가 아니면('red'·'rgb()'·8자리 등) 엔진과 같이 기본 테마로 보고 아무것도 넣지 않는다(예외 없음).
 * hex가 아닌 색을 쓰려면 호스트 CSS로 .gm-root { --gm-primary: … }를 직접 준다.
 */
export function primaryThemeVars(primary: string | null | undefined): CSSProperties | undefined {
    const hex = normalizeHexColor(primary)
    const rgb = parseHexColor(hex)
    if (!hex || !rgb || hex.toLowerCase() === DEFAULT_THEME.primary.toLowerCase()) return undefined
    return {
        '--gm-primary': hex,
        '--gm-primary-rgb': rgb.join(', '),
        '--gm-primary-hover': shadeHex(rgb, HOVER_SHADE),
        '--gm-primary-deep': shadeHex(rgb, DEEP_SHADE),
    } as CSSProperties
}
