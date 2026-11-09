// 브라우저 저장소(localStorage) 기반 시작 화면 소스 — 백엔드 없이 쓰는 호스트(공개 데모·UMD 정적 예제·붙이기)용 대체.
// 패키지에서 localStorage를 만지는 파일은 react/usePersistentExpanded.ts와 이 파일뿐이다(감사 7번 허용 목록).
// 계정 저장(restStartView)과 섞어 쓰지 않는다 — sources 병합은 뒤에 준 것이 이긴다.
// 동기 소스라 엔진이 첫 그림 전에 바로 적용한다(보류 없음). 쓰기 실패(저장 공간 부족·사생활 보호 모드)는 throw → 카드 "저장하지 못했습니다".
import type { GisMapStartView, StartViewSource, StoredStartView } from '../../core'

/** key는 문자열이거나, 호출 때마다 읽는 함수(로그인 사용자별로 나누려면 () => 'prefix:' + userId) */
export function browserStartViewSource(key: string | (() => string)): StartViewSource {
    const keyOf = (): string => (typeof key === 'function' ? key() : key)
    return {
        scope: 'browser',
        load(): StoredStartView | null {
            let raw: string | null
            try {
                raw = localStorage.getItem(keyOf())
            } catch {
                return null
            }
            if (!raw) return null
            try {
                const view = JSON.parse(raw) as GisMapStartView
                // 검사는 엔진(parseStartView)이 한다 — 깨진 값은 invalid로 보인다
                return { view, updatedAt: typeof view?.savedAt === 'string' ? view.savedAt : null }
            } catch {
                // JSON이 아님: 검사에서 실패하도록 형식이 틀린 값을 넘긴다
                return { view: null as unknown as GisMapStartView, updatedAt: null }
            }
        },
        save(value: GisMapStartView): StoredStartView {
            localStorage.setItem(keyOf(), JSON.stringify(value))
            return { view: value, updatedAt: value.savedAt }
        },
        clear(): void {
            localStorage.removeItem(keyOf())
        },
    }
}
