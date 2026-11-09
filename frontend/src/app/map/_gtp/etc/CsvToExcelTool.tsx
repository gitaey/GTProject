'use client'

// CSV → Excel 변환 도구. 상태·함수(handleFileChange·handleConvert·handleReset)는 옛 EtcPanel.tsx에서 그대로 옮겼다(동작 변경 없음) — 겉모양(JSX)만 새 톤.

import { useState, useRef, type DragEvent } from 'react'
import * as XLSX from 'xlsx'
import { Upload } from 'lucide-react'
import { BTN_PRIMARY, BTN_SECONDARY, FIELD, FIELD_LABEL, NoticeBox } from './EtcParts'

export default function CsvToExcelTool() {
    const [fileName, setFileName] = useState<string | null>(null)
    const [status, setStatus] = useState<'idle' | 'processing' | 'done' | 'error'>('idle')
    const [errorMsg, setErrorMsg] = useState('')
    // 구분자: 기본값 쉼표, 다중문자(||, \t 등) 지원
    const [delimiter, setDelimiter] = useState(',')
    const fileRef = useRef<HTMLInputElement>(null)
    const [over, setOver] = useState(false)

    // 끌어 놓은 파일을 입력칸에 넣어 주면 handleConvert가 그대로 fileRef에서 읽는다
    function handleDrop(e: DragEvent<HTMLLabelElement>) {
        e.preventDefault()
        setOver(false)
        if (status === 'processing') return
        const file = e.dataTransfer.files?.[0]
        if (!file || !fileRef.current) return
        if (!/\.csv$/i.test(file.name)) {
            setErrorMsg('CSV 파일(.csv)만 올릴 수 있습니다.')
            setStatus('error')
            return
        }
        fileRef.current.files = e.dataTransfer.files
        setFileName(file.name)
        setStatus('idle')
        setErrorMsg('')
    }

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        setFileName(file.name)
        setStatus('idle')
        setErrorMsg('')
    }

    async function handleConvert() {
        const file = fileRef.current?.files?.[0]
        if (!file) return

        setStatus('processing')
        setErrorMsg('')

        try {
            // EUC-KR 인코딩으로 읽기 (한글 CSV 대응)
            const buffer = await file.arrayBuffer()
            const text = new TextDecoder('euc-kr').decode(buffer)

            const sep = delimiter || ','

            // 빈 줄 제거 후 구분자로 분리
            // xlsx의 FS 옵션은 단일 문자만 지원하므로 직접 파싱
            const rows = text.split(/\r?\n/).filter((line) => line.trim() !== '')
            const data = rows.map((line) =>
                line.split(sep).map((cell) => {
                    // 앞뒤 따옴표 제거
                    const cleaned = cell.replace(/^"|"$/g, '')
                    if (cleaned === '' || cleaned.trim() === '') return cleaned
                    // 긴 번호(PNU 등)·앞자리 0 코드는 숫자로 바꾸면 값이 깨지므로 문자열 유지
                    if (/^-?\d{12,}(\.\d+)?$/.test(cleaned) || /^-?0\d+$/.test(cleaned)) return cleaned
                    // 그 외 숫자 셀은 number 타입으로 변환 → Excel에서 숫자 서식 적용 가능
                    const num = Number(cleaned)
                    return !isNaN(num) ? num : cleaned
                })
            )

            const ws = XLSX.utils.aoa_to_sheet(data)
            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
            const xlsxName = file.name.replace(/\.csv$/i, '.xlsx')
            XLSX.writeFile(wb, xlsxName)
            setStatus('done')
        } catch (e) {
            setErrorMsg(e instanceof Error ? e.message : '변환 중 오류가 발생했습니다.')
            setStatus('error')
        }
    }

    function handleReset() {
        setFileName(null)
        setStatus('idle')
        setErrorMsg('')
        if (fileRef.current) fileRef.current.value = ''
    }

    return (
        <div className="flex flex-col gap-2">
            <div>
                <label htmlFor="etc-csv-delimiter" className={FIELD_LABEL}>구분자</label>
                <input
                    id="etc-csv-delimiter"
                    type="text"
                    value={delimiter}
                    onChange={(e) => setDelimiter(e.target.value)}
                    maxLength={3}
                    placeholder=","
                    className={FIELD}
                />
            </div>

            <div className="relative">
                <input
                    id="etc-csv-file"
                    ref={fileRef}
                    type="file"
                    accept=".csv"
                    className="peer sr-only"
                    onChange={handleFileChange}
                />
                <label
                    htmlFor="etc-csv-file"
                    onDragOver={(e) => { e.preventDefault(); if (status !== 'processing') setOver(true) }}
                    onDragLeave={() => setOver(false)}
                    onDrop={handleDrop}
                    className={`flex cursor-pointer flex-col items-center gap-1 rounded-[7px] border-[1.5px] border-dashed px-2.5 py-3.5 text-center transition-colors hover:border-[#F26722] hover:bg-[#FFF7ED] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#F26722] ${over ? 'border-[#F26722] bg-[#FFF7ED] text-[#F26722]' : 'border-[#D1D5DC] text-gray-400'}`}
                >
                    <Upload size={16} aria-hidden />
                    <span className="max-w-full break-all text-[11.5px] font-semibold text-gray-700">{fileName ?? 'CSV 파일을 끌어 놓거나 눌러서 선택'}</span>
                    <small className="text-[10.5px]">EUC-KR(한글) CSV</small>
                </label>
            </div>

            {fileName && status !== 'done' && (
                <button type="button" onClick={handleConvert} disabled={status === 'processing'} className={BTN_PRIMARY}>
                    {status === 'processing' ? '변환 중...' : 'Excel로 변환'}
                </button>
            )}

            {status === 'done' && (
                <div className="flex flex-col gap-2">
                    <NoticeBox tone="ok">변환 완료! 파일이 다운로드 되었습니다.</NoticeBox>
                    <button type="button" onClick={handleReset} className={BTN_SECONDARY}>
                        다른 파일 변환
                    </button>
                </div>
            )}

            {status === 'error' && <NoticeBox tone="err" alert>{errorMsg}</NoticeBox>}
        </div>
    )
}
