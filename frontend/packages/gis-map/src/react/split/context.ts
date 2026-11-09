'use client'

// 화면 분할용 Context 모음. 공개 타입(GisMapSetupInfo·GisMapSplitState 등)과 내부 Context(react/index.ts에서 export하지 않음)를 함께 둔다.
import { createContext } from 'react'
import type { GisMap, GisMapConfig, GisMapStartView, PartialGisMapHost } from '../../core'
import type { GisMapContextValue } from '../context'

/** GisMapProvider setup의 두 번째 인자 */
export interface GisMapSetupInfo {
    /** 분할 번호. 0 = 이 Provider가 만든 기본 지도, 1~3 = 분할로 더 만든 지도 */
    readonly pane: number
}

export type GisMapSplitCount = 1 | 2 | 3 | 4

/** 분할로 새로 만든 지도의 처음 상태 */
export type GisMapSplitInitialState =
    /** (기본) 활성 지도의 시점·배경지도만 복사. 주제 레이어는 트리 기본값 */
    | 'view-basemap'
    /** 위에 더해 레이어 체크·투명도도 복사 */
    | 'clone-layers'
    /** 복사 없음 — 지도 설정의 처음 시점·일반 배경지도·트리 기본값 */
    | 'default'

export interface GisMapSplitState {
    /** 분할을 쓸 수 있는지. 붙이기(attachTo) 모드이거나 GisMapProvider 밖이면 false(count 1 고정) */
    readonly available: boolean
    readonly count: GisMapSplitCount
    /** 번호 순서의 엔진. 아직 안 만들어졌으면 null. 길이 = count */
    readonly panes: readonly (GisMap | null)[]
    readonly activeIndex: number
    /** 화면 연동 켜짐 여부 */
    readonly sync: boolean
    setCount(count: GisMapSplitCount): void
    /** 없는 번호·아직 안 만든 지도면 무시. 이전 활성 지도의 도구를 끈다 */
    setActive(index: number): void
    setSync(on: boolean): void
    /**
     * 저장한 시작 화면을 지금 적용한다: 분할 수·화면 연동·지도마다 시점·배경지도를 맞추고 활성 지도를 정한다(없는 지도는 만들어지는 대로).
     * 열 때의 자동 복원(restoreStartView)과 설정 패널의 [시작 화면으로]가 같은 길을 쓴다. 붙이기 모드면 1번 지도만 적용
     */
    applyStartView(view: GisMapStartView): void
}

export const GisMapSplitContext = createContext<GisMapSplitState | null>(null)

/** GisMapPane 안이면 그 칸 번호 */
export const GisMapPaneIndexContext = createContext<number | null>(null)

// ── 내부(비공개) ────────────────────────────────────────────────────────

/** GisMapProvider(만들기 모드)가 내려 주는 "같은 설정으로 지도를 더 만들 재료". 분할 Provider가 읽는다 */
export interface GisMapFactoryValue {
    /** 최초 렌더의 config(엔진을 다시 만들지 않는 규칙과 같다) */
    readonly config: Omit<GisMapConfig, 'target' | 'host'> | undefined
    readonly host: PartialGisMapHost | undefined
    /** 최신 setup prop을 부르는 안정된 함수 */
    readonly setup: (map: GisMap, info: GisMapSetupInfo) => void
    /** false = 붙이기 모드(보조 지도를 만들 ol.Map이 없다) */
    readonly canSpawn: boolean
}

export const GisMapFactoryContext = createContext<GisMapFactoryValue | null>(null)

/** 번호별 Context 값(0 = 바깥 Provider, 1~3 = 분할 Provider가 소유한 엔진). GisMapPane이 읽는다 */
export interface GisMapSplitPanesValue {
    readonly panes: readonly (GisMapContextValue | null)[]
}

export const GisMapSplitPanesContext = createContext<GisMapSplitPanesValue | null>(null)
