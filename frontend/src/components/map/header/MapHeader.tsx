'use client'

// 지도 상단 헤더 컴포넌트
// 로고, 검색창, 주요 액션 버튼 포함
export default function MapHeader() {
    return (
        <div className="flex items-center gap-3 h-12 px-4 bg-white border-b border-gray-200 shadow-sm flex-shrink-0">

            {/* 로고 - NavLeft(w-14) + PanelLeft(w-64) 너비에 맞춤 */}
            <div className="flex items-center gap-2 font-bold text-sm text-gray-800 whitespace-nowrap w-[282px] flex-shrink-0">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm text-white"
                    style={{ background: 'linear-gradient(135deg, #F26722 0%, #E04E0A 100%)', boxShadow: '0 2px 6px rgba(242,103,34,0.35)' }}>
                    🗺
                </div>
                GT-Map
                <span className="text-xs font-normal text-gray-400">GIS</span>
            </div>

            {/* 검색창 */}
            <div className="relative flex-1 max-w-xs ml-5">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
                <input
                    type="text"
                    placeholder="통합 검색"
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg outline-none
                        focus:border-orange-400 focus:ring-2 focus:ring-orange-50 transition-all"
                />
            </div>

            {/* 우측 액션 */}
            <div className="hidden md:flex items-center gap-2 ml-auto">
                
            </div>
        </div>
    )
}
