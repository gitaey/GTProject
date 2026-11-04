// 서버 없이 만드는 최소 .xlsx(압축 없는 zip + inlineStr 시트). 내보내기 시험·시연용 — 서식·수식·스타일 없음.
// 엑셀·LibreOffice가 열 수 있는 최소 구성: [Content_Types].xml, _rels/.rels, xl/workbook.xml, xl/_rels/workbook.xml.rels, xl/worksheets/sheet1.xml

function crcTable(): Uint32Array {
    const t = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
        let c = n
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
        t[n] = c >>> 0
    }
    return t
}

export function crc32(bytes: Uint8Array): number {
    const table = crcTable()
    let c = 0xffffffff
    for (let i = 0; i < bytes.length; i++) c = table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
}

interface ZipEntry {
    name: string
    data: Uint8Array
}

function u16(n: number): number[] {
    return [n & 0xff, (n >>> 8) & 0xff]
}
function u32(n: number): number[] {
    return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]
}

/** 압축 없는(stored) zip 바이트 */
export function zipStored(entries: ZipEntry[]): Uint8Array {
    const enc = new TextEncoder()
    const parts: number[][] = []
    const central: number[][] = []
    let offset = 0
    for (const e of entries) {
        const name = Array.from(enc.encode(e.name))
        const crc = crc32(e.data)
        // 로컬 헤더: 일반 비트 11(UTF-8 이름), 압축 0(stored), 시각 0
        const head = [...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(e.data.length), ...u32(e.data.length), ...u16(name.length), ...u16(0), ...name]
        parts.push(head, Array.from(e.data))
        central.push([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(e.data.length), ...u32(e.data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name])
        offset += head.length + e.data.length
    }
    const centralSize = central.reduce((s, c) => s + c.length, 0)
    const end = [...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length), ...u32(centralSize), ...u32(offset), ...u16(0)]
    const out = new Uint8Array(offset + centralSize + end.length)
    let at = 0
    for (const p of parts) {
        out.set(p, at)
        at += p.length
    }
    for (const c of central) {
        out.set(c, at)
        at += c.length
    }
    out.set(end, at)
    return out
}

function esc(s: string): string {
    // XML 1.0에서 허용되지 않는 제어 문자를 지우고 특수 문자를 이스케이프
    return s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function colName(i: number): string {
    let s = ''
    let n = i + 1
    while (n > 0) {
        const r = (n - 1) % 26
        s = String.fromCharCode(65 + r) + s
        n = Math.floor((n - 1) / 26)
    }
    return s
}

/** 첫 행 = 머리글. 값이 number면 숫자 칸, 그 밖은 글자 칸. 엑셀 한 시트 행 한도(1,048,576)·열 한도는 호출 쪽이 지킨다 */
export function buildXlsx(sheetName: string, header: string[], rows: Array<Array<string | number | null>>): Uint8Array {
    const enc = new TextEncoder()
    const cell = (v: string | number | null, r: number, c: number): string => {
        const ref = colName(c) + (r + 1)
        if (v === null || v === '') return ''
        if (typeof v === 'number' && Number.isFinite(v)) return '<c r="' + ref + '"><v>' + v + '</v></c>'
        return '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + esc(String(v)) + '</t></is></c>'
    }
    const sheetRows: string[] = []
    sheetRows.push('<row r="1">' + header.map((h, c) => cell(h, 0, c)).join('') + '</row>')
    rows.forEach((row, i) => sheetRows.push('<row r="' + (i + 2) + '">' + row.map((v, c) => cell(v, i + 1, c)).join('') + '</row>'))
    const xml = (body: string): Uint8Array => enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + body)
    return zipStored([
        {
            name: '[Content_Types].xml',
            data: xml(
                '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
            ),
        },
        {
            name: '_rels/.rels',
            data: xml(
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
            ),
        },
        {
            name: 'xl/workbook.xml',
            data: xml(
                '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="' +
                    esc(sheetName.slice(0, 31)) +
                    '" sheetId="1" r:id="rId1"/></sheets></workbook>',
            ),
        },
        {
            name: 'xl/_rels/workbook.xml.rels',
            data: xml(
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
            ),
        },
        {
            name: 'xl/worksheets/sheet1.xml',
            data: xml('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + sheetRows.join('') + '</sheetData></worksheet>'),
        },
    ])
}
