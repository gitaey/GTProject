// 색상 오버레이(풍속·스칼라 변수) — 격자를 팔레트 PNG로 한 번 그려(core/lib/gridOverlayImage·windOverlayImage) ol ImageStatic(EPSG:4326)으로 올린다.
// 줌·이동 때 다시 계산하지 않는다: 이미지는 프레임이 바뀔 때만 만들고, 뷰 좌표계로의 재투영·확대는 ol이 한다.
// 입자(ol-wind) 레이어와 독립: 입자가 숨겨져 있어도 보이고, 불투명도는 레이어 속성으로만 바꾼다(이미지를 다시 만들지 않는다).
import ImageLayer from 'ol/layer/Image'
import ImageStatic from 'ol/source/ImageStatic'
import type { WindField } from '../types/wind'
import { buildScalarOverlayImage } from '../lib/gridOverlayImage'
import type { WindOverlayImage } from '../lib/gridOverlayImage'
import { buildWindOverlayImage } from '../lib/windOverlayImage'
import type { ScalarGridInfo } from '../lib/windGrid'
import type { WxColorScale } from '../lib/wxColorScales'

export interface WindOverlay {
    readonly layer: ImageLayer<ImageStatic>
    /** 이 격자로 이미지를 다시 만들어 바꾼다. 형식이 틀려 못 만들면 false(이전 그림은 그대로) */
    update(field: WindField): boolean
    /** 스칼라 변수 격자(기온·습도·강수량)로 이미지를 다시 만들어 바꾼다 */
    updateScalar(grid: ScalarGridInfo, scale: WxColorScale): void
    /** 그림을 비운다(레이어는 둔다) — 그 시각 자료가 없거나 아직 받는 중일 때 옛 그림이 남지 않게 */
    clear(): void
    setOpacity(opacity: number): void
    /** 이미지·소스 해제(지도에서 떼는 것은 부르는 쪽) */
    destroy(): void
}

/** zIndex: 배경지도(0)보다 위, 입자 레이어 아래 */
export function createWindOverlay(opts: { opacity: number; zIndex: number }): WindOverlay {
    const layer = new ImageLayer<ImageStatic>({ opacity: opts.opacity, zIndex: opts.zIndex })
    const setImage = (img: WindOverlayImage): void => {
        const old = layer.getSource()
        layer.setSource(new ImageStatic({
            url: img.dataUrl,
            imageExtent: img.extent,
            projection: 'EPSG:4326',
            interpolate: true,
        }))
        old?.dispose()
    }
    return {
        layer,
        update(field: WindField): boolean {
            const img = buildWindOverlayImage(field)
            if (!img) return false
            setImage(img)
            return true
        },
        updateScalar(grid: ScalarGridInfo, scale: WxColorScale): void {
            setImage(buildScalarOverlayImage(grid, scale))
        },
        clear(): void {
            const old = layer.getSource()
            layer.setSource(null)
            old?.dispose()
        },
        setOpacity(opacity: number): void {
            layer.setOpacity(opacity)
        },
        destroy(): void {
            layer.getSource()?.dispose()
            layer.setSource(null)
        },
    }
}
