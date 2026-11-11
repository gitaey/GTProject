// 파일 머리 바이트로 엑셀(.xlsx)인지 미리 본다 — 서버에 보내기 전에 "암호가 걸렸다/엑셀이 아니다"를 알려 주려는 것.
// 앞 8바이트만 읽는다(큰 파일을 통째로 읽지 않는다). 읽기 실패는 'unknown' — 판단은 서버가 한다.

export type HeadKind = 'zip' | 'cfb' | 'other' | 'unknown'

/** .xlsx = ZIP(PK\x03\x04). 암호가 걸린 .xlsx·옛 .xls는 CFB(D0 CF 11 E0) */
export function classifyHead(bytes: Uint8Array): HeadKind {
    if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return 'zip'
    if (bytes.length >= 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return 'cfb'
    return 'other'
}

export async function sniffHead(file: Blob): Promise<HeadKind> {
    try {
        return classifyHead(new Uint8Array(await file.slice(0, 8).arrayBuffer()))
    } catch {
        return 'unknown'
    }
}
