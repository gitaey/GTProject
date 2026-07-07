'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, LogIn, Shield } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import type { AuthUser } from '@/stores/authStore'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

interface LoginResponse {
    token: string
    userId: string
    userName: string | null
    nickname: string | null
    role: string
    roleLabel: string
}

interface ApiResponse<T> {
    success: boolean
    message: string
    data: T
}

export default function LoginPage() {
    const router = useRouter()
    const { setAuth } = useAuthStore()

    const [userId, setUserId]       = useState('')
    const [password, setPassword]   = useState('')
    const [showPwd, setShowPwd]     = useState(false)
    const [error, setError]         = useState<string | null>(null)
    const [loading, setLoading]     = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!userId.trim() || !password) return

        setLoading(true)
        setError(null)

        try {
            const res = await fetch(`${API}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: userId.trim(), password }),
            })

            const json: ApiResponse<LoginResponse> = await res.json()

            if (!json.success) {
                setError(json.message)
                return
            }

            const { token, ...userInfo } = json.data
            const user: AuthUser = {
                userId:    userInfo.userId,
                userName:  userInfo.userName,
                nickname:  userInfo.nickname,
                role:      userInfo.role,
                roleLabel: userInfo.roleLabel,
            }

            setAuth(user, token)
            router.push('/')
        } catch {
            setError('서버에 연결할 수 없습니다.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-page)' }}>
            <div className="w-full max-w-sm">
                {/* 로고 영역 */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4" style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)' }}>
                        <Shield size={24} style={{ color: 'var(--accent)' }} />
                    </div>
                    <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>GT Project</h1>
                    <p className="text-sm mt-1" style={{ color: 'var(--text-faint)' }}>관리자 대시보드</p>
                </div>

                {/* 로그인 카드 */}
                <div className="rounded-2xl p-8" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
                    <h2 className="text-base font-semibold mb-6" style={{ color: 'var(--text-primary)' }}>로그인</h2>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {error && (
                            <div className="px-4 py-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                                {error}
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>아이디</label>
                            <input
                                type="text"
                                value={userId}
                                onChange={(e) => setUserId(e.target.value)}
                                placeholder="아이디 입력"
                                autoComplete="username"
                                autoFocus
                                className="w-full px-4 py-2.5 rounded-lg text-sm outline-none transition-all"
                                style={{ background: 'var(--bg-page)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                                onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                                onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>비밀번호</label>
                            <div className="relative">
                                <input
                                    type={showPwd ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="비밀번호 입력"
                                    autoComplete="current-password"
                                    className="w-full px-4 py-2.5 pr-10 rounded-lg text-sm outline-none transition-all"
                                    style={{ background: 'var(--bg-page)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                                    onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                                    onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPwd(!showPwd)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 transition-colors"
                                    style={{ color: 'var(--text-faint)' }}
                                >
                                    {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading || !userId.trim() || !password}
                            className="w-full flex items-center justify-center gap-2 py-2.5 text-white text-sm font-medium rounded-lg transition-all mt-2 disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{ background: 'var(--accent)' }}
                        >
                            {loading ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <LogIn size={15} />
                            )}
                            {loading ? '로그인 중...' : '로그인'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )
}
