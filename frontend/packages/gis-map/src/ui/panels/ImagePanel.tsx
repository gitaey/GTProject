'use client'

// 항공영상(GeoTIFF) 패널 — 스타일: gm-panel(TIFF·나만의지도 공용), gm-image-panel
// FE-5b-2: 옛 panel/ImagePanel.tsx. 끌어다 놓기 상태·항목 상태(켜짐·실패·변환 중)에 따라 바뀌는 값만 인라인 style로 남겼다
import { useMemo, useRef, useState } from 'react'
import { Trash2, Upload, Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import { EMPTY_GEOTIFF_CATALOG_STATE } from '../../core'
import type { GeoTiffCatalogState, GeoTiffItem, RasterOverlayState } from '../../core'
import { useGeoTiffCatalog, useGisMap, useRasterOverlayState, useStoreValue } from '../../react'

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

/** 안내 문구용 용량 표기: 1GB 이상은 GB(소수 1자리, 끝 0 생략), 그 아래는 MB 정수 */
function formatLimit(bytes: number): string {
  const gb = 1024 * 1024 * 1024
  return bytes >= gb ? `${+(bytes / gb).toFixed(1)}GB` : `${Math.round(bytes / (1024 * 1024))}MB`
}

export interface ImagePanelProps {
  /** 파일당 최대 용량(바이트). 주면 안내 문구에 보이고, 이보다 큰 파일은 올리지 않고 안내한다. 서버 한도를 호스트가 알려 준다. 기본: 안내·검사 없음 */
  maxUploadBytes?: number
  /** 이 용량 이상이면 업로드·변환이 오래 걸릴 수 있다는 안내 기준(바이트). 기본: 안내 없음 */
  slowUploadBytes?: number
}

const selectCatalog = (s: GeoTiffCatalogState) => s
const selectVisibleIds = (s: RasterOverlayState) => s.visibleIds

// 목록·업로드·상태 폴링·삭제·좌표 재추출은 패널이 열려 있는 동안의 목록 객체(map.raster.openCatalog)가,
// 지도에 올린 레이어와 체크 상태는 엔진 인스턴스(map.raster)가 가진다 → 패널을 닫았다 열어도 체크 = 지도
export default function ImagePanel({ maxUploadBytes, slowUploadBytes }: ImagePanelProps = {}) {
  const raster = useGisMap()?.raster ?? null
  const catalog = useGeoTiffCatalog()
  const { items, loading, uploading } = useStoreValue(catalog?.store, selectCatalog, EMPTY_GEOTIFF_CATALOG_STATE)
  const visibleIdList = useRasterOverlayState(selectVisibleIds)
  const visibleIds = useMemo(() => new Set(visibleIdList), [visibleIdList])
  const [dragging, setDragging] = useState(false)
  const [sizeError, setSizeError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const hasHint = maxUploadBytes !== undefined || slowUploadBytes !== undefined

  // .tif/.tiff 검사·uploadedBy·폴링 시작은 목록 객체가 한다. 용량 한도를 호스트가 알려 줬으면 큰 파일은 서버로 보내기 전에 막는다
  const handleUpload = (file: File) => {
    if (maxUploadBytes !== undefined && file.size > maxUploadBytes) {
      setSizeError(`파일이 너무 큽니다(${formatFileSize(file.size)}). 파일당 최대 ${formatLimit(maxUploadBytes)}까지 올릴 수 있습니다.`)
      return
    }
    setSizeError(null)
    void catalog?.upload(file)
  }

  const handleReprocessBounds = (id: number) => catalog?.reprocessBounds(id)

  // 옛 동작: 서버 응답과 관계없이 지도·목록에서 뺀다(네트워크 오류만 드러남)
  const handleDelete = (id: number) => catalog?.remove(id)

  const toggleVisibility = (item: GeoTiffItem) => {
    if (item.status !== 'READY') return
    if (visibleIds.has(item.id)) {
      raster?.hide(item.id)
    } else {
      raster?.show(item)
    }
  }

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleUpload(file)
  }

  return (
    <div className="gm-panel">
      {/* 헤더 */}
      <div className="gm-panel__header">
        <span className="gm-panel__title">항공영상</span>
      </div>

      {/* 업로드 영역 */}
      <div className="gm-image-panel__upload">
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
          className="gm-image-panel__drop"
          style={{
            border: `1.5px dashed ${dragging ? 'var(--gm-primary)' : 'var(--gm-border-strong)'}`,
            cursor: uploading ? 'default' : 'pointer',
            background: dragging ? 'rgba(var(--gm-primary-rgb), 0.05)' : 'var(--gm-surface-muted)',
          }}
        >
          {uploading ? (
            <Loader2 size={18} className="gm-loader gm-image-panel__drop-loader" />
          ) : (
            <Upload size={16} style={{ color: 'var(--gm-text-faint)' }} />
          )}
          <span className="gm-image-panel__drop-text">
            {uploading ? '업로드 중...' : '.tif / .tiff 파일을 드래그하거나 클릭'}
          </span>
          {hasHint && (
            <div className="gm-image-panel__drop-hint">
              {maxUploadBytes !== undefined && <p>파일당 최대 {formatLimit(maxUploadBytes)}까지 올릴 수 있습니다.</p>}
              {slowUploadBytes !== undefined && <p>{formatLimit(slowUploadBytes)} 이상은 업로드와 변환에 시간이 오래 걸릴 수 있습니다.</p>}
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".tif,.tiff"
          className="gm-file-input"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = '' }}
        />
        {sizeError && <p className="gm-image-panel__hint--error" role="alert">{sizeError}</p>}
      </div>

      {/* 목록 */}
      <div className="gm-panel__list">
        {loading ? (
          <div className="gm-panel__loading">
            <div className="gm-panel__spinner" />
          </div>
        ) : items.length === 0 ? (
          <div className="gm-panel__empty">
            업로드된 파일 없음
          </div>
        ) : items.map(item => {
          const active = visibleIds.has(item.id)
          const isProcessing = item.status === 'PROCESSING'
          const isFailed = item.status === 'FAILED'
          return (
            <div key={item.id} className="gm-panel__item" style={{
              background: active ? 'rgba(var(--gm-primary-rgb), 0.04)' : 'transparent',
            }}>
              {/* 체크박스 (가시성 토글) */}
              <input
                type="checkbox"
                checked={active}
                disabled={isProcessing || isFailed}
                onChange={() => toggleVisibility(item)}
                className="gm-panel__item-check"
                style={{
                  cursor: isProcessing || isFailed ? 'default' : 'pointer',
                }}
              />

              {/* 파일명 + 크기 + 상태 */}
              <div className="gm-panel__item-body">
                <div className="gm-panel__item-name" style={{
                  color: isFailed ? 'var(--gm-danger)' : active ? 'var(--gm-text)' : 'var(--gm-text-2)',
                  fontWeight: active ? 500 : 400,
                }}>
                  {item.originalName}
                </div>
                <div className="gm-panel__item-meta">
                  {formatFileSize(item.fileSize)}
                  {isProcessing && (
                    <span className="gm-panel__item-status gm-panel__item-status--busy">
                      <Loader2 size={9} className="gm-loader" />
                      변환 중
                    </span>
                  )}
                  {isFailed && (
                    <span className="gm-panel__item-status gm-panel__item-status--failed">
                      <AlertCircle size={9} />
                      실패
                    </span>
                  )}
                </div>
              </div>

              {/* bounds 없는 READY 항목: 재처리 버튼 */}
              {item.status === 'READY' && item.minLon == null && (
                <button
                  onClick={() => handleReprocessBounds(item.id)}
                  title="좌표 재추출"
                  className="gm-panel__item-btn gm-panel__item-btn--hover-primary"
                >
                  <RefreshCw size={12} />
                </button>
              )}

              {/* 삭제 */}
              <button
                onClick={() => handleDelete(item.id)}
                title="삭제"
                className="gm-panel__item-btn gm-panel__item-btn--delete"
              >
                <Trash2 size={13} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
