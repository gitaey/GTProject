// 엔진이 지도에 붙인 것(레이어·interaction·overlay·control·정리 함수)만 기억했다가 한 번에 떼어낸다.
// 붙이기 모드(attachGisMap)에서 호스트가 원래 가진 레이어·interaction은 여기에 없으므로 건드리지 않는다.
import type OlMap from 'ol/Map'
import type BaseLayer from 'ol/layer/Base'
import type Interaction from 'ol/interaction/Interaction'
import type Overlay from 'ol/Overlay'
import type Control from 'ol/control/Control'

export class MapResources {
    private readonly olMap: OlMap
    private readonly layers = new Set<BaseLayer>()
    private readonly interactions = new Set<Interaction>()
    private readonly overlays = new Set<Overlay>()
    private readonly controls = new Set<Control>()
    private readonly disposers: Array<() => void> = []

    constructor(olMap: OlMap) {
        this.olMap = olMap
    }

    addLayer<L extends BaseLayer>(layer: L): L {
        this.olMap.addLayer(layer)
        this.layers.add(layer)
        return layer
    }

    removeLayer(layer: BaseLayer): void {
        if (this.layers.delete(layer)) this.olMap.removeLayer(layer)
    }

    addInteraction<I extends Interaction>(interaction: I): I {
        this.olMap.addInteraction(interaction)
        this.interactions.add(interaction)
        return interaction
    }

    removeInteraction(interaction: Interaction): void {
        if (this.interactions.delete(interaction)) this.olMap.removeInteraction(interaction)
    }

    addOverlay(overlay: Overlay): Overlay {
        this.olMap.addOverlay(overlay)
        this.overlays.add(overlay)
        return overlay
    }

    removeOverlay(overlay: Overlay): void {
        if (this.overlays.delete(overlay)) this.olMap.removeOverlay(overlay)
    }

    addControl(control: Control): Control {
        this.olMap.addControl(control)
        this.controls.add(control)
        return control
    }

    removeControl(control: Control): void {
        if (this.controls.delete(control)) this.olMap.removeControl(control)
    }

    /** DOM/OL 리스너 해제 등 임의 정리 함수 등록. 반환값 = 지금 바로 정리 */
    onDispose(fn: () => void): () => void {
        this.disposers.push(fn)
        return () => {
            const i = this.disposers.indexOf(fn)
            if (i >= 0) {
                this.disposers.splice(i, 1)
                fn()
            }
        }
    }

    /** 등록 역순으로 정리 함수 실행 → interaction·overlay·control·레이어 제거 */
    releaseAll(): void {
        while (this.disposers.length > 0) {
            const fn = this.disposers.pop()
            try {
                fn?.()
            } catch (err) {
                console.error('[gis-map] 정리 함수 실행 중 오류', err)
            }
        }
        this.interactions.forEach(i => this.olMap.removeInteraction(i))
        this.interactions.clear()
        this.overlays.forEach(o => this.olMap.removeOverlay(o))
        this.overlays.clear()
        this.controls.forEach(c => this.olMap.removeControl(c))
        this.controls.clear()
        this.layers.forEach(l => this.olMap.removeLayer(l))
        this.layers.clear()
    }
}
