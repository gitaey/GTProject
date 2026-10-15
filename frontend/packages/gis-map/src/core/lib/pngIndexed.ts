// 팔레트(8비트 인덱스) PNG를 DOM·캔버스 없이 만든다. React·ol·브라우저 API 없음 — Node에서도 같은 바이트가 나온다.
// 풍속 오버레이 이미지가 쓴다: 380x372 격자 한 장이 약 140KB(RGBA 캔버스 PNG의 1/4), base64 data URL로 ol ImageStatic에 넘긴다.
// zlib은 압축하지 않는 "저장 블록"으로 감싼다(유효한 deflate) — 압축 라이브러리 없이도 PNG 표준을 따른다.

function makeCrcTable(): Uint32Array {
    const table = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
        let c = n
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
        table[n] = c >>> 0
    }
    return table
}

function crc32(table: Uint32Array, bytes: Uint8Array): number {
    let c = 0xffffffff
    for (let i = 0; i < bytes.length; i++) c = table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
}

function adler32(bytes: Uint8Array): number {
    let a = 1
    let b = 0
    for (let i = 0; i < bytes.length; i++) {
        a = (a + bytes[i]) % 65521
        b = (b + a) % 65521
    }
    return ((b << 16) | a) >>> 0
}

function u32be(n: number): number[] {
    return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]
}

/** 팔레트 PNG. indices는 width*height개(행 우선, 위 → 아래), palette는 RGB 3바이트씩, alpha는 팔레트 칸마다 1바이트(0 = 투명) */
export function encodeIndexedPng(width: number, height: number, indices: Uint8Array, palette: Uint8Array, alpha: Uint8Array): Uint8Array {
    if (indices.length < width * height) throw new Error('indices가 width*height보다 짧다')
    const table = makeCrcTable()

    // 행마다 필터 바이트 0(없음) + 인덱스
    const raw = new Uint8Array((width + 1) * height)
    for (let y = 0; y < height; y++) {
        raw[y * (width + 1)] = 0
        raw.set(indices.subarray(y * width, (y + 1) * width), y * (width + 1) + 1)
    }
    // zlib: 헤더 78 01 + 저장 블록(최대 65535바이트) + adler32
    const blocks = Math.max(1, Math.ceil(raw.length / 65535))
    const z = new Uint8Array(2 + raw.length + blocks * 5 + 4)
    let p = 0
    z[p++] = 0x78
    z[p++] = 0x01
    for (let b = 0; b < blocks; b++) {
        const start = b * 65535
        const len = Math.min(65535, raw.length - start)
        z[p++] = b === blocks - 1 ? 1 : 0
        z[p++] = len & 0xff
        z[p++] = (len >>> 8) & 0xff
        z[p++] = ~len & 0xff
        z[p++] = (~len >>> 8) & 0xff
        z.set(raw.subarray(start, start + len), p)
        p += len
    }
    z.set(u32be(adler32(raw)), p)

    const chunks: Uint8Array[] = []
    const chunk = (type: string, data: Uint8Array) => {
        const out = new Uint8Array(12 + data.length)
        out.set(u32be(data.length), 0)
        for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
        out.set(data, 8)
        out.set(u32be(crc32(table, out.subarray(4, 8 + data.length))), 8 + data.length)
        chunks.push(out)
    }
    const ihdr = new Uint8Array(13)
    ihdr.set(u32be(width), 0)
    ihdr.set(u32be(height), 4)
    ihdr[8] = 8 // 비트 깊이
    ihdr[9] = 3 // 색 유형: 팔레트
    chunk('IHDR', ihdr)
    chunk('PLTE', palette)
    chunk('tRNS', alpha)
    chunk('IDAT', z.subarray(0, p + 4))
    chunk('IEND', new Uint8Array(0))

    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    let total = sig.length
    chunks.forEach(c => { total += c.length })
    const png = new Uint8Array(total)
    png.set(sig, 0)
    let off = sig.length
    chunks.forEach(c => { png.set(c, off); off += c.length })
    return png
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** 바이트 → "data:<mime>;base64,..." (btoa 없이) */
export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
    const parts: string[] = []
    let chunk = ''
    for (let i = 0; i < bytes.length; i += 3) {
        const a = bytes[i]
        const b = i + 1 < bytes.length ? bytes[i + 1] : 0
        const c = i + 2 < bytes.length ? bytes[i + 2] : 0
        chunk += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)]
            + (i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)] : '=')
            + (i + 2 < bytes.length ? B64[c & 63] : '=')
        if (chunk.length >= 8192) { parts.push(chunk); chunk = '' }
    }
    parts.push(chunk)
    return 'data:' + mime + ';base64,' + parts.join('')
}
