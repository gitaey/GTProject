// 레이어 트리 소스 — 짝 백엔드 api/layers 계약. 옛 stores/map/layerStore.ts의 loadTree와
// components/map/panel/LayerPanel.tsx 설정 패널의 호출(권한 트리·개인 설정 조회/저장/초기화)을 여기 한 곳으로 모았다.
import { filterTreeByIds } from '../../core'
import type { GisMapHost, LayerTree, LayerTreeSource, SourceContext } from '../../core'
import { apiUrl, readEnvelope } from './envelope'
import type { ApiEnvelope } from './envelope'

export interface RestLayerTreeOptions {
    /** 레이어 트리 권한 키. 기본: 현재 사용자의 role(없으면 null → 전체 트리) */
    getPermissionKey?: (host: GisMapHost) => string | null
    /** 로그인 상태인지(개인 레이어 설정을 조회할지). 기본: 현재 사용자가 있으면 true */
    isAuthenticated?: (host: GisMapHost) => boolean
}

const defaultPermissionKey = (host: GisMapHost): string | null => host.getCurrentUser()?.role ?? null
const defaultIsAuthenticated = (host: GisMapHost): boolean => host.getCurrentUser() !== null

export function restLayerTree(ctx: SourceContext, opts: RestLayerTreeOptions = {}): LayerTreeSource {
    const getKey = opts.getPermissionKey ?? defaultPermissionKey
    const isAuthenticated = opts.isAuthenticated ?? defaultIsAuthenticated

    /** 권한 키가 있으면 권한 트리, 없으면 전체 트리 */
    function treeUrl(host: GisMapHost): string {
        const key = getKey(host)
        return key ? apiUrl(host, `/api/layers/tree/permission/${key}`) : apiUrl(host, '/api/layers/tree')
    }

    const jsonHeaders = { 'Content-Type': 'application/json' }

    return {
        async loadTree(): Promise<LayerTree> {
            const host = ctx.host()
            const url = treeUrl(host)

            // 1) 로그인 상태면 개인 레이어 설정(user-access)을 먼저 본다
            if (isAuthenticated(host)) {
                const uaRes = await ctx.http.fetch(apiUrl(host, '/api/layers/user-access'))
                if (uaRes.ok) {
                    const uaJson = (await uaRes.json()) as ApiEnvelope<number[] | null>
                    const userLayerIds = uaJson.data
                    if (userLayerIds !== null) {
                        // 개인 설정이 있으면 권한 트리를 받아 그 id들만 남긴다
                        const tree = await readEnvelope<LayerTree>(await ctx.http.fetch(url))
                        return filterTreeByIds(tree, new Set(userLayerIds))
                    }
                }
            }

            // 2) 개인 설정이 없으면(또는 비로그인) 권한 트리 그대로
            return readEnvelope<LayerTree>(await ctx.http.fetch(url))
        },

        userSelection: {
            /** 선택 가능한 범위 = 권한 트리 */
            async loadSelectable(): Promise<LayerTree> {
                return readEnvelope<LayerTree>(await ctx.http.fetch(treeUrl(ctx.host())))
            },
            async get(): Promise<number[] | null> {
                return readEnvelope<number[] | null>(await ctx.http.fetch(apiUrl(ctx.host(), '/api/layers/user-access')))
            },
            async save(layerIds: number[]): Promise<void> {
                await readEnvelope<unknown>(await ctx.http.fetch(apiUrl(ctx.host(), '/api/layers/user-access'), {
                    method: 'PUT',
                    headers: jsonHeaders,
                    body: JSON.stringify(layerIds),
                }))
            },
            async reset(): Promise<void> {
                await readEnvelope<unknown>(await ctx.http.fetch(apiUrl(ctx.host(), '/api/layers/user-access'), {
                    method: 'DELETE',
                }))
            },
        },
    }
}
