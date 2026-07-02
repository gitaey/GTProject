'use client'

// 그리기 도구 패널
// TODO: 그리기 도구 목록 및 옵션 구현
export default function DrawPanel() {
    return (
        <>
            <div className="px-4 py-3 border-b border-gray-100">
                <span className="text-sm font-bold text-gray-800">그리기</span>
            </div>
            <div className="flex-1 p-4 text-sm text-gray-400">
                그리기 도구 옵션
            </div>
        </>
    )
}
