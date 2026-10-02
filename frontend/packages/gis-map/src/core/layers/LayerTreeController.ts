// 레이어 트리 컨트롤러(지도 인스턴스마다 하나). 옛 stores/map/layerStore.ts(트리·가시성·투명도·펼침·배경지도 모드)와
// hooks/map/useLayerManager.ts(트리 → OL 레이어 동기화)를 React 없이 합쳤다.
//   - 트리 객체가 바뀔 때만 OL 레이어를 전부 지우고 다시 만든다(옛 [map, tree, 키, 프록시] effect)
//   - 가시성·투명도·배경지도 모드가 바뀌면 이미 있는 OL 레이어에 setVisible/setOpacity만 한다(옛 두 번째 effect)
// 데이터는 LayerTreeSource(어댑터)로만 받는다. 펼침 상태 저장은 호스트가 준 저장소로만 한다(코어는 브라우저 저장소를 모른다).
import type BaseLayer from 'ol/layer/Base'
import type { GisMapHost } from '../host'
import type { HttpClient } from '../http'
import type { LayerTreeSource, WfsSource } from '../sources'
import { createStore } from '../store'
import type { ReadableStore, WritableStore } from '../store'
import type { MapResources } from '../tracker'
import type { BasemapMode, LayerDef, LayerGroupDef, LayerTree } from '../types/layer'
import { deriveBasemapMode, getBasemapVisibility, isBasemapLayer } from './basemap'
import type { BasemapModeNames } from './basemap'
import { createOlLayer } from './createOlLayer'
import type { LayerUrlResolver } from './resolveLayerUrl'
import { allTreeLayers, flattenGroupLayers, getLayerOpacity, getLayerVisible } from './treeUtils'

export interface LayerTreeState {
    tree: LayerTree | null
    loading: boolean
    /** 마지막 load() 실패 메시지. 성공하면 null */
    error: string | null
    /** 사용자가 바꾼 체크 상태(없으면 LayerDef.visible) */
    visible: Record<number, boolean>
    /** 사용자가 바꾼 투명도(없으면 LayerDef.opacity) */
    opacity: Record<number, number>
    /** 그룹 펼침 상태(없으면 펼침). 저장소가 있으면 생성 때 읽고 바꿀 때마다 쓴다 */
    expanded: Record<number, boolean>
    basemapMode: BasemapMode
}

/** 엔진이 없을 때(첫 렌더·SSR) 위젯이 쓰는 빈 상태. 얼린 상수라 참조가 바뀌지 않는다 */
export const EMPTY_LAYER_TREE_STATE: Readonly<LayerTreeState> = Object.freeze({
    tree: null,
    loading: false,
    error: null,
    visible: Object.freeze({}) as Record<number, boolean>,
    opacity: Object.freeze({}) as Record<number, number>,
    expanded: Object.freeze({}) as Record<number, boolean>,
    basemapMode: 'normal' as BasemapMode,
})

/** 그룹 펼침 상태 저장소(선택). 브라우저라면 react/usePersistentExpanded.ts의 browserExpandedStorage(key) */
export interface LayerExpandedStorage {
    load(): Record<number, boolean>
    save(expanded: Record<number, boolean>): void
}

export interface LayerTreeController {
    readonly store: ReadableStore<LayerTreeState>
    /** 소스에서 트리를 다시 받는다. 실패해도 throw하지 않는다(state.error). 소스가 없으면 아무것도 안 함 */
    load(): Promise<void>
    /** 체크 토글. 배경지도 레이어면 배경지도 모드도 체크 상태에 맞게 다시 정한다 */
    toggleLayer(layerId: number): void
    /** 그룹의 잎 레이어가 전부 켜져 있으면 전부 끄고, 아니면 전부 켠다(배경지도 모드는 안 바꿈 — 옛 동작) */
    toggleGroup(group: LayerGroupDef): void
    setOpacity(layerId: number, opacity: number): void
    /** 모드를 바꾸고 배경지도 레이어들의 체크 상태를 그 모드에 맞춘다 */
    setBasemapMode(mode: BasemapMode): void
    /** 이름이 같은 첫 레이어를 켠다(이미 켜져 있으면 그대로) */
    enableLayerByName(name: string): void
    toggleExpanded(groupId: number, defaultExpanded?: boolean): void
    /** 저장된 값이 없으면 true */
    isExpanded(groupId: number): boolean
    /** 트리의 모든 잎 레이어(그룹 재귀 → 미분류) */
    allLayers(): LayerDef[]
    /** 체크 상태(사용자 값 또는 기본값) */
    isVisible(layer: LayerDef): boolean
    /** 지도에 실제로 보이는지: 배경지도 레이어는 배경지도 모드가 체크 상태보다 우선 */
    isRendered(layer: LayerDef): boolean
    opacityOf(layer: LayerDef): number
    /** 이 레이어 정의로 만든 OL 레이어(트리가 아직 없거나 없는 id면 null) */
    getOlLayer(layerId: number): BaseLayer | null
}

