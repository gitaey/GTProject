// 현재 선택된 지도 도구 상태를 전역으로 관리하는 Store
// Zustand: 상태가 바뀌면 그 상태를 쓰는 컴포넌트가 자동으로 다시 렌더링됨
import { create } from 'zustand'

// 유니온 타입: 현재 선택된 도구를 나타냄. 나열된 값 중 하나만 허용
export type MapTool =
    | 'none'
    | 'draw-point'
    | 'draw-line'
    | 'draw-polygon'
    | 'measure-distance'
    | 'measure-area'
    | 'radius-search'
    | 'clear-map'

// 파라미터 없이 void(반환값 없음)를 반환하는 함수 타입
type ClearListener = () => void

// Pub/Sub 패턴: 초기화 이벤트 구독자 목록
// Set = 중복 없는 배열. 각 훅(useDrawing 등)이 "초기화될 때 내 레이어도 지워줘" 라고 등록해둠
const clearListeners: Set<ClearListener> = new Set()

// onClear(fn): fn을 구독자로 등록
// 반환값: 구독 해제 함수 (jQuery의 on/off 개념)
export const onClear = (fn: ClearListener) => {
    clearListeners.add(fn)
    return () => clearListeners.delete(fn)
}

// Store 인터페이스: 상태와 액션(함수)의 구조 정의
interface MapStore {
    activeTool: MapTool
    setActiveTool: (tool: MapTool) => void
    clearAll: () => void
}

// create<MapStore>(): Zustand Store 생성
// set(): 상태를 바꾸는 함수. 이걸 호출해야 React가 변경을 감지함
export const useMapStore = create<MapStore>((set) => ({
    activeTool: 'none',   // 초기 상태
    setActiveTool: (tool) =>
        set((state) => ({
            // 같은 도구를 다시 누르면 'none'으로 해제 (토글)
            activeTool: state.activeTool === tool ? 'none' : tool,
        })),
    clearAll: () => {
        set({ activeTool: 'none' })
        clearListeners.forEach((fn) => fn())  // 등록된 구독자(각 훅) 전부 호출
    },
}))
