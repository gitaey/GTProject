// 텍스트 도형 입력창(DOM, React 없음). 지도를 클릭한 자리 바로 위에 말풍선 모양 입력창을 띄운다.
//   Enter = 확정, Esc = 취소, 입력창 밖을 누르면(blur) 내용이 있을 때만 확정, X = 취소
// config.ui.textInput을 주면 이 기본 입력창 대신 호스트 UI를 쓴다(DrawController가 고른다).
// 스타일: styles/gis-map.css의 .gm-text-input*
import type OlMap from 'ol/Map'
import type { TextInputRequest } from '../config'
import type { MapResources } from '../tracker'
import { appendToMapTarget, mapDocument, positionOrigin, removeElement } from './mapDom'

const SVG_NS = 'http://www.w3.org/2000/svg'
const FOCUS_DELAY_MS = 50

interface OpenInput {
    outer: HTMLDivElement
    input: HTMLInputElement
    closeBtn: HTMLButtonElement
    timer: ReturnType<typeof setTimeout> | null
    onKeyDown: (e: KeyboardEvent) => void
    onBlur: () => void
    onClick: (e: MouseEvent) => void
    onCloseDown: (e: MouseEvent) => void
    onKeyStop: (e: KeyboardEvent) => void
}

export class TextInputOverlay {
    private readonly olMap: OlMap
    private current: OpenInput | null = null

    constructor(olMap: OlMap, resources: MapResources) {
        this.olMap = olMap
        const onTarget = (): void => this.close()
        olMap.on('change:target', onTarget)
        resources.onDispose(() => {
            olMap.un('change:target', onTarget)
            this.close()
        })
    }

    get isOpen(): boolean {
        return this.current !== null
    }

    /** 입력창을 연다. 이미 열려 있으면 먼저 닫는다(확정 없이) */
    open(req: TextInputRequest): void {
        this.close()
        const doc = mapDocument(this.olMap)
        const viewport = this.olMap.getViewport()
        if (!doc) return

        const outer = doc.createElement('div')
        outer.className = 'gm-text-input'
        const body = doc.createElement('div')
        body.className = 'gm-text-input__body'
        const box = doc.createElement('div')
        box.className = 'gm-text-input__box'
        const input = doc.createElement('input')
        input.type = 'text'
        input.placeholder = '텍스트 입력 후 Enter'
        input.className = 'gm-text-input__field'
        const closeBtn = doc.createElement('button')
        closeBtn.type = 'button'
        closeBtn.className = 'gm-text-input__close'
        closeBtn.appendChild(createCloseIcon(doc))
        box.appendChild(input)
        box.appendChild(closeBtn)
        const tailWrap = doc.createElement('div')
        tailWrap.className = 'gm-text-input__tail-wrap'
        const tail = doc.createElement('div')
        tail.className = 'gm-text-input__tail'
        tailWrap.appendChild(tail)
        body.appendChild(box)
        body.appendChild(tailWrap)
        outer.appendChild(body)

        if (!appendToMapTarget(this.olMap, outer)) return
        // 지도 픽셀(viewport 기준) → 입력창 기준점 기준 위치
        const vp = viewport.getBoundingClientRect()
        const o = positionOrigin(outer)
        outer.style.left = vp.left + req.pixel[0] - o.left + 'px'
        outer.style.top = vp.top + req.pixel[1] - o.top + 'px'

        const state: OpenInput = {
            outer, input, closeBtn, timer: null,
            onKeyDown: (e: KeyboardEvent) => {
                // 입력 중 키가 지도(OL 키보드 이동·확대)나 호스트 단축키로 올라가지 않게 한다
                e.stopPropagation()
                if (e.key === 'Enter') {
                    const value = input.value
                    this.close()
                    req.submit(value)
                } else if (e.key === 'Escape') {
                    this.close()
                    req.cancel()
                }
            },
            onBlur: () => {
                const value = input.value
                this.close()
                if (value.trim()) req.submit(value)
                else req.cancel()
            },
            onClick: (e: MouseEvent) => e.stopPropagation(),
            onKeyStop: (e: KeyboardEvent) => e.stopPropagation(),
            // blur보다 먼저 처리되도록 mousedown에서 닫는다
            onCloseDown: (e: MouseEvent) => {
                e.preventDefault()
                this.close()
                req.cancel()
            },
        }
        input.addEventListener('keydown', state.onKeyDown)
        input.addEventListener('keypress', state.onKeyStop)
        input.addEventListener('blur', state.onBlur)
        input.addEventListener('click', state.onClick)
        closeBtn.addEventListener('mousedown', state.onCloseDown)
        state.timer = setTimeout(() => {
            state.timer = null
            if (this.current === state) input.focus()
        }, FOCUS_DELAY_MS)
        this.current = state
    }

    /** 확정 없이 닫는다. 리스너를 먼저 떼고 요소를 지운다(지우는 동안 blur가 와도 두 번 처리하지 않음) */
    close(): void {
        const s = this.current
        if (!s) return
        this.current = null
        if (s.timer !== null) clearTimeout(s.timer)
        s.input.removeEventListener('keydown', s.onKeyDown)
        s.input.removeEventListener('keypress', s.onKeyStop)
        s.input.removeEventListener('blur', s.onBlur)
        s.input.removeEventListener('click', s.onClick)
        s.closeBtn.removeEventListener('mousedown', s.onCloseDown)
        removeElement(s.outer)
    }
}

function createCloseIcon(doc: Document): SVGSVGElement {
    const svg = doc.createElementNS(SVG_NS, 'svg')
    svg.setAttribute('width', '12')
    svg.setAttribute('height', '12')
    svg.setAttribute('viewBox', '0 0 12 12')
    svg.setAttribute('fill', 'none')
    const path = doc.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', 'M1 1l10 10M11 1L1 11')
    path.setAttribute('stroke', 'currentColor')
    path.setAttribute('stroke-width', '1.5')
    path.setAttribute('stroke-linecap', 'round')
    svg.appendChild(path)
    return svg
}
