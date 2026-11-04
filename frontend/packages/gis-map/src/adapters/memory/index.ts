// 메모리 소스 어댑터(서버 없는 데이터 공급원). 폐쇄망 시연·백엔드 없는 시제품·정적 예제 폴더(examples/gis-demo)·공개 웹 데모가 쓴다.
// import 허용: core만(감사 규칙). 상태는 함수가 만든 객체에만 있고 모듈 전역 상태는 없다.
export { memorySources, DEFAULT_UPLOAD_NOTICE } from './sources'
export type { MemoryData, MemoryParcel, MemoryMapLayer, MemoryAreaLayer, MemoryWindFrame, MemoryRegion, MemorySourcesOptions } from './types'
export { demoSources, demoLayerCrossOrigin } from './demo'
export type { DemoBasemap, DemoSources, DemoSourcesOptions } from './demo'
export {
    createSyntheticData, buildBigPoints, buildWindField, syntheticPnu, syntheticCenter,
    SYNTHETIC_AREA, SYNTHETIC_LEGAL_DONG, SYNTHETIC_BUNHO_BASE, SYNTHETIC_DEFAULT_SEED, SYNTHETIC_DEFAULT_BIG_COUNTS,
} from './synthetic'
export type { SyntheticData, SyntheticOptions } from './synthetic'
export { buildXlsx } from './xlsx'
