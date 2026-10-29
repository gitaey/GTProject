// 짝 Spring 백엔드 응답 봉투 { success, message, data } 처리.
import type { GisMapHost } from '../../core'

export interface ApiEnvelope<T> {
    success: boolean
    message: string
    data: T
}

/**
 * 봉투를 풀어 data를 돌려준다. success가 false면 message로 Error를 던진다(HTTP 상태는 보지 않음 — 옛 apiFetch와 같음).
 * message가 없으면 fallbackMessage(옛 화면의 `json.message ?? '업로드 실패'` 같은 기본 문구)
 */
export async function readEnvelope<T>(res: Response, fallbackMessage?: string): Promise<T> {
    let json: ApiEnvelope<T>
    try {
        json = (await res.json()) as ApiEnvelope<T>
    } catch {
        // 본문이 JSON이 아님(예: 프록시가 413·502로 돌려준 HTML) — "Unexpected token <" 대신 읽을 수 있는 문구
        throw new Error(res.status === 413 ? '파일이 너무 큽니다(서버 한도)' : fallbackMessage ?? `서버 응답을 읽을 수 없습니다(HTTP ${res.status})`)
    }
    if (!json.success) throw new Error(json.message ?? fallbackMessage)
    return json.data
}

/**
 * 봉투 없는 파일 응답(샘플·실패 행 엑셀)을 Blob으로. HTTP 오류면 봉투의 message(없으면 fallbackMessage)로 Error를 던진다.
 * 오류 본문이 JSON이 아니어도(프록시 오류 페이지 등) fallbackMessage로 던진다
 */
export async function readBlob(res: Response, fallbackMessage: string): Promise<Blob> {
    if (!res.ok) {
        let message = fallbackMessage
        try {
            const json = (await res.json()) as Partial<ApiEnvelope<unknown>>
            if (typeof json.message === 'string' && json.message) message = json.message
        } catch {
            // 본문이 JSON이 아님 — 기본 문구
        }
        throw new Error(message)
    }
    return res.blob()
}

/** 호출 시점의 apiBaseUrl + 경로('' 이면 상대 경로) */
export function apiUrl(host: GisMapHost, path: string): string {
    return host.endpoints.apiBaseUrl + path
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
/** 한 번에 풀 base64 글자 수(4의 배수) — 큰 문자열도 한 번에 atob하지 않는다 */
const BASE64_CHUNK = 65536

/**
 * base64 글자 → Blob. `atob`+`Uint8Array`만 쓰고(새 의존성 없음) 청크로 나눠 풀어 큰 파일에서도 스택·메모리가 터지지 않는다.
 * 공백·줄바꿈은 무시하고, 끝의 `=` 패딩이 없어도 읽는다
 */
export function base64ToBlob(base64: string, mime: string = XLSX_MIME): Blob {
    const clean = base64.replace(/\s+/g, '')
    const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0
    const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4) - pad)
    let at = 0
    for (let i = 0; i < clean.length; i += BASE64_CHUNK) {
        const bin = atob(clean.slice(i, i + BASE64_CHUNK))
        for (let j = 0; j < bin.length; j++) bytes[at++] = bin.charCodeAt(j)
    }
    return new Blob([bytes], { type: mime })
}

/**
 * `Content-Disposition`에서 파일 이름. `filename*=UTF-8''…`(퍼센트 인코딩)을 먼저, 없으면 `filename="…"`, 둘 다 없거나 못 읽으면 fallback.
 * 경로 구분자는 `_`로 바꿔 저장 위치를 벗어나지 못하게 한다
 */
export function dispositionFileName(header: string | null | undefined, fallback: string): string {
    if (!header) return fallback
    const clean = (name: string) => name.replace(/[\\/]+/g, '_').trim()
    const star = /filename\*\s*=\s*([^;]+)/i.exec(header)
    if (star) {
        // RFC 5987: charset'언어'값 — 값만 퍼센트 해제
        const value = star[1].trim().replace(/^[^']*'[^']*'/, '')
        try {
            const name = clean(decodeURIComponent(value))
            if (name) return name
        } catch {
            // 잘못된 퍼센트 열 — 다음 후보
        }
    }
    const plain = /filename\s*=\s*("([^"]*)"|[^;]+)/i.exec(header)
    if (plain) {
        const name = clean((plain[2] ?? plain[1]).trim())
        if (name) return name
    }
    return fallback
}
