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
    const json = (await res.json()) as ApiEnvelope<T>
    if (!json.success) throw new Error(json.message ?? fallbackMessage)
    return json.data
}

/** 호출 시점의 apiBaseUrl + 경로('' 이면 상대 경로) */
export function apiUrl(host: GisMapHost, path: string): string {
    return host.endpoints.apiBaseUrl + path
}