export interface LayerTreeControllerOptions {
    resources: MapResources
    hostStore: ReadableStore<GisMapHost>
    http: HttpClient
    source?: LayerTreeSource
    wfs?: WfsSource
    zIndex: number
    resolveUrl: LayerUrlResolver
    basemapModes: BasemapModeNames
    expandedStorage?: LayerExpandedStorage
}

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err)
}

export class LayerTreeControllerImpl implements LayerTreeController {
    readonly store: ReadableStore<LayerTreeState>

    private readonly state: WritableStore<LayerTreeState>
    private readonly opts: LayerTreeControllerOptions
    /** 지금 지도에 붙어 있는 OL 레이어(트리 순서) */
    private built: BaseLayer[] = []
    private readonly byId = new Map<number, BaseLayer>()
    /** 마지막으로 OL 레이어를 만들 때 쓴 호스트 값(바뀌면 다시 만든다 — 옛 effect 의존성 vworldApiKey·proxyBaseUrl) */
    private builtWith: { vworld: string; proxyBaseUrl: string } | null = null
    private readonly unsubscribers: Array<() => void> = []
    private destroyed = false

    constructor(opts: LayerTreeControllerOptions) {
        this.opts = opts
        this.state = createStore<LayerTreeState>({
            tree: null,
            loading: false,
            error: null,
            visible: {},
            opacity: {},
            expanded: this.loadExpanded(),
            basemapMode: 'normal',
        })
        this.store = this.state
        this.unsubscribers.push(this.state.subscribe((s, prev) => this.onStateChange(s, prev)))
        this.unsubscribers.push(opts.hostStore.subscribe(host => this.onHostChange(host)))
    }

    // ── 데이터 ──────────────────────────────────────────────────────────

    async load(): Promise<void> {
        const source = this.opts.source
        if (!source || this.destroyed) return
        this.state.setState({ loading: true })
        try {
            const tree = await source.loadTree()
            if (this.destroyed) return
            this.state.setState({ tree, loading: false, error: null })
        } catch (err) {
            if (this.destroyed) return
            this.state.setState({ loading: false, error: errorMessage(err) })
        }
    }

    allLayers(): LayerDef[] {
        const tree = this.state.getState().tree
        return tree ? allTreeLayers(tree) : []
    }

    // ── 가시성·투명도·배경지도 (옛 layerStore 동작 그대로) ─────────────────

    toggleLayer(layerId: number): void {
        if (this.destroyed) return
        const s = this.state.getState()
        const all = this.allLayers()
        const layer = all.find(l => l.id === layerId)
        if (!layer) return
        const current = getLayerVisible(s.visible, layer)
        const visible = { ...s.visible, [layerId]: !current }
        // 배경지도 레이어면 배경지도 모드도 역방향 동기화
        if (isBasemapLayer(layer, this.opts.basemapModes)) {
            this.state.setState({ visible, basemapMode: deriveBasemapMode(all, visible, this.opts.basemapModes) })
            return
        }
        this.state.setState({ visible })
    }

    toggleGroup(group: LayerGroupDef): void {
        if (this.destroyed) return
        const s = this.state.getState()
        const layers = [...group.layers, ...flattenGroupLayers(group.children)]
        const allVisible = layers.length > 0 && layers.every(l => getLayerVisible(s.visible, l))
        const updates: Record<number, boolean> = {}
        for (const l of layers) updates[l.id] = !allVisible
        this.state.setState({ visible: { ...s.visible, ...updates } })
    }

    setOpacity(layerId: number, opacity: number): void {
        if (this.destroyed) return
        const s = this.state.getState()
        this.state.setState({ opacity: { ...s.opacity, [layerId]: opacity } })
    }

    setBasemapMode(mode: BasemapMode): void {
        if (this.destroyed) return
        const s = this.state.getState()
        const updates: Record<number, boolean> = {}
        for (const layer of this.allLayers()) {
            const override = getBasemapVisibility(layer, mode, this.opts.basemapModes)
            if (override !== null) updates[layer.id] = override
        }
        this.state.setState({ basemapMode: mode, visible: { ...s.visible, ...updates } })
    }

