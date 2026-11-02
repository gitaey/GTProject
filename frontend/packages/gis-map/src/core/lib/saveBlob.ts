// Blob을 파일로 저장한다(브라우저가 내려받기 창을 띄움). 소스는 바이트만 주고, 저장은 화면(ui)·호스트 몫이다.
// Firefox 등은 클릭 직후 주소를 해제하면 내려받기가 취소될 수 있어 해제를 늦춘다(링크는 문서에 붙였다가 바로 뗀다).
// UMD(JSP)에서도 GisMap.saveBlob으로 쓴다. doc을 주면 그 문서(iframe 등)에 링크를 붙인다.
const REVOKE_DELAY_MS = 30000

export function saveBlob(blob: Blob, fileName: string, doc?: Document): void {
    const d = doc ?? document
    const url = URL.createObjectURL(blob)
    try {
        const a = d.createElement('a')
        a.href = url
        a.download = fileName
        a.rel = 'noopener'
        d.body.appendChild(a)
        a.click()
        d.body.removeChild(a)
    } catch (e) {
        // 클릭이 실패하면 늦출 이유가 없다
        URL.revokeObjectURL(url)
        throw e
    }
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
}
