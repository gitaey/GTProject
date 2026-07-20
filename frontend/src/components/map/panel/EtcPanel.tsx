'use client'

// 기타 기능 패널 - 지도 좌측 사이드바의 '기타(⋯)' 탭에서 렌더링
// 여러 유틸리티 기능을 섹션 단위로 추가할 것

import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'

export default function EtcPanel() {
    const [fileName, setFileName] = useState<string | null>(null)
    const [status, setStatus] = useState<'idle' | 'processing' | 'done' | 'error'>('idle')
    const [errorMsg, setErrorMsg] = useState('')
    // 구분자: 기본값 쉼표, 다중문자(||, \t 등) 지원
    const [delimiter, setDelimiter] = useState(',')
    const fileRef = useRef<HTMLInputElement>(null)

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
                    if (cleaned === '') return cleaned
                    // 숫자 셀은 number 타입으로 변환 → Excel에서 숫자 서식 적용 가능
                    const num = Number(cleaned)
                    return !isNaN(num) && cleaned.trim() !== '' ? num : cleaned
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
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                <span className="text-sm font-semibold text-gray-700">기타 기능</span>
            </div>

            <div className="flex flex-col gap-4 p-4">
                {/* ── CSV → Excel 변환 ── */}
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                    <p className="text-xs font-semibold text-gray-600 mb-3">CSV → Excel 변환</p>

                    <div className="mb-3">
                        <label className="block text-xs text-gray-500 mb-1">구분자</label>
                        <input
                            type="text"
                            value={delimiter}
                            onChange={(e) => setDelimiter(e.target.value)}
                            maxLength={3}
                            placeholder=","
                            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:border-orange-400"
                        />
                    </div>

                    <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-orange-400 hover:bg-orange-50 transition-all">
                        <span className="text-lg text-gray-400">📂</span>
                        <span className="text-xs text-gray-500 mt-1">
                            {fileName ?? 'CSV 파일 선택'}
                        </span>
                        <input
                            ref={fileRef}
                            type="file"
                            accept=".csv"
                            className="hidden"
                            onChange={handleFileChange}
                        />
                    </label>

                    {fileName && status !== 'done' && (
                        <button
                            onClick={handleConvert}
                            disabled={status === 'processing'}
                            className="mt-3 w-full py-2 rounded-lg text-xs font-semibold text-white bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 transition-all"
                        >
                            {status === 'processing' ? '변환 중...' : 'Excel로 변환'}
                        </button>
                    )}

                    {status === 'done' && (
                        <div className="mt-3 flex flex-col gap-2">
                            <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 rounded-lg px-3 py-2">
                                <span>✅</span>
                                <span>변환 완료! 파일이 다운로드 되었습니다.</span>
                            </div>
                            <button
                                onClick={handleReset}
                                className="w-full py-2 rounded-lg text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all"
                            >
                                다른 파일 변환
                            </button>
                        </div>
                    )}

                    {status === 'error' && (
                        <div className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                            ❌ {errorMsg}
                        </div>
                    )}
                </div>
                {/* ── 기능 추가 시 이 아래에 섹션 단위로 작성 ── */}
            </div>
        </div>
    )
}
