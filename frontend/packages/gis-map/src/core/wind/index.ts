// 바람길 플러그인 공개 API. ol-wind는 이 폴더에서만 import한다(core 본체는 ol-wind를 모른다).
// 설치: map.use(createWindPlugin()) — 소스를 따로 안 주면 map.sources.wind를 쓴다.

export {
    createWindPlugin,
    MIN_RESOLUTION,
    VELOCITY_SCALE_PER_RESOLUTION,
    MIN_VELOCITY_SCALE,
    MAX_VELOCITY_SCALE,
    velocityScaleForResolution,
    MIN_PATHS,
    MAX_PATHS,
    pathsForResolution,
} from './WindPlugin'
export type { WindPlugin, WindPluginOptions } from './WindPlugin'
export { EMPTY_WIND_STATE } from '../types/wind'
export type { WindState } from '../types/wind'
export { WIND_COLOR_STOPS, windSpeedColor } from '../lib/windColorScale'
export type { WindColorStop } from '../lib/windColorScale'
