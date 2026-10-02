// 커서 안내: 도구를 쓰는 동안 마우스 커서 오른쪽 아래(14px)에 짧은 안내문을 띄운다(DOM, React 없음).
// 지도 영역(지도 target의 부모 요소 안 + viewport 사각형 안)에서 마우스가 움직일 때만 따라다니고, 벗어나면 숨긴다.
// 스타일: styles/gis-map.css의 .gm-tool-hint*
import type OlMap from 'ol/Map'
import type { MapResources } from '../tracker'
import type { ReadableStore } from '../store'
import type { MapTool } from '../types/draw'
import type { ToolState } from './ToolManager'
import { appendToMapTarget, mapDocument, positionOrigin, removeElement } from './mapDom'

export type ToolHints = Partial<Record<MapTool, string>>

export const DEFAULT_TOOL_HINTS: Readonly<ToolHints> = Object.freeze({
    'draw-point': '우클릭으로 그리기 종료',
    'draw-line': '우클릭으로 그리기 종료',
    'draw-polygon': '우클릭으로 그리기 종료',
    'draw-circle': '우클릭으로 그리기 종료',
    'draw-box': '우클릭으로 그리기 종료',
    'draw-text': '우클릭으로 그리기 종료',
    'select': '클릭해서 선택 · Shift+클릭으로 여러 개 선택',
    'edit': '클릭해서 선택 · 꼭지점 드래그로 수정',
})

/** config.ui.toolHints → 도구별 문구. false면 전부 끔, 객체면 기본 문구 위에 덮어씀('' = 그 도구만 끔) */
export function resolveToolHints(opt: boolean | ToolHints | undefined): ToolHints {
    if (opt === false) return {}
    if (opt === undefined || opt === true) return { ...DEFAULT_TOOL_HINTS }
    return { ...DEFAULT_TOOL_HINTS, ...opt }
}

const OFFSET = 14

export class ToolHintView {
    private readonly olMap: OlMap
    private readonly hints: ToolHints
    private text: string | null = null
    /** 마지막 커서 위치(기준점 기준). 도구를 껐다 켜도 유지된다 — 켜는 즉시 마지막 위치에 뜬다(옛 동작) */
    private pos: { x: number; y: number } | null = null
    private doc: Document | null = null
    private outer: HTMLDivElement | null = null
    private label: HTMLDivElement | null = null

    constructor(olMap: OlMap, resources: MapResources, store: ReadableStore<ToolState>, hints: ToolHints) {
        this.olMap = olMap
        this.hints = hints
        const onState = (s: ToolState): void => this.setText(this.hints[s.activeTool] || null)
        const offStore = store.subscribe(onState)
        const onTarget = (): void => {
            this.stopListening()
            this.hide()
            this.pos = null
            this.setText(this.text)
        }
        olMap.on('change:target', onTarget)
        resources.onDispose(() => {
            offStore()
            olMap.un('change:target', onTarget)
            this.stopListening()
            this.hide()
            this.outer = null
            this.label = null
        })
        onState(store.getState())
    }

    private setText(text: string | null): void {
        this.text = text
        if (!text) {
            this.stopListening()
            this.hide()
            return
        }
        this.startListening()
        this.render()
    }

    private readonly onMove = (e: MouseEvent): void => {
        const target = this.olMap.getTargetElement()
        if (!target) return
        const scope = target.parentElement ?? target
        const vp = this.olMap.getViewport().getBoundingClientRect()
        const inside = scope.contains(e.target as Node | null) &&
            e.clientX >= vp.left && e.clientX < vp.right && e.clientY >= vp.top && e.clientY < vp.bottom
        if (!inside) {
            // 지도 영역을 벗어남(= 옛 onMouseLeave)
            if (this.pos) {
                this.pos = null
                this.hide()
            }
            return
        }
        const outer = this.ensureElement()
        if (!appendToMapTarget(this.olMap, outer)) return
        const o = positionOrigin(outer)
        this.pos = { x: e.clientX - o.left, y: e.clientY - o.top }
        this.render()
    }

    // 창 밖으로 나감
    private readonly onOut = (e: MouseEvent): void => {
        if (e.relatedTarget) return
        this.pos = null
        this.hide()
    }

    private startListening(): void {
        const doc = mapDocument(this.olMap)
        if (!doc || this.doc === doc) return
        this.stopListening()
        doc.addEventListener('mousemove', this.onMove)
        doc.addEventListener('mouseout', this.onOut)
        this.doc = doc
    }

    private stopListening(): void {
        if (!this.doc) return
        this.doc.removeEventListener('mousemove', this.onMove)
        this.doc.removeEventListener('mouseout', this.onOut)
        this.doc = null
    }

    private ensureElement(): HTMLDivElement {
        if (this.outer && this.label) return this.outer
        const doc = mapDocument(this.olMap) ?? this.olMap.getViewport().ownerDocument
        const outer = doc.createElement('div')
        outer.className = 'gm-tool-hint'
        const label = doc.createElement('div')
        label.className = 'gm-tool-hint__label'
        outer.appendChild(label)
        this.outer = outer
        this.label = label
        return outer
    }

    private render(): void {
        if (!this.text || !this.pos) {
            this.hide()
            return
        }
        const outer = this.ensureElement()
        if (!appendToMapTarget(this.olMap, outer)) return
        if (this.label && this.label.textContent !== this.text) this.label.textContent = this.text
        outer.style.left = this.pos.x + OFFSET + 'px'
        outer.style.top = this.pos.y + OFFSET + 'px'
    }

    private hide(): void {
        removeElement(this.outer)
    }
}
