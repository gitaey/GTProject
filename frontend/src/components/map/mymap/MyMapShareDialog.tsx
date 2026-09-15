'use client'

// 나만의지도 공유 설정 — 특정 사용자 ID / role 코드에게 공유 (콤마로 구분 입력).
import { useEffect, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { getToken } from '@/stores/authStore'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

function authHeaders(): Record<string, string> {
    const token = getToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
}

interface MyMapShareDialogProps {
    id: number
    name: string
    onClose: () => void
}

export default function MyMapShareDialog({ id, name, onClose }: MyMapShareDialogProps) {
    const [userIds, setUserIds] = useState('')
    const [roleCodes, setRoleCodes] = useState('')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`${API}/api/mymap/${id}/share`, { headers: authHeaders() })
                const json = await res.json()
                if (json.success) {
                    setUserIds((json.data.userIds ?? []).join(', '))
                    setRoleCodes((json.data.roleCodes ?? []).join(', '))
                }
            } finally {
                setLoading(false)
            }
        })()
    }, [id])

    const handleSave = async () => {
        setSaving(true)
        try {
            await fetch(`${API}/api/mymap/${id}/share`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify({
                    userIds: userIds.split(',').map(s => s.trim()).filter(Boolean),
                    roleCodes: roleCodes.split(',').map(s => s.trim()).filter(Boolean),
                }),
            })
            onClose()
        } finally {
            setSaving(false)
        }
    }

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={onClose}>
            <div onClick={e => e.stopPropagation()}
                style={{ background: '#fff', borderRadius: 10, width: 340, boxShadow: '0 8px 30px rgba(0,0,0,0.2)' }}>
                <div style={{ padding: '12px 14px', borderBottom: '2px solid #F26722', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#F26722' }}>공유 설정 — {name}</span>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={16} /></button>
                </div>

                {loading ? (
                    <div style={{ padding: 24, textAlign: 'center' }}>
                        <Loader2 size={18} style={{ animation: 'spin 0.8s linear infinite', color: '#F26722' }} />
                    </div>
                ) : (
                    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <label style={{ fontSize: 11, color: '#374151', fontWeight: 600 }}>공유할 사용자 ID (콤마로 구분)</label>
                        <input value={userIds} onChange={e => setUserIds(e.target.value)} placeholder="예: hong123, kim456"
                            style={{ fontSize: 12, padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 6 }} />

                        <label style={{ fontSize: 11, color: '#374151', fontWeight: 600 }}>공유할 역할(role) 코드 (콤마로 구분)</label>
                        <input value={roleCodes} onChange={e => setRoleCodes(e.target.value)} placeholder="예: VIEWER, DEPT_A"
                            style={{ fontSize: 12, padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 6 }} />

                        <div style={{ fontSize: 10.5, color: '#9ca3af' }}>공유받은 사용자도 조회만 가능하며, 편집은 소유자만 할 수 있습니다.</div>

                        <button onClick={handleSave} disabled={saving}
                            style={{
                                marginTop: 4, padding: '8px 0', borderRadius: 6, border: 'none',
                                background: '#F26722', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            }}>
                            {saving && <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />}
                            저장
                        </button>
                    </div>
                )}
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        </div>
    )
}
