'use client'

// 나만의지도 공유 설정 — 특정 사용자 ID / role 코드에게 공유 (콤마로 구분 입력).
// 요청은 엔진의 나만의지도 소스(map.sources.myMap — 짝 백엔드면 adapters/rest)가 보낸다.
// 스타일: gm-modal(업로드 모달과 공용), gm-share-dialog (FE-5b-2)
import { useEffect, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { ignoreServerFailure, isNetworkError } from '../../core'
import { useGisMap } from '../../react'

interface MyMapShareDialogProps {
    id: number
    name: string
    onClose: () => void
}

export default function MyMapShareDialog({ id, name, onClose }: MyMapShareDialogProps) {
    // 소스 객체는 엔진마다 하나(참조 고정) → 아래 effect가 다시 돌지 않는다
    const myMap = useGisMap()?.sources.myMap
    const [userIds, setUserIds] = useState('')
    const [roleCodes, setRoleCodes] = useState('')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        (async () => {
            try {
                if (!myMap?.getShare) return
                const share = await myMap.getShare(id)
                setUserIds((share.userIds ?? []).join(', '))
                setRoleCodes((share.roleCodes ?? []).join(', '))
            } catch (err) {
                // 옛 코드: success:false면 빈 칸 그대로(네트워크 오류만 드러남)
                if (isNetworkError(err)) throw err
            } finally {
                setLoading(false)
            }
        })()
    }, [id, myMap])

    const handleSave = async () => {
        setSaving(true)
        try {
            // 옛 코드: 응답을 보지 않고 닫는다(네트워크 오류면 닫지 않음)
            if (myMap?.setShare) {
                await ignoreServerFailure(myMap.setShare(id, {
                    userIds: userIds.split(',').map(s => s.trim()).filter(Boolean),
                    roleCodes: roleCodes.split(',').map(s => s.trim()).filter(Boolean),
                }))
            }
            onClose()
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="gm-modal"
            onClick={onClose}>
            <div onClick={e => e.stopPropagation()}
                className="gm-modal__dialog gm-share-dialog">
                <div className="gm-modal__header">
                    <span className="gm-modal__title">공유 설정 — {name}</span>
                    <button onClick={onClose} className="gm-modal__close"><X size={16} /></button>
                </div>

                {loading ? (
                    <div className="gm-modal__loading">
                        <Loader2 size={18} className="gm-loader gm-loader--primary" />
                    </div>
                ) : (
                    <div className="gm-modal__body">
                        <label className="gm-modal__label">공유할 사용자 ID (콤마로 구분)</label>
                        <input value={userIds} onChange={e => setUserIds(e.target.value)} placeholder="예: hong123, kim456"
                            className="gm-modal__field" />

                        <label className="gm-modal__label">공유할 역할(role) 코드 (콤마로 구분)</label>
                        <input value={roleCodes} onChange={e => setRoleCodes(e.target.value)} placeholder="예: VIEWER, DEPT_A"
                            className="gm-modal__field" />

                        <div className="gm-modal__note">공유받은 사용자도 조회만 가능하며, 편집은 소유자만 할 수 있습니다.</div>

                        <button onClick={handleSave} disabled={saving}
                            className="gm-modal__submit">
                            {saving && <Loader2 size={13} className="gm-loader" />}
                            저장
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
