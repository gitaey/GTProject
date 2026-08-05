'use client'

// 지도 위 텍스트 라벨 입력 오버레이
// drawStore의 textInput 상태를 읽어 해당 픽셀 위치에 인풋 박스 표시
import { useEffect, useRef } from 'react'
import { useDrawStore } from '@/stores/map/drawStore'

export default function TextInputOverlay() {
    const { textInput, hideTextInput } = useDrawStore()
    const inputRef = useRef<HTMLInputElement>(null)

    // 오버레이가 열릴 때 포커스
    useEffect(() => {
        if (textInput) {
            setTimeout(() => inputRef.current?.focus(), 50)
        }
    }, [textInput])

    if (!textInput) return null

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Enter') {
            const value = inputRef.current?.value ?? ''
            textInput!.onSubmit(value)
            hideTextInput()
        } else if (e.key === 'Escape') {
            hideTextInput()
        }
    }

    function handleBlur() {
        const value = inputRef.current?.value ?? ''
        if (value.trim()) {
            textInput!.onSubmit(value)
        }
        hideTextInput()
    }

    return (
        <div
            className="absolute z-50 pointer-events-none"
            style={{ left: textInput.x, top: textInput.y }}
        >
            {/* 인풋 박스: 지도 위에 표시 */}
            <div className="pointer-events-auto transform -translate-x-1/2 -translate-y-full mb-2">
                <div className="bg-white rounded-md shadow-lg border border-gray-200 overflow-hidden flex items-center">
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="텍스트 입력 후 Enter"
                        className="px-3 py-2 text-sm text-gray-800 outline-none w-48"
                        onKeyDown={handleKeyDown}
                        onBlur={handleBlur}
                        onClick={(e) => e.stopPropagation()}
                    />
                    <button
                        className="px-2 py-2 text-gray-400 hover:text-gray-600 transition-colors"
                        onMouseDown={(e) => {
                            // blur보다 먼저 처리되도록 mousedown 사용
                            e.preventDefault()
                            hideTextInput()
                        }}
                    >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                    </button>
                </div>
                {/* 말풍선 꼬리 (아래쪽) */}
                <div className="flex justify-center">
                    <div style={{
                        width: 0, height: 0,
                        borderLeft: '6px solid transparent',
                        borderRight: '6px solid transparent',
                        borderTop: '6px solid #e5e7eb',
                    }} />
                </div>
            </div>
        </div>
    )
}
