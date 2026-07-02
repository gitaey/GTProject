'use client'

// 측정 패널 (거리, 면적 측정 결과 표시)
// TODO: 측정 결과 목록 구현
export default function MeasurePanel() {
    return (
        <>
            <div className="px-4 py-3 border-b border-gray-100">
                <span className="text-sm font-bold text-gray-800">측정</span>
            </div>
            <div className="flex-1 p-4 text-sm text-gray-400">
                측정 결과가 여기에 표시됩니다.
            </div>
        </>
    )
}
