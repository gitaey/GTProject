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
