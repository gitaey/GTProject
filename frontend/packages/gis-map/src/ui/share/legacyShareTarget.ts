// 옛 `MyMapSource.getShare/setShare`(아이디·코드 배열만 주고받음)를 새 공유 화면이 쓰는 `ShareTargetSource`로 감싼다.
// 이름·상태는 없다(ACTIVE·이름 null) · getMany·bulk가 없다 → 일괄 단추는 나오지 않고 단일 모드로만 열린다.
// getShare/setShare가 아예 없는 소스도 연다(빈 공유 · 저장은 아무 일도 안 하고 닫힘 — 옛 화면 그대로).
import type { MyMapSource, ShareChange, ShareSnapshot, ShareTargetSource } from '../../core'

export function legacyShareTarget(source: Pick<MyMapSource, 'getShare' | 'setShare'> | null | undefined): ShareTargetSource {
    return {
        async get(id: number): Promise<ShareSnapshot> {
            if (!source?.getShare) return { users: [], roles: [] }
            const share = await source.getShare(id)
            return {
                users: (share.userIds ?? []).map(userId => ({ userId, name: null, state: 'ACTIVE' as const })),
                roles: (share.roleCodes ?? []).map(code => ({ code, label: null, state: 'ACTIVE' as const })),
            }
        },
        async set(id: number, change: ShareChange): Promise<void> {
            if (!source?.setShare) return
            await source.setShare(id, { userIds: change.userIds, roleCodes: change.roleCodes })
        },
    }
}
