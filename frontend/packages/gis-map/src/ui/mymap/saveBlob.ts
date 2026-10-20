// Blob을 파일로 저장한다(브라우저가 내려받기 창을 띄움). 소스는 바이트만 주고, 저장은 화면(ui) 몫이다.
// Firefox 등은 클릭 직후 주소를 해제하면 내려받기가 취소될 수 있어 해제를 늦춘다(링크는 문서에 붙였다가 바로 뗀다).
const REVOKE_DELAY_MS = 30000

export function saveBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob)
    try {
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        a.rel = 'noopener'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
    } catch (e) {
        // 클릭이 실패하면 늦출 이유가 없다
        URL.revokeObjectURL(url)
        throw e
    }
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
}
