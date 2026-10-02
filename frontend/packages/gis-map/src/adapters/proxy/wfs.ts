// WFS 소스 — 호스트 프록시 {proxyBaseUrl}/wfs (VWorld WFS 키를 서버에서 붙인다).
// 주소 모양은 옛 useLayerManager의 WFS 로더 그대로. 좌표계 코드는 로더가 받은 뷰 좌표계(GTProject = 3857)를 쓴다.
import type { SourceContext, WfsSource } from '../../core'

export function proxyWfs(ctx: SourceContext): WfsSource {
    return {
        getFeatureUrl(typeName: string, extent: number[], srsCode: string): string {
            const proxy = ctx.host().endpoints.proxyBaseUrl
            return `${proxy}/wfs?TYPENAMES=${typeName}&BBOX=${extent.join(',')},${srsCode}&SRSNAME=${srsCode}`
        },
    }
}
