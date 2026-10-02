// 클래스 이름 합치기 헬퍼. 참이 아닌 값(false·null·undefined·'')은 버리고 공백 하나로 잇는다.
// 조건부 클래스는 템플릿 문자열 대신 cx('gm-a', 조건 && 'gm-b')로 쓴다(감사 v2 8번이 문자열 토큰을 검사할 수 있게).
export type ClassValue = string | false | null | undefined

export function cx(...values: ClassValue[]): string {
    let out = ''
    for (const v of values) {
        if (!v) continue
        out = out ? `${out} ${v}` : v
    }
    return out
}
