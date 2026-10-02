'use client'

// 레이어 그룹 펼침 상태를 브라우저 localStorage에 저장한다. 패키지에서 브라우저 저장소를 만지는 곳은 이 파일뿐이다.
//   - browserExpandedStorage(key): 코어 엔진에 넘길 저장소(config.layers.expandedStorage) — /map 레이어 패널
//   - usePersistentExpanded(key): 엔진 없이 쓰는 화면용 훅 — /map-admin/layer 트리
// 같은 key를 쓰면 두 화면이 펼침 상태를 공유한다(옛 layerStore의 'layer-group-expanded'와 같은 형식: { [groupId]: boolean }).
import { useCallback, useMemo, useState } from 'react'
import type { LayerExpandedStorage } from '../core'

/** localStorage 기반 펼침 저장소. 읽기·쓰기 실패(SSR, 사생활 보호 모드, 깨진 JSON)는 조용히 무시한다 */
export function browserExpandedStorage(storageKey: string): LayerExpandedStorage {
    return {
        load(): Record<number, boolean> {
            try {
                const raw = localStorage.getItem(storageKey)
                return raw ? (JSON.parse(raw) as Record<number, boolean>) : {}
            } catch {
                return {}
            }
        },
        save(expanded: Record<number, boolean>): void {
            try {
                localStorage.setItem(storageKey, JSON.stringify(expanded))
            } catch {
                // 저장 실패는 무시(옛 동작)
            }
        },
    }
}

export interface PersistentExpanded {
    isExpanded(groupId: number): boolean
    toggle(groupId: number): void
}

/**
 * 그룹 펼침 상태(저장값이 없으면 defaultExpanded, 기본 true).
 * 같은 화면에서 그룹마다 이 훅을 따로 불러도(재귀 트리) 서로 덮어쓰지 않도록, 토글할 때 저장소의 최신 값을 읽어 합친 뒤 쓴다.
 * 반환 객체는 펼침 상태가 바뀔 때만 새로 만들어진다.
 */
export function usePersistentExpanded(storageKey: string, defaultExpanded = true): PersistentExpanded {
    const storage = useMemo(() => browserExpandedStorage(storageKey), [storageKey])
    const [expanded, setExpanded] = useState<Record<number, boolean>>(() => storage.load())

    // 저장은 상태 갱신 함수 밖에서 한다(StrictMode는 갱신 함수를 두 번 불러 저장이 되돌려질 수 있음)
    const toggle = useCallback((groupId: number) => {
        const base = { ...expanded, ...storage.load() }
        const current = groupId in base ? base[groupId] : defaultExpanded
        const next = { ...base, [groupId]: !current }
        storage.save(next)
        setExpanded(next)
    }, [expanded, storage, defaultExpanded])

    const isExpanded = useCallback(
        (groupId: number) => (groupId in expanded ? expanded[groupId] : defaultExpanded),
        [expanded, defaultExpanded],
    )

    return useMemo(() => ({ isExpanded, toggle }), [isExpanded, toggle])
}
