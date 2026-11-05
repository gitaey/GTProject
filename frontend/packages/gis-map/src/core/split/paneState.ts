// 분할로 새 지도를 만들 때 처음 상태를 다른 지도에서 복사한다(React 없음 — UMD에서도 쓴다).
//   - 시점(중심·해상도·회전)과 배경지도 모드를 복사한다. options.layers가 true면 레이어 체크·투명도도 복사한다.
//   - 복사만 하고 두 지도를 잇지 않는다: 좌표 배열은 새로 만들어 넣어 두 뷰가 같은 객체를 쥐지 않게 하고,
//     그 뒤 한쪽 상태를 바꿔도 다른 쪽은 그대로다(화면 연동은 linkViews의 일).
//   - 레이어 체크·투명도를 복사하려면 받는 쪽 지도에 레이어 트리가 먼저 있어야 한다(setTree 뒤에 부른다). 트리가 없으면 그 부분은 건너뛴다.
//   - ol는 값 import가 없다(뷰는 인스턴스 메서드만 호출 → olCompat.REQUIRED_OL_API 변경 없음).
import type { GisMap } from '../GisMap'

export interface CopyMapStateOptions {
    /** 레이어 체크·투명도도 복사. 기본 false(시점·배경지도만) */
    layers?: boolean
}

/** from 지도의 시점·배경지도(+선택: 레이어 체크·투명도)를 to 지도에 복사한다. 같은 지도거나 이미 destroy된 쪽이 있어도 던지지 않는다 */
export function copyMapState(from: GisMap, to: GisMap, options?: CopyMapStateOptions): void {
    if (from === to) return

    // 시점: 뷰 좌표계가 다르면 복사하지 않는다(좌표 의미가 다르다)
    const fromView = from.olMap.getView()
    const toView = to.olMap.getView()
    const center = fromView.getCenter()
    const resolution = fromView.getResolution()
    if (center && resolution !== undefined && fromView.getProjection().getCode() === toView.getProjection().getCode()) {
        toView.setCenter([center[0], center[1]])
        toView.setResolution(resolution)
        toView.setRotation(fromView.getRotation())
    }

    // 레이어 체크·투명도(선택): 트리가 있을 때만 의미가 있다. 배경지도 레이어의 체크는 아래 setBasemapMode가 다시 맞춘다
    if (options?.layers) {
        for (const layer of to.layers.allLayers()) {
            if (to.layers.isVisible(layer) !== from.layers.isVisible(layer)) to.layers.toggleLayer(layer.id)
            const opacity = from.layers.opacityOf(layer)
            if (to.layers.opacityOf(layer) !== opacity) to.layers.setOpacity(layer.id, opacity)
        }
    }

    // 배경지도: 모드와 배경지도 레이어 체크를 한 번에 맞춘다
    const mode = from.layers.store.getState().basemapMode
    if (to.layers.store.getState().basemapMode !== mode) to.layers.setBasemapMode(mode)
}
