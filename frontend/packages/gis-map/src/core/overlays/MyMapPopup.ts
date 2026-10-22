// 나만의지도 클릭 팝업(DOM, React 없음). 지도를 클릭하면 그 자리의 나만의지도 피처 속성을 이름: 값 표로 보여 준다.
//   · React 위젯이 아니라 코어 DOM이라 MapShell·UMD(a)·붙이기(b) 어디서나 같다(측정 툴팁과 같은 방식: ol.Overlay + gm- CSS)
//   · 값은 전부 textContent로만 넣는다(사용자가 올린 엑셀 값이 그대로 들어온다 — HTML로 해석하지 않는다)
//   · 도구(그리기·측정·반경)가 켜져 있으면 띄우지 않는다(훅 toolActive). 엔진이 붙인 리스너·오버레이는 destroy()에서 모두 뗀다
// 스타일: styles/gis-map.css의 .gm-mymap-popup*
import Overlay from 'ol/Overlay'
import type OlMap from 'ol/Map'
import type { Coordinate } from 'ol/coordinate'
import type { Pixel } from 'ol/pixel'
import type { MapResources } from '../tracker'

const SVG_NS = 'http://www.w3.org/2000/svg'

export interface MyMapPopupRow {
    name: string
    value: string
}

export interface MyMapPopupContent {
    title: string
    rows: readonly MyMapPopupRow[]
}

export interface MyMapPopupHooks {
    /** 클릭한 픽셀의 나만의지도 피처 → 보여 줄 내용. 피처가 없거나 그 레이어의 팝업이 꺼져 있으면 null */
    pick(pixel: Pixel): MyMapPopupContent | null
    /** 도구가 켜져 있으면 true — 이때 클릭은 팝업을 열지도 닫지도 않는다 */
    toolActive(): boolean
}

interface PopupClick {
    pixel: Pixel
    coordinate: Coordinate
}

export class MyMapPopup {
    private readonly olMap: OlMap
    private readonly resources: MapResources
    private readonly hooks: MyMapPopupHooks
    private readonly doc: Document
    private readonly root: HTMLDivElement
    private readonly titleEl: HTMLSpanElement
    private readonly bodyEl: HTMLDivElement
    private readonly closeBtn: HTMLButtonElement
    private readonly overlay: Overlay
    private enabled = true
    private open = false
    private destroyed = false

    private readonly onClose = (): void => {
        this.close()
    }

    private readonly onMapClick = (e: PopupClick): void => {
        if (this.destroyed || !this.enabled || this.hooks.toolActive()) return
        const content = this.hooks.pick(e.pixel)
        if (!content) {
            this.close()
            return
        }
        this.show(content, e.coordinate)
    }

    constructor(olMap: OlMap, resources: MapResources, hooks: MyMapPopupHooks) {
        this.olMap = olMap
        this.resources = resources
        this.hooks = hooks
        // viewport는 ol.Map 생성 때 이미 있다 → 호스트 문서(iframe 포함)를 그대로 쓴다
        this.doc = olMap.getViewport().ownerDocument
        const doc = this.doc
        this.root = doc.createElement('div')
        this.root.className = 'gm-mymap-popup'
        this.root.setAttribute('role', 'dialog')
        this.root.setAttribute('aria-label', '나만의지도 속성')
        const header = doc.createElement('div')
        header.className = 'gm-mymap-popup__header'
        this.titleEl = doc.createElement('span')
        this.titleEl.className = 'gm-mymap-popup__title'
        this.closeBtn = doc.createElement('button')
        this.closeBtn.type = 'button'
        this.closeBtn.className = 'gm-mymap-popup__close'
        this.closeBtn.setAttribute('aria-label', '닫기')
        this.closeBtn.appendChild(createXIcon(doc))
        this.closeBtn.addEventListener('click', this.onClose)
        header.appendChild(this.titleEl)
        header.appendChild(this.closeBtn)
        this.bodyEl = doc.createElement('div')
        this.bodyEl.className = 'gm-mymap-popup__body'
        this.root.appendChild(header)
        this.root.appendChild(this.bodyEl)
        this.overlay = new Overlay({
            element: this.root,
            positioning: 'bottom-center',
            offset: [0, -10],
            autoPan: { animation: { duration: 150 }, margin: 24 },
        })
        resources.addOverlay(this.overlay)
        olMap.on('singleclick', this.onMapClick)
    }

    isOpen(): boolean {
        return this.open
    }

    /** false면 클릭해도 열리지 않고, 열려 있던 것은 닫는다 */
    setEnabled(enabled: boolean): void {
        this.enabled = enabled
        if (!enabled) this.close()
    }

    close(): void {
        if (!this.open) return
        this.open = false
        this.overlay.setPosition(undefined)
    }

    show(content: MyMapPopupContent, position: Coordinate): void {
        if (this.destroyed) return
        this.titleEl.textContent = content.title
        while (this.bodyEl.firstChild) this.bodyEl.removeChild(this.bodyEl.firstChild)
        const table = this.doc.createElement('table')
        table.className = 'gm-mymap-popup__table'
        for (const row of content.rows) {
            const tr = this.doc.createElement('tr')
            const th = this.doc.createElement('th')
            th.textContent = row.name
            const td = this.doc.createElement('td')
            td.textContent = row.value
            tr.appendChild(th)
            tr.appendChild(td)
            table.appendChild(tr)
        }
        this.bodyEl.appendChild(table)
        this.open = true
        this.overlay.setPosition(position)
    }

    destroy(): void {
        if (this.destroyed) return
        this.destroyed = true
        this.open = false
        this.olMap.un('singleclick', this.onMapClick)
        this.closeBtn.removeEventListener('click', this.onClose)
        this.resources.removeOverlay(this.overlay)
        if (this.root.parentNode) this.root.parentNode.removeChild(this.root)
    }
}

// lucide-react <X size={12} />와 같은 모양·속성
function createXIcon(doc: Document): SVGSVGElement {
    const svg = doc.createElementNS(SVG_NS, 'svg')
    const attrs: Array<[string, string]> = [
        ['xmlns', SVG_NS], ['width', '12'], ['height', '12'], ['viewBox', '0 0 24 24'], ['fill', 'none'],
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
