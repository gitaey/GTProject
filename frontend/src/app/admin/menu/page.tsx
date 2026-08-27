'use client'

import { useCallback, useEffect, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import { Save, X } from 'lucide-react'
import { getToken } from '@/stores/authStore'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

/* ── 전체 메뉴 카탈로그 ── */
interface CatalogItem {
    id: string
    label: string
}
interface CatalogGroup {
    groupLabel: string
    items: CatalogItem[]
}
interface CatalogArea {
    area: string
    areaLabel: string
    groups: CatalogGroup[]
}

// 전체 items 헬퍼
function areaAllItems(area: CatalogArea): CatalogItem[] {
    return area.groups.flatMap(g => g.items)
}

const MENU_CATALOG: CatalogArea[] = [
    {
        area: 'SIDEBAR',
        areaLabel: '대시보드 사이드바',
        groups: [
            {
                groupLabel: '공통',
                items: [{ id: 'sidebar.home', label: '홈' }],
            },
            {
                groupLabel: '지도',
                items: [
                    { id: 'sidebar.map-view',       label: '지도 보기' },
                    { id: 'sidebar.map-layer',      label: '레이어 관리' },
                    { id: 'sidebar.map-menu',       label: '메뉴 관리' },
                    { id: 'sidebar.map-permission', label: '권한 관리' },
                ],
            },
            {
                groupLabel: '블로그',
                items: [
                    { id: 'sidebar.blog-view',     label: '블로그 보기' },
                    { id: 'sidebar.blog-admin',    label: '포스트 관리' },
                    { id: 'sidebar.blog-category', label: '카테고리 관리' },
                ],
            },
            {
                groupLabel: '기빵봇',
                items: [
                    { id: 'sidebar.bot-log',      label: '봇 로그' },
                    { id: 'sidebar.bot-command',  label: '명령어 관리' },
                    { id: 'sidebar.bot-schedule', label: '자동 전송 관리' },
                    { id: 'sidebar.bot-room',     label: '방 모니터링' },
                ],
            },
            {
                groupLabel: 'GeoServer',
                items: [
                    { id: 'sidebar.geoserver-publish', label: '레이어 배포' },
                    { id: 'sidebar.geoserver-styles',  label: 'SLD 스타일 관리' },
                ],
            },
            {
                groupLabel: '시스템',
                items: [
                    { id: 'sidebar.system-user',       label: '사용자 관리' },
                    { id: 'sidebar.system-access-log', label: '접속 로그' },
                    { id: 'sidebar.system-menu',       label: '메뉴 관리' },
                ],
            },
        ],
    },
    {
        area: 'MAP_PANEL',
        areaLabel: '지도 패널',
        groups: [
            {
                groupLabel: '패널',
                items: [
                    { id: 'map.panel.layer', label: '레이어 패널' },
                    { id: 'map.panel.image', label: '항공영상 패널' },
                    { id: 'map.panel.etc',   label: '기타 패널' },
                ],
            },
        ],
    },
    {
        area: 'MAP_TOOL',
        areaLabel: '지도 툴바',
        groups: [
            {
                groupLabel: '도구',
                items: [
                    { id: 'map.tool.zoom',             label: '줌 인/아웃' },
                    { id: 'map.tool.draw',             label: '그리기' },
                    { id: 'map.tool.measure-distance', label: '거리 측정' },
                    { id: 'map.tool.measure-area',     label: '면적 측정' },
                    { id: 'map.tool.radius-search',    label: '반경 검색' },
                    { id: 'map.tool.clear',            label: '전체 초기화' },
                ],
            },
        ],
    },
]

/* ── 역할/권한 옵션 ── */
const ROLE_OPTIONS = [
    { value: 'SUPER_ADMIN', label: '슈퍼관리자',  hasPermission: false },
    { value: 'MAP_ADMIN',   label: '지도관리자',  hasPermission: false },
    { value: 'MAP_USER',    label: '지도사용자',  hasPermission: true },
]

const PERMISSION_OPTIONS: Record<string, { value: string; label: string }[]> = {
    MAP_USER: [
        { value: 'VIEWER', label: '뷰어' },
        { value: 'DEPT_A', label: '부서A' },
        { value: 'DEPT_B', label: '부서B' },
    ],
}

/* ── API 헬퍼 ── */
async function fetchAllowed(role: string, permission: string | null): Promise<string[]> {
    const token = getToken()
    const params = new URLSearchParams({ role })
    if (permission) params.set('permission', permission)
    const res = await fetch(`${API}/api/menu-visibility?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    const json = await res.json()
    if (!json.success) throw new Error(json.message ?? '메뉴 목록 조회 실패')
    return json.data.menuIds as string[]
}

async function saveAllowed(role: string, permission: string | null, menuIds: string[]): Promise<void> {
    const token = getToken()
    const res = await fetch(`${API}/api/menu-visibility`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ role, permission, menuIds }),
    })
    const json = await res.json()
    if (!json.success) throw new Error(json.message ?? '저장 실패')
}

/* ── inputStyle ── */
const inputStyle: React.CSSProperties = {
    background: 'var(--bg-page)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    borderRadius: '8px',
}

export default function MenuManagementPage() {
    const [selectedRole, setSelectedRole] = useState('SUPER_ADMIN')
    const [selectedPermission, setSelectedPermission] = useState<string | null>(null)
    const [checked, setChecked] = useState<Set<string>>(new Set())
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

    const roleOption = ROLE_OPTIONS.find(r => r.value === selectedRole)!
    const permOptions = PERMISSION_OPTIONS[selectedRole] ?? []
    const effectivePermission = roleOption.hasPermission ? (selectedPermission ?? permOptions[0]?.value ?? null) : null

    const showToast = (msg: string, ok: boolean) => {
        setToast({ msg, ok })
        setTimeout(() => setToast(null), 3000)
    }

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const ids = await fetchAllowed(selectedRole, effectivePermission)
            setChecked(new Set(ids))
        } catch (e) {
            showToast(e instanceof Error ? e.message : '조회 실패', false)
        } finally {
            setLoading(false)
        }
    }, [selectedRole, effectivePermission])

    useEffect(() => { load() }, [load])

    const toggleItem = (id: string) => {
        setChecked((prev) => {
            const n = new Set(prev)
            n.has(id) ? n.delete(id) : n.add(id)
            return n
        })
    }

    const toggleArea = (area: CatalogArea, allChecked: boolean) => {
        setChecked((prev) => {
            const n = new Set(prev)
            areaAllItems(area).forEach((item) => allChecked ? n.delete(item.id) : n.add(item.id))
            return n
        })
    }

    const toggleGroup = (group: CatalogGroup, allChecked: boolean) => {
        setChecked((prev) => {
            const n = new Set(prev)
            group.items.forEach((item) => allChecked ? n.delete(item.id) : n.add(item.id))
            return n
        })
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            await saveAllowed(selectedRole, effectivePermission, Array.from(checked))
            showToast('저장되었습니다.', true)
        } catch (e) {
            showToast(e instanceof Error ? e.message : '저장 실패', false)
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="flex min-h-screen" style={{ background: 'var(--bg-page)' }}>
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">
                <Header title="메뉴 관리" breadcrumb={['관리자', '메뉴 관리']} />

                <main className="flex-1 p-6 space-y-5">
                    {/* ── 컨트롤 카드 ── */}
                    <div style={{
                        background: '#fff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                        padding: '16px 20px',
                        display: 'flex',
                        alignItems: 'flex-end',
                        gap: '12px',
                        flexWrap: 'wrap',
                    }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                                역할
                            </label>
                            <select
                                value={selectedRole}
                                onChange={(e) => { setSelectedRole(e.target.value); setSelectedPermission(null) }}
                                style={{ ...inputStyle, padding: '8px 12px', fontSize: '13.5px', fontWeight: 500, minWidth: '140px' }}
                            >
                                {ROLE_OPTIONS.map(r => (
                                    <option key={r.value} value={r.value}>{r.label}</option>
                                ))}
                            </select>
                        </div>

                        {roleOption.hasPermission && permOptions.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                <label style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                                    세부 권한
                                </label>
                                <select
                                    value={effectivePermission ?? ''}
                                    onChange={(e) => setSelectedPermission(e.target.value)}
                                    style={{ ...inputStyle, padding: '8px 12px', fontSize: '13.5px', fontWeight: 500, minWidth: '140px' }}
                                >
                                    {permOptions.map(p => (
                                        <option key={p.value} value={p.value}>{p.label}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <button
                            onClick={handleSave}
                            disabled={saving || loading}
                            style={{
                                marginLeft: 'auto',
                                display: 'flex', alignItems: 'center', gap: '7px',
                                padding: '8px 20px',
                                background: saving || loading ? '#f1f5f9' : '#F26722',
                                color: saving || loading ? '#94a3b8' : '#fff',
                                border: 'none', borderRadius: '8px',
                                fontSize: '13.5px', fontWeight: 600,
                                cursor: saving || loading ? 'not-allowed' : 'pointer',
                                transition: 'all 0.15s',
                            }}
                        >
                            <Save size={14} />
                            {saving ? '저장 중...' : '변경사항 저장'}
                        </button>
                    </div>

                    {/* ── 영역별 카탈로그 카드 ── */}
                    {loading ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
                            <div style={{
                                width: '24px', height: '24px', borderRadius: '50%',
                                border: '2px solid #F26722', borderTopColor: 'transparent',
                                animation: 'spin 0.7s linear infinite',
                            }} />
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
                            {MENU_CATALOG.map((area) => {
                                const allItems = areaAllItems(area)
                                const checkedCount = allItems.filter(i => checked.has(i.id)).length
                                const areaAllChecked = checkedCount === allItems.length
                                const areaSomeChecked = checkedCount > 0
                                const pct = allItems.length > 0 ? (checkedCount / allItems.length) * 100 : 0
                                return (
                                    <div key={area.area} style={{
                                        background: '#fff',
                                        border: '1px solid #eef0f4',
                                        borderRadius: '10px',
                                        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                                        overflow: 'hidden',
                                    }}>
                                        {/* 카드 헤더: 제목 + 카운트만 */}
                                        <div style={{ padding: '14px 16px 0' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                                <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>
                                                    {area.areaLabel}
                                                </span>
                                                <button
                                                    onClick={() => toggleArea(area, areaAllChecked)}
                                                    style={{
                                                        fontSize: '11px', fontWeight: 500,
                                                        padding: '2px 9px', borderRadius: '20px', border: 'none', cursor: 'pointer',
                                                        background: areaAllChecked ? 'rgba(242,103,34,0.1)' : areaSomeChecked ? '#f1f5f9' : '#f1f5f9',
                                                        color: areaAllChecked ? '#F26722' : '#94a3b8',
                                                        transition: 'all 0.15s',
                                                    }}
                                                >
                                                    {checkedCount} / {allItems.length}
                                                </button>
                                            </div>
                                            {/* 진행률 바 */}
                                            <div style={{ height: '2px', background: '#f0f2f5', borderRadius: '1px' }}>
                                                <div style={{
                                                    height: '100%', width: `${pct}%`,
                                                    background: '#F26722', borderRadius: '1px',
                                                    transition: 'width 0.25s ease',
                                                }} />
                                            </div>
                                        </div>

                                        {/* 그룹 + 항목 */}
                                        <div>
                                            {area.groups.map((group, gi) => (
                                                <div key={group.groupLabel}>
                                                    {/* 그룹 구분선 + 라벨 */}
                                                    <div style={{
                                                        display: 'flex', alignItems: 'center', gap: '8px',
                                                        padding: '10px 16px 4px',
                                                        borderTop: '1px solid #f0f2f5',
                                                        marginTop: gi === 0 ? '10px' : '0',
                                                    }}>
                                                        <span style={{ fontSize: '10px', fontWeight: 600, color: '#b0b8c8', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                                            {group.groupLabel}
                                                        </span>
                                                        <div style={{ flex: 1, height: '1px', background: '#f0f2f5' }} />
                                                    </div>

                                                    {/* 항목 행 */}
                                                    {group.items.map((item) => {
                                                        const on = checked.has(item.id)
                                                        return (
                                                            <label key={item.id} style={{
                                                                display: 'flex', alignItems: 'center', gap: '9px',
                                                                padding: '7px 16px 7px 20px',
                                                                cursor: 'pointer',
                                                                background: on ? 'rgba(242,103,34,0.04)' : 'transparent',
                                                                transition: 'background 0.1s',
                                                            }}
                                                                onMouseEnter={e => { if (!on) (e.currentTarget as HTMLElement).style.background = '#fafafa' }}
                                                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = on ? 'rgba(242,103,34,0.04)' : 'transparent' }}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={on}
                                                                    onChange={() => toggleItem(item.id)}
                                                                    style={{ width: '13px', height: '13px', accentColor: '#F26722', cursor: 'pointer', flexShrink: 0 }}
                                                                />
                                                                <span style={{
                                                                    fontSize: '13px', flex: 1,
                                                                    fontWeight: on ? 500 : 400,
                                                                    color: on ? '#1e293b' : '#64748b',
                                                                }}>
                                                                    {item.label}
                                                                </span>
                                                                <span style={{ fontSize: '9px', fontFamily: 'ui-monospace, monospace', color: '#d1d5db', flexShrink: 0 }}>
                                                                    {item.id}
                                                                </span>
                                                            </label>
                                                        )
                                                    })}
                                                </div>
                                            ))}
                                            <div style={{ height: '8px' }} />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </main>
            </div>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

            {/* 토스트 */}
            {toast && (
                <div
                    className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium"
                    style={{
                        background: toast.ok ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                        border: `1px solid ${toast.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                        color: toast.ok ? '#10b981' : '#ef4444',
                    }}
                >
                    {toast.msg}
                    <button onClick={() => setToast(null)}>
                        <X size={14} />
                    </button>
                </div>
            )}
        </div>
    )
}
