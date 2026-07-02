'use client'

// 검색 패널 (주소, 지명, 좌표 검색)
// TODO: 검색 기능 구현
export default function SearchPanel() {
    return (
        <>
            <div className="px-4 py-3 border-b border-gray-100">
                <span className="text-sm font-bold text-gray-800">검색</span>
            </div>
            <div className="flex-1 p-4">
                <input
                    type="text"
                    placeholder="주소, 지명, 좌표 입력..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-orange-400"
                />
            </div>
        </>
    )
}
