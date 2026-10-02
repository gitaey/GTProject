'use client'

// 나만의지도 패널 — 스타일: gm-panel(TIFF·나만의지도 공용), gm-mymap-panel
// FE-5b-2: 옛 panel/MyMapPanel.tsx. 항목 상태(켜짐·실패·처리 중)에 따라 바뀌는 값만 인라인 style로 남겼다
import { useMemo, useState } from 'react'
import { Trash2, Upload, Loader2, AlertCircle, Share2, Locate } from 'lucide-react'
import { EMPTY_MYMAP_CATALOG_STATE } from '../../core'
import type { MyMapCatalogState, UserMapListItem, VectorOverlayState } from '../../core'
import { useGisMap, useMyMapCatalog, useStoreValue, useVectorOverlayState } from '../../react'
import MyMapUploadModal from '../mymap/MyMapUploadModal'
import MyMapShareDialog from '../mymap/MyMapShareDialog'

const selectCatalog = (s: MyMapCatalogState) => s
const selectVisibleIds = (s: VectorOverlayState) => s.visibleIds

// 목록·상태 폴링·삭제는 패널이 열려 있는 동안의 목록 객체(map.vector.openCatalog)가,
// 지도에 올린 레이어와 체크 상태는 엔진 인스턴스(map.vector)가 가진다 → 패널을 닫았다 열어도 체크 = 지도
export default function MyMapPanel() {
    const vector = useGisMap()?.vector ?? null
    const catalog = useMyMapCatalog()
    const { items, loading } = useStoreValue(catalog?.store, selectCatalog, EMPTY_MYMAP_CATALOG_STATE)
    const visibleIdList = useVectorOverlayState(selectVisibleIds)
    const visibleIds = useMemo(() => new Set(visibleIdList), [visibleIdList])
    const [showUpload, setShowUpload] = useState(false)
    const [shareTarget, setShareTarget] = useState<{ id: number; name: string } | null>(null)

    // 업로드 뒤 목록 다시 받기(옛 fetchList — loading 표시는 다시 켜지 않는다)
    const fetchList = () => {
        void catalog?.load()
    }

    // 옛 동작: 서버 응답과 관계없이 지도·목록에서 뺀다(네트워크 오류만 드러남)
    const handleDelete = (id: number) => catalog?.remove(id)

    const toggleVisibility = (item: UserMapListItem) => {
        if (item.status !== 'READY') return
        if (visibleIds.has(item.id)) {
            vector?.hide(item.id)
        } else {
            void vector?.show(item.id)
        }
    }

    // 지도에 없으면 먼저 불러와 켠 뒤(체크도 켜짐) 피처 범위로 이동
    const handleLocate = async (item: UserMapListItem) => {
        if (item.status !== 'READY') return
        await vector?.zoomTo(item.id)
    }

    return (
        <div className="gm-panel">
            <div className="gm-panel__header">
                <span className="gm-panel__title">나만의지도</span>
                <button onClick={() => setShowUpload(true)}
                    className="gm-mymap-panel__upload">
                    <Upload size={13} /> 업로드
                </button>
            </div>

            <div className="gm-panel__list">
                {loading ? (
                    <div className="gm-panel__loading">
                        <Loader2 size={18} className="gm-loader gm-loader--primary" />
                    </div>
                ) : items.length === 0 ? (
                    <div className="gm-panel__empty">
                        업로드된 나만의지도 없음
                    </div>
                ) : items.map(item => {
                    const active = visibleIds.has(item.id)
                    const isProcessing = item.status === 'PROCESSING'
                    const isFailed = item.status === 'FAILED'
                    return (
                        <div key={item.id} className="gm-panel__item" style={{
                            background: active ? 'rgba(var(--gm-primary-rgb), 0.04)' : 'transparent',
                        }}>
                            <input type="checkbox" checked={active} disabled={isProcessing || isFailed}
                                onChange={() => toggleVisibility(item)}
                                className="gm-panel__item-check"
                                style={{ cursor: isProcessing || isFailed ? 'default' : 'pointer' }} />

                            <div className="gm-panel__item-body">
                                <div className="gm-panel__item-name" style={{
                                    color: isFailed ? '#ef4444' : active ? '#111827' : '#374151',
                                    fontWeight: active ? 500 : 400,
                                }}>
                                    {item.name}{!item.owner && <span className="gm-mymap-panel__shared"> (공유됨)</span>}
                                </div>
                                <div className="gm-panel__item-meta">
                                    {item.sourceType} · {item.featureCount}개
                                    {isProcessing && (
                                        <span className="gm-panel__item-status gm-panel__item-status--busy">
                                            <Loader2 size={9} className="gm-loader" /> 처리 중
                                        </span>
                                    )}
                                    {isFailed && (
                                        <span className="gm-panel__item-status gm-panel__item-status--failed">
                                            <AlertCircle size={9} /> 실패
                                        </span>
                                    )}
                                </div>
                            </div>

                            {item.status === 'READY' && (
                                <button onClick={() => handleLocate(item)} title="레이어 위치로 이동"
                                    className="gm-panel__item-btn"
                                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--gm-primary)')}
                                    onMouseLeave={e => (e.currentTarget.style.color = '#9ca3af')}>
                                    <Locate size={12} />
                                </button>
                            )}

                            {item.owner && (
                                <button onClick={() => setShareTarget({ id: item.id, name: item.name })} title="공유 설정"
                                    className="gm-panel__item-btn"
                                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--gm-primary)')}
                                    onMouseLeave={e => (e.currentTarget.style.color = '#9ca3af')}>
                                    <Share2 size={12} />
                                </button>
                            )}

                            {item.owner && (
                                <button onClick={() => handleDelete(item.id)} title="삭제"
                                    className="gm-panel__item-btn gm-panel__item-btn--delete"
                                    onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                                    onMouseLeave={e => (e.currentTarget.style.color = '#d1d5db')}>
                                    <Trash2 size={13} />
                                </button>
                            )}
                        </div>
                    )
                })}
            </div>

            {showUpload && <MyMapUploadModal onClose={() => setShowUpload(false)} onUploaded={fetchList} />}
            {shareTarget && <MyMapShareDialog id={shareTarget.id} name={shareTarget.name} onClose={() => setShareTarget(null)} />}
        </div>
    )
}
