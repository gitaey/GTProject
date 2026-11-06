'use client'

import { CheckCircle2, XCircle } from 'lucide-react'
import { serverLabel, type ConnectionAttempt } from './connection'

interface AttemptResultProps {
    attempt: ConnectionAttempt | null
    /** 요청 자체가 실패했을 때(403·429·네트워크 등)의 문구 */
    error?: string | null
    mode?: 'test' | 'connect'
}

const HINTS: Record<string, string[]> = {
    URL_BLOCKED: ['링크로컬·클라우드 메타데이터 주소(169.254.x.x 등)는 막혀 있습니다.'],
    DNS_FAILED: ['주소 철자를 확인하세요.', '백엔드 서버에서 이 이름이 풀리는지(내부 DNS) 확인하세요.'],
    CONNECT_FAILED: ['포트·방화벽을 확인하세요.', '백엔드 서버에서 이 주소로 나갈 수 있는지 확인하세요.'],
    TIMEOUT: ['서버가 느리거나 방화벽이 패킷을 버리고 있을 수 있습니다.'],
    TLS_FAILED: ['자체 서명 인증서면 "인증서 검증 안 함"을 켜세요.', 'http와 https가 바뀌었는지 확인하세요.'],
    REDIRECTED: ['그 주소로 다시 입력하세요(자동으로 따라가지 않습니다).'],
    AUTH_FAILED: [
        '아이디와 비밀번호가 맞는지 확인하세요.',
        'LDAP 등 외부 인증을 쓰는 서버면 REST에 Basic 인증이 허용되어 있어야 합니다.',
    ],
    FORBIDDEN: ['GeoServer 관리자(ROLE_ADMINISTRATOR) 역할 계정이 필요합니다.'],
    NOT_FOUND: ['주소 끝 경로(보통 /geoserver)를 확인하세요.'],
    NOT_GEOSERVER: ['로그인 페이지나 다른 웹 서버 응답일 수 있습니다.'],
    SERVER_ERROR: ['GeoServer 로그를 확인하세요.'],
    RESPONSE_TOO_LARGE: ['GeoServer가 아닌 주소일 가능성이 큽니다.'],
}

const TITLES: Record<string, string> = {
    INPUT_INVALID: '입력값을 확인하세요',
    URL_INVALID: '주소 형식이 올바르지 않습니다',
    URL_BLOCKED: '이 주소로는 연결할 수 없습니다',
    DNS_FAILED: '서버 이름을 찾을 수 없습니다',
    CONNECT_FAILED: '서버에 연결할 수 없습니다',
    TIMEOUT: '응답 시간이 초과되었습니다',
    TLS_FAILED: '인증서를 확인할 수 없습니다',
    AUTH_FAILED: '인증 실패 (HTTP 401)',
    FORBIDDEN: '이 계정에는 REST 관리 권한이 없습니다 (HTTP 403)',
    NOT_FOUND: '이 주소에서 GeoServer REST를 찾지 못했습니다 (HTTP 404)',
    NOT_GEOSERVER: 'GeoServer 응답이 아닙니다',
    RESPONSE_TOO_LARGE: '응답이 너무 큽니다',
}

/** 서버 message는 "제목\n힌트" 한 문자열 — 첫 줄바꿈에서 나눈다(없으면 전체가 제목) */
function splitMessage(message: string | null | undefined): { title: string; hints: string[] } {
    const text = (message ?? '').trim()
    const i = text.indexOf('\n')
    if (i < 0) return { title: text, hints: [] }
    const hints = text.slice(i + 1).split('\n').map(h => h.trim()).filter(h => h.length > 0)
    return { title: text.slice(0, i).trim(), hints }
}

/** 서버가 준 제목이 있으면 그것, 없을 때만 프론트 표(폴백) */
function fallbackTitle(a: ConnectionAttempt): string {
    if (a.reason === 'REDIRECTED') return `서버가 다른 주소로 보냅니다: ${a.redirectLocation ?? '(주소 없음)'}`
    if (a.reason === 'SERVER_ERROR') return `GeoServer 서버 오류 (HTTP ${a.httpStatus ?? '?'})`
    return TITLES[a.reason] ?? '연결하지 못했습니다'
}

/** 연결 시험·연결 결과 상자 — 이유(reason)마다 제목과 해결 힌트가 다르다. 입력값(비밀번호 등)은 보여 주지 않는다 */
export default function AttemptResult({ attempt, error, mode = 'test' }: AttemptResultProps) {
    if (!attempt && !error) return null

    if (!attempt) {
        return (
            <Box tone="err" icon={<XCircle size={20} />} title="요청하지 못했습니다">
                <span>{error}</span>
            </Box>
        )
    }

    const hints: string[] = []
    let title: string
    if (attempt.ok) {
        const v = attempt.version ? `GeoServer ${attempt.version}` : '버전 정보 없음'
        title = mode === 'connect' ? `연결했습니다 — ${v}` : `연결할 수 있습니다 — ${v}`
        if (attempt.urlAdjusted && attempt.normalizedUrl) {
            hints.push(`입력한 주소를 ${attempt.normalizedUrl}(으)로 고쳐서 시도했습니다.`)
        }
        if (!attempt.version) hints.push('GeoServer 버전은 확인하지 못했지만 REST 접속은 가능합니다.')
    } else {
        // 서버의 "제목\n힌트"를 우선 쓰고, 비어 있을 때만 프론트 표로 채운다(제목 중복 방지)
        const server = splitMessage(attempt.message)
        title = server.title || fallbackTitle(attempt)
        hints.push(...(server.hints.length > 0 ? server.hints : HINTS[attempt.reason] ?? []))
    }

    return (
        <Box tone={attempt.ok ? 'ok' : 'err'} icon={attempt.ok ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
            title={title}>
            {hints.length > 0 && (
                <ul className="mt-1 pl-4 text-xs list-disc" style={{ color: 'var(--text-muted)' }}>
                    {hints.map(h => <li key={h}>{h}</li>)}
                </ul>
            )}
            {attempt.ok && attempt.normalizedUrl && (
                <div className="mt-1 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{serverLabel(attempt.normalizedUrl)}</div>
            )}
        </Box>
    )
}

interface BoxProps {
    tone: 'ok' | 'err' | 'warn'
    icon: React.ReactNode
    title: string
    children?: React.ReactNode
}

function Box({ tone, icon, title, children }: BoxProps) {
    const color = tone === 'ok' ? '#10b981' : tone === 'warn' ? '#d97706' : '#ef4444'
    const bg = tone === 'ok' ? 'rgba(16,185,129,0.1)' : tone === 'warn' ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.08)'
    const bd = tone === 'ok' ? 'rgba(16,185,129,0.25)' : tone === 'warn' ? 'rgba(245,158,11,0.4)' : 'rgba(239,68,68,0.25)'
    return (
        <div role={tone === 'ok' ? 'status' : 'alert'} className="flex items-start gap-2.5 px-3.5 py-3 rounded-[10px] text-[13px] leading-relaxed"
            style={{ background: bg, border: `1px solid ${bd}`, color: 'var(--text-primary)' }}>
            <span className="shrink-0 mt-0.5" style={{ color }}>{icon}</span>
            <div className="min-w-0 break-words">
                <div className="font-semibold">{title}</div>
                {children}
            </div>
        </div>
    )
}

export { Box as AlertBox }
