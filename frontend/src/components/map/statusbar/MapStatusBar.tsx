'use client'

// 지도 하단 상태바 컴포넌트
// 좌표, 좌표계, 축척, 활성 도구, 레이어 수 표시
// TODO: 실제 지도 이벤트와 연동하여 좌표/축척 동적으로 표시
export default function MapStatusBar() {
    return (
        <div className="hidden md:flex items-center h-7 px-3 bg-white border-t border-gray-200 flex-shrink-0 text-xs text-gray-400"
            style={{ fontFamily: "'Consolas', 'Courier New', monospace", fontVariantNumeric: 'tabular-nums' }}>

            {/* 연결 상태 */}
            <div className="flex items-center gap-1.5 pr-3 border-r border-gray-200">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>연결됨</span>
            </div>

            {/* 경위도 좌표 */}
            <div className="flex items-center gap-1.5 px-3 border-r border-gray-200">
                <span>경위도</span>
                <span className="text-amber-700 font-semibold">127.2891, 36.4801</span>
            </div>

            {/* EPSG:5186 좌표 */}
            <div className="flex items-center gap-1.5 px-3 border-r border-gray-200">
                <span>EPSG:5186</span>
                <span className="text-amber-700 font-semibold">203847, 418923</span>
            </div>

            {/* 축척 */}
            <div className="flex items-center gap-1.5 px-3 border-r border-gray-200">
                <span>축척</span>
                <span className="text-amber-700 font-semibold">1 : 50,000</span>
            </div>

            <div className="flex-1" />

            {/* 활성 도구 */}
            <div className="flex items-center gap-1.5 px-3 border-r border-gray-200">
                <span className="px-2 py-0.5 bg-orange-50 text-orange-500 font-semibold rounded">
                    ⬤ 포인트 그리기
                </span>
            </div>

            {/* 활성 레이어 수 */}
            <div className="flex items-center gap-1.5 pl-3">
                <span>레이어</span>
                <span className="text-amber-700 font-semibold">2 / 7</span>
            </div>
        </div>
    )
}
