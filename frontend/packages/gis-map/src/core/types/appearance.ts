// 화면 밝기 모드. 'system'은 OS 설정을 따른다(CSS prefers-color-scheme — JS로 감시하지 않는다).
// 이름이 appearance인 이유: GisMap.theme(주 색)이 이미 있다. CSS 속성은 data-gm-theme.
export type GisMapAppearance = 'light' | 'dark' | 'system'

/** 이 값이 아니면 'light'로 본다(잘못된 설정·옛 저장값 방어) */
export function normalizeAppearance(value: unknown): GisMapAppearance {
    return value === 'dark' || value === 'system' ? value : 'light'
}

/** 엔진이 직접 그리는 DOM이 지금 밝기 값을 읽고 바뀜을 듣는 통로(엔진 인스턴스가 하나씩 만든다 — 전역 상태 아님) */
export interface AppearanceSource {
    get(): GisMapAppearance
    /** 바뀔 때 부른다. 해제 함수를 돌려준다 */
    subscribe(listener: (value: GisMapAppearance) => void): () => void
}

/**
 * 엔진이 만든 요소(.gm-text-input·.gm-mymap-popup)에 밝기 속성을 단다. 라이트면 속성을 뺀다(= 지금 화면과 같다).
 * CSS 다크 값은 [data-gm-theme="dark"]·system 블록(styles/gis-map.css)이 요소 자신에게 준다 — attach에서 .gm-root 밖이어도 동작.
 */
export function applyAppearanceAttr(el: Element, value: GisMapAppearance): void {
    if (value === 'dark' || value === 'system') el.setAttribute('data-gm-theme', value)
    else el.removeAttribute('data-gm-theme')
}
