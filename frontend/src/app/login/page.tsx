'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, LogIn, Shield } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import type { AuthUser } from '@/store/authStore'

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
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-900 flex items-center justify-center p-4">
            {/* 배경 장식 */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
                <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
            </div>

            <div className="relative w-full max-w-sm">
                {/* 로고 영역 */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl shadow-lg shadow-blue-600/30 mb-4">
                        <Shield size={28} className="text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-white">GT Project</h1>
                    <p className="text-sm text-blue-300 mt-1">관리자 대시보드</p>
                </div>

                {/* 로그인 카드 */}
                <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-8 shadow-2xl">
                    <h2 className="text-lg font-semibold text-white mb-6">로그인</h2>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* 에러 메시지 */}
                        {error && (
                            <div className="px-4 py-3 bg-red-500/20 border border-red-500/40 rounded-lg text-sm text-red-300">
                                {error}
                            </div>
                        )}

                        {/* 아이디 */}
                        <div>
                            <label className="block text-xs font-medium text-blue-200 mb-1.5">아이디</label>
                            <input
                                type="text"
                                value={userId}
                                onChange={(e) => setUserId(e.target.value)}
                                placeholder="아이디 입력"
                                autoComplete="username"
                                autoFocus
                                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/50 transition-all"
                            />
                        </div>

                        {/* 비밀번호 */}
                        <div>
                            <label className="block text-xs font-medium text-blue-200 mb-1.5">비밀번호</label>
                            <div className="relative">
                                <input
                                    type={showPwd ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="비밀번호 입력"
                                    autoComplete="current-password"
                                    className="w-full px-4 py-3 pr-12 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/50 transition-all"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPwd(!showPwd)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/40 hover:text-white/70 transition-colors"
                                >
                                    {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>

                        {/* 로그인 버튼 */}
                        <button
                            type="submit"
                            disabled={loading || !userId.trim() || !password}
                            className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all shadow-lg shadow-blue-600/30 mt-2"
                        >
                            {loading ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <LogIn size={16} />
                            )}
                            {loading ? '로그인 중...' : '로그인'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )
}
