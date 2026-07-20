// 좌측 네비게이션에서 어떤 패널이 열려있는지 관리하는 Store
import { create } from 'zustand'

// 네비게이션 패널 타입: 각 아이콘이 열어주는 패널 종류
export type PanelType = 'layer' | 'image' | 'etc' | null

interface PanelStore {
    activePanel: PanelType
    setActivePanel: (panel: PanelType) => void
    togglePanel: (panel: PanelType) => void  // 같은 패널 클릭 시 닫힘
}

export const usePanelStore = create<PanelStore>((set) => ({
    activePanel: 'layer',   // 초기값: 레이어 패널 열림

    setActivePanel: (panel) => set({ activePanel: panel }),

    // 같은 패널 아이콘 다시 누르면 닫힘 (토글)
    togglePanel: (panel) =>
        set((s) => ({ activePanel: s.activePanel === panel ? null : panel })),
}))
