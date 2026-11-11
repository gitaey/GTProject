// 끌어다 놓은 것(DataTransfer)에서 파일을 꺼낸다 — 폴더는 읽지 않는다(폴더째 올리기는 지원하지 않는다). 폴더를 놓았으면 이름만 알려 준다.
// webkitGetAsEntry를 모르는 브라우저는 dt.files를 그대로 쓴다. 이벤트 핸들러가 끝나면 dt.items가 비므로 items는 첫 await 전에 모두 모은다.

export interface DroppedFiles {
    files: File[]
    /** 놓은 폴더 이름들(안의 파일은 읽지 않는다) */
    folders: string[]
}

function fileOf(entry: FileSystemFileEntry): Promise<File> {
    return new Promise((resolve, reject) => entry.file(resolve, reject))
}

export async function filesFromDataTransfer(dt: DataTransfer): Promise<DroppedFiles> {
    const out: DroppedFiles = { files: [], folders: [] }
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
        if (entry.isDirectory) out.folders.push(entry.name)
    }
    return out
}
