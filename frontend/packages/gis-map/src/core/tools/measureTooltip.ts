// 측정 툴팁(DOM, React 없음). 옛 components/map/overlay/MeasureTooltip.tsx(React 루트를 툴팁마다 하나씩 만들던 방식)를 대신한다.
//   값 한 줄 + (선택) 닫기 X 버튼 + (선택) 작은 안내문. ol.Overlay로 지도 좌표에 붙인다(옛과 같은 offset·positioning).
// 스타일: styles/gis-map.css의 .gm-measure-tooltip*
import Overlay from 'ol/Overlay'
import type OlMap from 'ol/Map'
import type { Coordinate } from 'ol/coordinate'
import type { MapResources } from '../tracker'
import type { ToolManagerImpl } from './ToolManager'

const SVG_NS = 'http://www.w3.org/2000/svg'

export interface MeasureTooltipContent {
    value: string
    /** 값 아래 작은 안내문(예: '우클릭으로 종료') */
    hint?: string
    /** 있으면 X 버튼을 그리고, 누르면 호출 */
    onClose?: () => void
}

export class MeasureTooltip {
    readonly overlay: Overlay
    private readonly resources: MapResources
    private readonly doc: Document
    private readonly el: HTMLDivElement
    private closeBtn: HTMLButtonElement | null = null
    private onCloseClick: ((e: MouseEvent) => void) | null = null
    private removed = false

    /** 만들자마자 지도에 붙인다. position이 없으면 숨김 상태 */
    constructor(olMap: OlMap, resources: MapResources, position?: Coordinate) {
        this.resources = resources
        // viewport는 ol.Map 생성 때 이미 있다 → 호스트 문서(iframe 포함)를 그대로 쓴다
        this.doc = olMap.getViewport().ownerDocument
        this.el = this.doc.createElement('div')
        this.overlay = new Overlay({
            element: this.el,
            offset: [0, -10],
            positioning: 'bottom-center',
            ...(position ? { position } : {}),
        })
        resources.addOverlay(this.overlay)
    }

    get isRemoved(): boolean {
        return this.removed
    }

    render(content: MeasureTooltipContent): void {
        if (this.removed) return
        this.detachClose()
        const doc = this.doc
        const box = doc.createElement('div')
        box.className = 'gm-measure-tooltip'
        const row = doc.createElement('div')
        row.className = 'gm-measure-tooltip__row'
        const value = doc.createElement('span')
        value.textContent = content.value
        row.appendChild(value)
        if (content.onClose) {
            const onClose = content.onClose
            const btn = doc.createElement('button')
            btn.type = 'button'
            btn.className = 'gm-measure-tooltip__close'
            btn.appendChild(createXIcon(doc))
            this.onCloseClick = () => onClose()
            btn.addEventListener('click', this.onCloseClick)
            this.closeBtn = btn
            row.appendChild(btn)
        }
        box.appendChild(row)
        if (content.hint) {
            const hint = doc.createElement('div')
            hint.className = 'gm-measure-tooltip__hint'
            hint.textContent = content.hint
            box.appendChild(hint)
        }
        while (this.el.firstChild) this.el.removeChild(this.el.firstChild)
        this.el.appendChild(box)
    }

    setPosition(position: Coordinate | undefined): void {
        if (this.removed) return
        this.overlay.setPosition(position)
    }

    /** 지도에서 떼고 DOM도 지운다(두 번 불러도 안전) */
    remove(): void {
        if (this.removed) return
        this.removed = true
        this.detachClose()
        this.resources.removeOverlay(this.overlay)
        if (this.el.parentNode) this.el.parentNode.removeChild(this.el)
    }

    private detachClose(): void {
        if (this.closeBtn && this.onCloseClick) this.closeBtn.removeEventListener('click', this.onCloseClick)
        this.closeBtn = null
        this.onCloseClick = null
    }
}

// lucide-react <X size={10} />와 같은 모양·속성(class 'lucide lucide-x' 포함)
function createXIcon(doc: Document): SVGSVGElement {
    const svg = doc.createElementNS(SVG_NS, 'svg')
    const attrs: Array<[string, string]> = [
        ['xmlns', SVG_NS], ['width', '10'], ['height', '10'], ['viewBox', '0 0 24 24'], ['fill', 'none'],
        ['stroke', 'currentColor'], ['stroke-width', '2'], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round'],
        ['class', 'lucide lucide-x'], ['aria-hidden', 'true'],
    ]
    attrs.forEach(([k, v]) => svg.setAttribute(k, v))
    ;['M18 6 6 18', 'm6 6 12 12'].forEach(d => {
        const path = doc.createElementNS(SVG_NS, 'path')
        path.setAttribute('d', d)
        svg.appendChild(path)
    })
    return svg
}

/** 측정 도구(거리·면적·반경) 공통 생성 옵션 — 코어 내부용 */
export interface MeasureToolOptions {
    olMap: OlMap
    resources: MapResources
    tools: ToolManagerImpl
    zIndex: number
    /** '#rrggbb' 권장(반투명 채우기를 이 색으로 만든다) */
    color: string
}
