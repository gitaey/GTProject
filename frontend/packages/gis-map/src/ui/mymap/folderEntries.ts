// 끌어다 놓은 것(DataTransfer)에서 파일을 꺼낸다 — 폴더는 한 단계만 읽어 안의 파일을 쓴다(하위 폴더는 무시).
// webkitGetAsEntry를 모르는 브라우저는 dt.files를 그대로 쓴다. 이벤트 핸들러가 끝나면 dt.items가 비므로 items는 첫 await 전에 모두 모은다.

export interface DroppedFiles {
    files: File[]
    /** 놓은 폴더 이름들 */
    folders: string[]
    /** 읽지 못한 폴더(권한·브라우저 제한) */
    unreadable: string[]
}

function readAll(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
    return new Promise((resolve, reject) => {
        const out: FileSystemEntry[] = []
        // readEntries는 100개쯤씩 끊겨 오므로 빈 배열이 올 때까지 되풀이한다
        const next = () => reader.readEntries(batch => {
            if (batch.length === 0) resolve(out)
            else { out.push(...batch); next() }
        }, reject)
        next()
    })
}

function fileOf(entry: FileSystemFileEntry): Promise<File> {
    return new Promise((resolve, reject) => entry.file(resolve, reject))
}

export async function filesFromDataTransfer(dt: DataTransfer): Promise<DroppedFiles> {
    const out: DroppedFiles = { files: [], folders: [], unreadable: [] }
    const items = dt.items ? Array.from(dt.items).filter(i => i.kind === 'file') : []
    const supportsEntry = items.length > 0 && typeof items[0].webkitGetAsEntry === 'function'
    if (!supportsEntry) {
        out.files = Array.from(dt.files ?? [])
        return out
    }
    // 동기 구간: 항목마다 entry와 File을 미리 얻는다
    const pairs = items.map(i => ({ entry: i.webkitGetAsEntry(), file: i.getAsFile() }))
    for (const { entry, file } of pairs) {
        if (!entry) {
            if (file) out.files.push(file)
            continue
        }
        if (entry.isFile) {
            try { out.files.push(file ?? await fileOf(entry as FileSystemFileEntry)) } catch { if (file) out.files.push(file) }
            continue
        }
        if (!entry.isDirectory) continue
        out.folders.push(entry.name)
        try {
            const children = await readAll((entry as FileSystemDirectoryEntry).createReader())
            for (const child of children) {
                if (!child.isFile) continue
                try { out.files.push(await fileOf(child as FileSystemFileEntry)) } catch { /* 한 파일을 못 읽어도 나머지는 쓴다 */ }
            }
        } catch {
            out.unreadable.push(entry.name)
        }
    }
    return out
}
