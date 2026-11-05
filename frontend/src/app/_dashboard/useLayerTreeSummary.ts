'use client'

import { useCallback } from 'react'
import type { LayerTree } from '@gtp/gis-map/core'
import { useAuthStore } from '@/stores/authStore'
import { apiGet, devFailLoader } from './api'
import { summarizeTree } from './previewTree'
import type { TreeSummary } from './previewTree'
import { useResource } from './useResource'
import type { Resource } from './useResource'

export interface LayerTreeSummary {
    tree: LayerTree
    summary: TreeSummary
}

/**
 * 레이어 트리를 한 번만 받아 (1) 레이어 현황 카드 숫자와 (2) 지도 미리보기가 함께 쓰게 한다.
 * GET /api/layers/tree/permission/{role} 한 번 — 개인 설정(/api/layers/user-access)은 부르지 않는다.
 * forceFail은 개발 전용 ?dashFail=layers
 */
export function useLayerTreeSummary(forceFail: boolean): Resource<LayerTreeSummary> {
    const role = useAuthStore((s) => s.user?.role ?? null)

    const loader = useCallback(
        async (signal: AbortSignal): Promise<LayerTreeSummary> => {
            const tree = await apiGet<LayerTree>(`/api/layers/tree/permission/${encodeURIComponent(role ?? '')}`, { signal })
            return { tree, summary: summarizeTree(tree) }
        },
        [role],
    )

    return useResource<LayerTreeSummary>(role === null ? null : `layers:${role}`, forceFail ? devFailLoader : loader)
}
