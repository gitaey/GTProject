// 의존성 없는 최소 PDF 생성(순수 함수, DOM 없음): JPEG 한 장을 한 쪽짜리 PDF에 꽉 채워 넣는다.
// 객체 6개: 1 Catalog · 2 Pages · 3 Page · 4 Contents(그림 배치) · 5 Image XObject(/DCTDecode = JPEG 그대로) · 6 Info(제목·만든 날짜).
// 글자는 그림 안에 있다(선택·검색 안 됨) — 한글 글꼴을 PDF에 넣지 않는 대신의 대가.

export interface MinimalPdfOptions {
    /** 문서 속성의 제목(한글 가능 — UTF-16BE 16진 문자열로 쓴다) */
    title?: string
    /** 문서 속성의 만든 날짜(UTC로 기록) */
    created?: Date
}

const MM_TO_PT = 72 / 25.4

/** PDF 숫자(소수 둘째 자리까지, 불필요한 0 제거) */
function pdfNumber(n: number): string {
    return String(Number(n.toFixed(2)))
}

function ascii(text: string): Uint8Array {
    const out = new Uint8Array(text.length)
    for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff
    return out
}

function utf16beHex(text: string): string {
    let hex = 'FEFF'
    for (let i = 0; i < text.length; i++) hex += text.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0')
    return '<' + hex + '>'
}

function pdfDate(d: Date): string {
    const p = (n: number, w = 2): string => String(n).padStart(w, '0')
    return `D:${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
}

/** JPEG 바이트가 JPEG인지(SOI 표시 FF D8) */
export function isJpeg(bytes: Uint8Array): boolean {
    return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8
}

/**
 * @param jpeg RGB JPEG 바이트(캔버스 toBlob('image/jpeg') 결과)
 * @param pxW·pxH JPEG 픽셀 크기
 * @param pageWidthMm·pageHeightMm 용지 크기(mm)
 */
export function minimalPdf(
    jpeg: Uint8Array, pxW: number, pxH: number, pageWidthMm: number, pageHeightMm: number, opts: MinimalPdfOptions = {},
): Uint8Array {
    if (!isJpeg(jpeg)) throw new Error('[gis-map] minimalPdf: JPEG 데이터가 아니다')
    if (!(pxW > 0) || !(pxH > 0) || !(pageWidthMm > 0) || !(pageHeightMm > 0)) throw new Error('[gis-map] minimalPdf: 크기가 올바르지 않다')
    const w = pdfNumber(pageWidthMm * MM_TO_PT)
    const h = pdfNumber(pageHeightMm * MM_TO_PT)
    const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`

    const info: string[] = ['/Producer (gis-map)']
    if (opts.title) info.push('/Title ' + utf16beHex(opts.title))
    if (opts.created) info.push('/CreationDate (' + pdfDate(opts.created) + ')')

    // 조각을 차례로 쌓으며 각 객체의 시작 위치(offset)를 적는다
    const chunks: Uint8Array[] = []
    const offsets: number[] = []
    let length = 0
    const push = (bytes: Uint8Array): void => {
        chunks.push(bytes)
        length += bytes.length
    }
    const text = (s: string): void => push(ascii(s))
    const begin = (n: number): void => {
        offsets[n] = length
        text(`${n} 0 obj\n`)
    }

    text('%PDF-1.4\n')
    push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])) // 바이너리 파일 표시(%âãÏÓ)
    begin(1)
    text('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')
    begin(2)
    text('<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n')
    begin(3)
    text(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>\nendobj\n`)
    begin(4)
    text(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`)
    begin(5)
    text(`<< /Type /XObject /Subtype /Image /Width ${Math.round(pxW)} /Height ${Math.round(pxH)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`)
    push(jpeg)
    text('\nendstream\nendobj\n')
    begin(6)
    text(`<< ${info.join(' ')} >>\nendobj\n`)

    const xrefAt = length
    text('xref\n0 7\n0000000000 65535 f \n')
    for (let n = 1; n <= 6; n++) text(String(offsets[n]).padStart(10, '0') + ' 00000 n \n')
    text(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`)

    const out = new Uint8Array(length)
    let pos = 0
    for (const c of chunks) {
        out.set(c, pos)
        pos += c.length
    }
    return out
}
