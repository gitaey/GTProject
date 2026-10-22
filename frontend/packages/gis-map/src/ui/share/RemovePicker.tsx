'use client'

// 일괄 "대상 빼기" — 선택한 여러 레이어의 현재 공유 대상을 모아 보여 주고, 뺄 대상을 눌러 고른다.
// 칩 옆 `2/3개 레이어` = 선택한 레이어 3개 중 2개에 이 대상이 공유돼 있다는 뜻.
import { cx } from '../cx'
import { stateBadge } from './shareModel'
import type { BulkCurrent } from './shareModel'

interface RemovePickerProps {
    current: BulkCurrent
    /** 현재 공유를 조회한 레이어 수(분모) */
    total: number
    pickedUsers: ReadonlySet<string>
    pickedRoles: ReadonlySet<string>
    onToggleUser: (userId: string) => void
    onToggleRole: (code: string) => void
    disabled?: boolean
}

export default function RemovePicker({ current, total, pickedUsers, pickedRoles, onToggleUser, onToggleRole, disabled }: RemovePickerProps) {
    if (current.users.length === 0 && current.roles.length === 0) {
        return <div className="gm-share__empty">선택한 레이어에 공유된 대상이 없습니다.</div>
    }
    return (
        <div className="gm-share__picker">
            <div className="gm-share__hint">뺄 대상을 누르세요. 누른 대상만 선택한 레이어에서 공유가 해제됩니다.</div>
            <ul className="gm-share__chips" aria-label="현재 공유 대상">
                {current.users.map(u => {
                    const badge = stateBadge(u.state)
                    const on = pickedUsers.has(u.userId)
                    return (
                        <li key={'u:' + u.userId}>
                            <button type="button" aria-pressed={on} disabled={disabled} onClick={() => onToggleUser(u.userId)}
                                className={cx('gm-share__chip', 'gm-share__chip--toggle', on && 'gm-is-picked', u.state !== 'ACTIVE' && 'gm-share__chip--muted')}>
                                <span className="gm-share__chip-name">{u.name ?? u.userId}</span>
                                {u.name && <span className="gm-share__chip-sub">{u.userId}</span>}
                                {badge && <span className="gm-share__badge">{badge}</span>}
                                <span className="gm-share__count">{u.count}/{total}개 레이어</span>
                            </button>
                        </li>
                    )
                })}
                {current.roles.map(r => (
                    <li key={'r:' + r.code}>
                        <button type="button" aria-pressed={pickedRoles.has(r.code)} disabled={disabled} onClick={() => onToggleRole(r.code)}
                            className={cx('gm-share__chip', 'gm-share__chip--toggle', pickedRoles.has(r.code) && 'gm-is-picked', r.state !== 'ACTIVE' && 'gm-share__chip--muted')}>
                            <span className="gm-share__chip-name">{r.label ?? r.code}</span>
                            {r.label && <span className="gm-share__chip-sub">{r.code}</span>}
                            {r.state === 'MISSING' && <span className="gm-share__badge">목록에 없음</span>}
                            <span className="gm-share__count">{r.count}/{total}개 레이어</span>
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    )
}