    enableLayerByName(name: string): void {
        if (this.destroyed) return
        const s = this.state.getState()
        const layer = this.allLayers().find(l => l.name === name)
        if (!layer) return
        if (getLayerVisible(s.visible, layer)) return
        this.state.setState({ visible: { ...s.visible, [layer.id]: true } })
    }

    isVisible(layer: LayerDef): boolean {
        return getLayerVisible(this.state.getState().visible, layer)
    }

    isRendered(layer: LayerDef): boolean {
        const s = this.state.getState()
        const override = getBasemapVisibility(layer, s.basemapMode, this.opts.basemapModes)
        if (override !== null) return override
        return getLayerVisible(s.visible, layer)
    }

    opacityOf(layer: LayerDef): number {
        return getLayerOpacity(this.state.getState().opacity, layer)
    }

    getOlLayer(layerId: number): BaseLayer | null {
        return this.byId.get(layerId) ?? null
    }

    // ── 펼침 상태 ─────────────────────────────────────────────────────

    toggleExpanded(groupId: number, defaultExpanded = true): void {
        if (this.destroyed) return
        const expanded = this.state.getState().expanded
        const current = groupId in expanded ? expanded[groupId] : defaultExpanded
        const next = { ...expanded, [groupId]: !current }
        this.saveExpanded(next)
        this.state.setState({ expanded: next })
    }

    isExpanded(groupId: number): boolean {
        const expanded = this.state.getState().expanded
        return groupId in expanded ? expanded[groupId] : true
    }

    private loadExpanded(): Record<number, boolean> {
        const storage = this.opts.expandedStorage
        if (!storage) return {}
        try {
            return storage.load() ?? {}
        } catch {
            return {}
        }
    }

    private saveExpanded(next: Record<number, boolean>): void {
        try {
            this.opts.expandedStorage?.save(next)
        } catch {
            // 저장 실패(사생활 보호 모드 등)는 무시 — 옛 saveExpandedMap과 같음
        }
    }

    // ── OL 동기화 ─────────────────────────────────────────────────────

    private onStateChange(s: LayerTreeState, prev: LayerTreeState): void {
        if (this.destroyed) return
        if (s.tree !== prev.tree) {
            this.rebuild()
            return
        }
        if (s.visible !== prev.visible || s.opacity !== prev.opacity || s.basemapMode !== prev.basemapMode) {
            this.applyVisibility()
        }
    }

    private onHostChange(host: GisMapHost): void {
        if (this.destroyed || !this.builtWith) return
        if (host.keys.vworld !== this.builtWith.vworld || host.endpoints.proxyBaseUrl !== this.builtWith.proxyBaseUrl) {
            this.rebuild()
        }
    }

    /** 붙인 OL 레이어를 전부 떼고 지금 트리로 다시 만든다(옛 buildLayers) */
    private rebuild(): void {
        this.removeBuilt()
        const tree = this.state.getState().tree
        if (!tree) return
        const host = this.opts.hostStore.getState()
        this.builtWith = { vworld: host.keys.vworld, proxyBaseUrl: host.endpoints.proxyBaseUrl }
        for (const layer of allTreeLayers(tree)) {
            const olLayer = createOlLayer(layer, {
                visible: this.isRendered(layer),
                opacity: this.opacityOf(layer),
                zIndex: this.opts.zIndex,
                host,
                resolveUrl: this.opts.resolveUrl,
                http: this.opts.http,
                wfs: this.opts.wfs,
            })
            this.opts.resources.addLayer(olLayer)
            this.built.push(olLayer)
            this.byId.set(layer.id, olLayer)
        }
    }

    /** 이미 만든 OL 레이어에 체크 상태·배경지도 모드·투명도를 반영(옛 두 번째 effect) */
    private applyVisibility(): void {
        for (const layer of this.allLayers()) {
            const olLayer = this.byId.get(layer.id)
            if (!olLayer) continue
            olLayer.setVisible(this.isRendered(layer))
            olLayer.setOpacity(this.opacityOf(layer))
        }
    }

    private removeBuilt(): void {
        this.built.forEach(l => this.opts.resources.removeLayer(l))
        this.built = []
        this.byId.clear()
        this.builtWith = null
    }

    /** 엔진 destroy용: 구독을 끊고 OL 레이어를 뗀다. 진행 중인 load() 결과는 버린다 */
    destroy(): void {
        if (this.destroyed) return
        this.destroyed = true
        this.unsubscribers.splice(0).forEach(u => u())
        this.removeBuilt()
        this.state.destroy()
    }
}
