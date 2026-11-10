'use client'

// 레이어 목록 플로팅 패널(드로어): 지도 오른쪽 위 모서리에 붙은 "레이어 목록" 단추 + 그 아래 오른쪽 끝에 붙은 전체 높이 목록.
// 지도 위에 뜬다(지도 크기는 그대로). 도구 모음은 움직이지 않고, 열린 드로어가 위를 덮는다(z-index) — 삐져나오는 패널이 없게 MapToolbar covered가 도구 모음을 숨긴다.
// 권한 검사는 하지 않는다(부르는 쪽 몫 — MapShell이 featureId로 거른다).
// 따로 조립할 때: position:relative 지도 영역 안에 두고, 같은 영역의 MapToolbar에 belowLauncher·covered={open}을 준다(조상 class에 기대지 않는다).
// 지도 위 축척 막대까지 비키게 하려면 그 영역(.gm-map-view__stage)에 class gm-has-drawer를 열려 있는 동안 단다.
// 마운트: 처음 열 때 만들어 그 뒤 닫아도 남긴다(hidden) — 자주 여닫는 패널이라 펼친 상세·스크롤·설정 덮개가 살아 있어야 한다.
// 분할 중(split)에는 위에 "대상 지도" 탭을 두고 활성 지도가 바뀌면 내용을 다시 마운트한다(왼쪽 패널 SidePanel과 같은 규칙).
// 768px 미만에서는 CSS가 통째로 숨긴다(모바일 레이어 시트가 맡는다).
import { Fragment, useCallback, useId, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Layers } from 'lucide-react'
import { useGisMap } from '../../react'
import { cx } from '../cx'
import MapSplitTargetTabs from '../split/MapSplitTargetTabs'
import type { MapShellLayerFloatOptions } from '../shell/types'
import LayerPanel from './LayerPanel'

export interface LayerFloatProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** 단추 글자·패널 접근 이름. 기본 '레이어 목록' */
    label?: string
    /** 분할 중(칸 2개 이상): 대상 지도 탭 + 활성 지도마다 내용 다시 마운트. 기본 false */
    split?: boolean
    /** 패널 내용 교체. 기본 (map, { close }) => <LayerPanel onClose={close} /> */
    render?: MapShellLayerFloatOptions['render']
}

export default function LayerFloat({ open, onOpenChange, label = '레이어 목록', split = false, render }: LayerFloatProps) {
    const map = useGisMap()
    const panelId = useId()
    const launcherRef = useRef<HTMLButtonElement>(null)

    // 처음 열 때 마운트, 그 뒤 닫아도 남긴다(렌더 중 state 갱신 — React가 허용하는 "파생 상태" 패턴)
    const [mounted, setMounted] = useState(open)
    if (open && !mounted) setMounted(true)

    // 닫으면 포커스를 "레이어 목록" 단추로 돌린다(X로 닫아도 포커스가 사라지지 않게)
    const close = useCallback(() => {
        onOpenChange(false)
        launcherRef.current?.focus()
    }, [onOpenChange])

    // Esc: 포커스가 목록 안일 때만 닫는다(문서 전체 Esc는 듣지 않는다 — 그리기 글자 입력·대화상자와 충돌 방지).
    // 개인 설정 덮개의 Esc는 덮개가 전파를 끊어 여기까지 오지 않는다. 한글 입력 중(isComposing)은 무시
    const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
        if (e.key !== 'Escape' || e.nativeEvent.isComposing || e.defaultPrevented) return
        e.stopPropagation()
        close()
    }

    return (
        <div className="gm-layer-float">
            <button ref={launcherRef} type="button" className={cx('gm-layer-float__launcher', open && 'gm-is-open')}
                aria-expanded={open} aria-controls={mounted ? panelId : undefined} onClick={() => onOpenChange(!open)}>
                <Layers size={15} />
                <span className="gm-layer-float__label">{label}</span>
                {open ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />}
            </button>

            {mounted && (
                <section id={panelId} role="region" aria-label={label} hidden={!open} className="gm-layer-float__panel" onKeyDown={onKeyDown}>
                    {split && <MapSplitTargetTabs />}
                    <div className="gm-layer-float__body">
                        <Fragment key={split && map ? map.id : 'one'}>
                            {render ? render(map, { close }) : <LayerPanel onClose={close} />}
                        </Fragment>
                    </div>
                </section>
            )}
        </div>
    )
}
