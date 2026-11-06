'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false })
import { RefreshCw, Save, Trash2, Plus, CheckSquare, Square, Search, Unplug, Plug } from 'lucide-react'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import ConnectionBadge from '../_shared/ConnectionBadge'
import NotConnectedNotice from '../_shared/NotConnectedNotice'
import ReconnectDialog from '../_shared/ReconnectDialog'
import { GeoServerConnectionLostError, gsFetch, gsFetchBlob, serverLabel } from '../_shared/connection'
import { useGeoServerConnection } from '../_shared/useGeoServerConnection'

const enc = encodeURIComponent

const DEFAULT_SLD = `<?xml version="1.0" encoding="UTF-8"?>
<StyledLayerDescriptor version="1.0.0"
  xsi:schemaLocation="http://www.opengis.net/sld StyledLayerDescriptor.xsd"
  xmlns="http://www.opengis.net/sld"
  xmlns:ogc="http://www.opengis.net/ogc"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <NamedLayer>
    <Name>새 스타일</Name>
    <UserStyle>
      <Title>새 스타일</Title>
      <FeatureTypeStyle>
        <Rule>
          <PolygonSymbolizer>
            <Fill>
              <CssParameter name="fill">#aaaaaa</CssParameter>
              <CssParameter name="fill-opacity">0.2</CssParameter>
            </Fill>
            <Stroke>
              <CssParameter name="stroke">#333333</CssParameter>
              <CssParameter name="stroke-width">1</CssParameter>
            </Stroke>
          </PolygonSymbolizer>
        </Rule>
      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>`

export default function GeoServerStylesPage() {
    // 연결 — 번호표가 없으면 이 화면은 GeoServer API를 부르지 않는다
    const conn = useGeoServerConnection()
    const connected = conn.state === 'connected'
    const [lostAction, setLostAction]       = useState<string | null>(null)
    const [showReconnect, setShowReconnect] = useState(false)
    const target = conn.info ? serverLabel(conn.info.url) : ''

    /** 428이면 화면(편집 내용)은 그대로 두고 띠만 띄운다. 처리했으면 true */
    const handleLost = (e: unknown, action: string): boolean => {
        if (!(e instanceof GeoServerConnectionLostError)) return false
        setLostAction(action)
        conn.markLost(e.message)
        return true
    }

    // 스타일 편집
    const [styles, setStyles]             = useState<string[]>([])
    const [selected, setSelected]         = useState<string | null>(null)
    const [isNew, setIsNew]               = useState(false)
    const [styleName, setStyleName]       = useState('')
    const [sld, setSld]                   = useState('')
    const [editorFontSize, setEditorFontSize] = useState(15)

    // 범례
    const [legendSld, setLegendSld]       = useState('')
    const [legendBlobUrl, setLegendBlobUrl] = useState<string | null>(null)
    const [legendError, setLegendError]   = useState(false)
    const [legendLoading, setLegendLoading] = useState(false)

    // 레이어 적용
    interface LayerWithStyle { name: string; currentStyle: string }
    const [workspaces, setWorkspaces]         = useState<string[]>([])
    const [applyWs, setApplyWs]               = useState('')
    const [wsLayers, setWsLayers]             = useState<LayerWithStyle[]>([])
    const [selectedLayers, setSelectedLayers] = useState<string[]>([])
    const [loadingLayers, setLoadingLayers]   = useState(false)
    const [styleSearch, setStyleSearch]       = useState('')
    const [layerSearch, setLayerSearch]       = useState('')

    // 로딩/상태
    const [loadingList, setLoadingList] = useState(false)
    const [loadingSld, setLoadingSld]   = useState(false)
    const [saving, setSaving]           = useState(false)
    const [deleting, setDeleting]       = useState(false)
    const [applying, setApplying]       = useState(false)
    const [msg, setMsg]                 = useState<{ text: string; ok: boolean } | null>(null)

    // sld 변경 후 0.8초 debounce → legendSld 업데이트
    useEffect(() => {
        const t = setTimeout(() => setLegendSld(sld), 800)
        return () => clearTimeout(t)
    }, [sld])

    // legendSld 변경 시 백엔드 프록시로 범례 이미지 fetch
    useEffect(() => {
        if (!legendSld || !connected) { if (!legendSld) setLegendBlobUrl(null); return }
        let cancelled = false
        setLegendLoading(true)
        setLegendError(false)
        gsFetchBlob('/api/geoserver/legend', { sld: legendSld })
            .then(blob => {
                if (cancelled) return
                const url = URL.createObjectURL(blob)
                setLegendBlobUrl(prev => { if (prev) URL.revokeObjectURL(prev); return url })
            })
            .catch(e => {
                if (cancelled) return
                if (!handleLost(e, '범례를 불러오')) setLegendError(true)
            })
            .finally(() => { if (!cancelled) setLegendLoading(false) })
        return () => { cancelled = true }
    }, [legendSld, connected])

    const showMsg = (text: string, ok: boolean) => {
        setMsg({ text, ok })
        setTimeout(() => setMsg(null), 3000)
    }

    const loadStyles = () => {
        setLoadingList(true)
        gsFetch<string[]>('/api/geoserver/styles')
            .then(setStyles)
            .catch(e => {
                if (!handleLost(e, '스타일 목록을 불러오')) showMsg('스타일 목록을 불러오지 못했습니다.', false)
            })
            .finally(() => setLoadingList(false))
    }

    // 상태 확인이 끝나 연결됨이 된 뒤에만 불러온다. 다시 연결에 성공하면 스타일 목록과, 끊겨서 비어 버린 SLD·레이어 목록만 다시 받는다(편집 중인 SLD는 건드리지 않음)
    useEffect(() => {
        if (conn.state !== 'connected') return
        setLostAction(null)
        loadStyles()
        if (workspaces.length === 0) {
            gsFetch<{ workspaces: string[] }>('/api/geoserver/workspaces')
                .then(d => setWorkspaces(d.workspaces))
                .catch(e => { handleLost(e, '작업공간을 불러오') })
        }
        if (selected && !isNew && sld === '') selectStyleItem(selected)
        else if (applyWs && wsLayers.length === 0) onWsChange(applyWs)
    }, [conn.state])

    const selectStyleItem = (name: string) => {
        if (!connected) return
        setIsNew(false)
        setSelected(name)
        setStyleName(name)
        setLoadingSld(true)
        setSld('')
        gsFetch<string>(`/api/geoserver/styles/${enc(name)}`)
            .then(setSld)
            .catch(e => {
                if (!handleLost(e, 'SLD를 불러오')) showMsg('SLD를 불러오지 못했습니다.', false)
            })
            .finally(() => setLoadingSld(false))

        // 워크스페이스가 선택된 상태면 레이어 목록 새로 불러오기
        if (applyWs) {
            setSelectedLayers([])
            setLoadingLayers(true)
            gsFetch<LayerWithStyle[]>(`/api/geoserver/workspaces/${enc(applyWs)}/layers`)
                .then(layers => {
                    setWsLayers(layers)
                    setSelectedLayers(layers.filter(l => l.currentStyle === name).map(l => l.name))
                })
                .catch(e => { handleLost(e, '레이어 목록을 불러오') })
                .finally(() => setLoadingLayers(false))
        }
    }

    const newStyle = () => {
        setIsNew(true)
        setSelected(null)
        setStyleName('')
        setSld(DEFAULT_SLD)
    }

    const save = async () => {
        if (!styleName.trim()) { showMsg('스타일 이름을 입력하세요.', false); return }
        if (!sld.trim())       { showMsg('SLD를 입력하세요.', false); return }
        if (!isNew && selected && styleName !== selected
            && !confirm(`'${selected}' 스타일 이름을 '${styleName}'(으)로 바꿉니다.\n${target} 서버에 새 스타일을 만든 뒤 옛 스타일을 삭제합니다. 계속하시겠습니까?`)) return
        setSaving(true)
        try {
            if (isNew) {
                await gsFetch<null>('/api/geoserver/styles', {
                    method: 'POST',
                    body: JSON.stringify({ name: styleName, sld }),
                })
                showMsg('스타일이 생성되었습니다.', true)
                setIsNew(false)
                setSelected(styleName)
                loadStyles()
            } else if (styleName !== selected) {
                // 이름 변경: 새 이름으로 생성 후 기존 삭제
                await gsFetch<null>('/api/geoserver/styles', {
                    method: 'POST',
                    body: JSON.stringify({ name: styleName, sld }),
                })
                await gsFetch<null>(`/api/geoserver/styles/${enc(selected ?? '')}`, { method: 'DELETE' })
                showMsg('스타일 이름이 변경되었습니다.', true)
                setSelected(styleName)
                loadStyles()
            } else {
                await gsFetch<null>(`/api/geoserver/styles/${enc(selected ?? '')}`, {
                    method: 'PUT',
                    body: JSON.stringify({ name: styleName, sld }),
                })
                showMsg('스타일이 업데이트되었습니다.', true)
            }
        } catch (e) {
            if (!handleLost(e, '스타일을 저장하')) showMsg(e instanceof Error ? e.message : '저장에 실패했습니다.', false)
        } finally {
            setSaving(false)
        }
    }

    const deleteStyle = async () => {
        if (!selected) return
        if (!confirm(`'${selected}' 스타일을 ${target} 서버에서 삭제하시겠습니까?`)) return
        setDeleting(true)
        try {
            await gsFetch<null>(`/api/geoserver/styles/${enc(selected)}`, { method: 'DELETE' })
            showMsg('스타일이 삭제되었습니다.', true)
            setSelected(null)
            setStyleName('')
            setSld('')
            loadStyles()
        } catch (e) {
            if (!handleLost(e, '스타일을 삭제하')) showMsg(e instanceof Error ? e.message : '삭제에 실패했습니다.', false)
        } finally {
            setDeleting(false)
        }
    }

    const onWsChange = (ws: string) => {
        setApplyWs(ws)
        setWsLayers([])
        setSelectedLayers([])
        if (!ws) return
        setLoadingLayers(true)
        gsFetch<LayerWithStyle[]>(`/api/geoserver/workspaces/${enc(ws)}/layers`)
            .then(layers => {
                setWsLayers(layers)
                if (selected) {
                    setSelectedLayers(layers.filter(l => l.currentStyle === selected).map(l => l.name))
                }
            })
            .catch(e => { handleLost(e, '레이어 목록을 불러오') })
            .finally(() => setLoadingLayers(false))
    }

    const toggleLayer = (name: string) => {
        setSelectedLayers(prev =>
            prev.includes(name) ? prev.filter(l => l !== name) : [...prev, name]
        )
    }

    const toggleAll = (filtered: LayerWithStyle[]) => {
        const filteredNames = filtered.map(l => l.name)
        const allSelected = filteredNames.every(n => selectedLayers.includes(n))
        setSelectedLayers(prev =>
            allSelected ? prev.filter(n => !filteredNames.includes(n)) : [...new Set([...prev, ...filteredNames])]
        )
    }

    const applyToLayers = async () => {
        if (!applyWs || selectedLayers.length === 0 || !selected) {
            showMsg('워크스페이스, 레이어, 스타일을 모두 선택하세요.', false)
            return
        }
        if (!confirm(`${selectedLayers.length}개 레이어(${applyWs})에 '${selected}' 스타일을 ${target} 서버에서 적용하시겠습니까?`)) return
        setApplying(true)
        try {
            const results = await Promise.allSettled(
                selectedLayers.map(layer =>
                    gsFetch<null>(`/api/geoserver/workspaces/${enc(applyWs)}/layers/${enc(layer)}/style`, {
                        method: 'PUT',
                        body: JSON.stringify({ styleName: selected }),
                    })
                )
            )
            const lost = results.find(r => r.status === 'rejected' && r.reason instanceof GeoServerConnectionLostError)
            if (lost && lost.status === 'rejected' && handleLost(lost.reason, '레이어에 스타일을 적용하')) return
            const failed = results.filter(r => r.status === 'rejected').length
            showMsg(
                failed === 0
                    ? `${selectedLayers.length}개 레이어에 스타일이 적용되었습니다.`
                    : `${selectedLayers.length - failed}개 성공, ${failed}개 실패`,
                failed === 0,
            )
        } catch (e) {
            showMsg(e instanceof Error ? e.message : '적용에 실패했습니다.', false)
        } finally {
            setApplying(false)
        }
    }

    const hasEditor = isNew || selected !== null
    const filteredStyles = styles.filter(s => s.toLowerCase().includes(styleSearch.toLowerCase()))
    const filteredLayers = wsLayers.filter(l => l.name.toLowerCase().includes(layerSearch.toLowerCase()))

    return (
        <div className="flex min-h-screen" style={{ background: 'var(--bg-page)' }}>
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">
                <Header title="스타일 관리" breadcrumb={['GeoServer', '스타일 관리']} />

                <main className="flex-1 p-4 sm:p-6 min-h-0 min-w-0">
                    <div className="flex justify-end mb-3 min-w-0">
                        <ConnectionBadge state={conn.state} info={conn.info} />
                    </div>

                    {conn.state === 'checking' && (
                        <div className="flex items-center justify-center py-16">
                            <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
                                style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
                        </div>
                    )}

                    {conn.state === 'none' && <NotConnectedNotice kind="none" what="스타일 저장·삭제·레이어 적용" />}

                    {conn.state === 'expired' && !lostAction && (
                        <NotConnectedNotice kind="expired" what="스타일 저장·삭제·레이어 적용" info={conn.info}
                            onReconnect={() => setShowReconnect(true)} />
                    )}

                    {conn.state === 'expired' && lostAction && (
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5 px-4 py-3 rounded-lg text-sm"
                            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: 'var(--text-primary)' }}>
                            <span className="flex items-center gap-2 min-w-0 flex-1" style={{ minWidth: '200px' }}>
                                <Unplug size={18} className="shrink-0" style={{ color: '#ef4444' }} />
                                <span>
                                    <b className="block">GeoServer 연결이 만료되어 {lostAction}지 못했습니다</b>
                                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                        편집 중인 내용은 그대로 있습니다. 다시 연결하기 전까지 목록·레이어 적용 조작은 잠기고 저장·삭제는 막힙니다.
                                    </span>
                                </span>
                            </span>
                            {conn.stored && (
                                <button onClick={() => setShowReconnect(true)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg cursor-pointer"
                                    style={{ background: 'var(--accent)', color: '#fff' }}>
                                    <Plug size={12} />
                                    다시 연결
                                </button>
                            )}
                        </div>
                    )}

                    {(connected || (conn.state === 'expired' && lostAction)) && (
                    <>
                    {msg && (
                        <div className="mb-4 px-4 py-3 rounded-lg text-sm"
                            style={{
                                background: msg.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                                border: `1px solid ${msg.ok ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
                                color: msg.ok ? '#10b981' : '#ef4444',
                            }}>
                            {msg.text}
                        </div>
                    )}

                    <div className="flex gap-4 h-[calc(100vh-180px)] min-h-[420px]">

                        {/* 패널 1: 스타일 목록 */}
                        <div className="w-52 shrink-0 flex flex-col rounded-xl overflow-hidden"
                            inert={conn.state === 'expired'}
                            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', opacity: conn.state === 'expired' ? 0.55 : 1 }}>
                            <div className="flex items-center justify-between px-4 py-3"
                                style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-hover)' }}>
                                <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>스타일 목록</span>
                                <div className="flex items-center gap-1">
                                    <button onClick={loadStyles} disabled={loadingList}
                                        className="p-1 rounded cursor-pointer disabled:opacity-40"
                                        style={{ color: 'var(--text-faint)' }}>
                                        <RefreshCw size={12} className={loadingList ? 'animate-spin' : ''} />
                                    </button>
                                    <button onClick={newStyle}
                                        className="p-1 rounded cursor-pointer"
                                        style={{ color: 'var(--text-faint)' }}>
                                        <Plus size={12} />
                                    </button>
                                </div>
                            </div>
                            {/* 스타일 검색 */}
                            <div className="px-3 py-2 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
                                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg"
                                    style={{ background: 'var(--bg-page)', border: '1px solid var(--border)' }}>
                                    <Search size={11} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
                                    <input
                                        value={styleSearch}
                                        onChange={e => setStyleSearch(e.target.value)}
                                        placeholder="검색"
                                        className="flex-1 text-xs bg-transparent outline-none"
                                        style={{ color: 'var(--text-primary)' }}
                                    />
                                </div>
                            </div>
                            <ul className="flex-1 overflow-y-auto py-1">
                                {isNew && (
                                    <li className="px-3 py-2 text-sm font-mono italic"
                                        style={{ color: 'var(--accent)', background: 'var(--accent-bg)' }}>
                                        새 스타일
                                    </li>
                                )}
                                {filteredStyles.map(name => (
                                    <li key={name}
                                        onClick={() => selectStyleItem(name)}
                                        className="px-3 py-2 text-sm font-mono cursor-pointer transition-colors"
                                        style={{
                                            color: selected === name ? 'var(--accent)' : 'var(--text-primary)',
                                            background: selected === name ? 'var(--accent-bg)' : 'transparent',
                                        }}>
                                        {name}
                                    </li>
                                ))}
                                {!loadingList && filteredStyles.length === 0 && !isNew && (
                                    <li className="px-3 py-4 text-xs text-center" style={{ color: 'var(--text-faint)' }}>
                                        {styleSearch ? '검색 결과 없음' : '스타일 없음'}
                                    </li>
                                )}
                            </ul>
                        </div>

                        {/* 패널 2: SLD 에디터 */}
                        <div className="flex-1 rounded-xl overflow-hidden min-w-0 min-h-0 relative"
                            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                            {hasEditor ? (
                                <>
                                    {/* 오버레이 헤더: 에디터 위에 absolute로 올라감 */}
                                    <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-2 px-3 py-1.5"
                                        style={{
                                            background: 'rgba(30,30,30,0.85)',
                                            backdropFilter: 'blur(6px)',
                                            borderBottom: '1px solid rgba(255,255,255,0.06)',
                                        }}>
                                        <input
                                            value={styleName}
                                            onChange={e => setStyleName(e.target.value)}
                                            placeholder="스타일 이름"
                                            className="text-sm px-2.5 py-0.5 rounded outline-none"
                                            style={{
                                                background: 'rgba(255,255,255,0.07)',
                                                border: '1px solid rgba(255,255,255,0.12)',
                                                color: '#d4d4d4',
                                                width: '160px',
                                                flexShrink: 0,
                                            }}
                                        />
                                        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>SLD</span>

                                        <div className="flex items-center gap-1 ml-auto">
                                            <button
                                                onClick={() => setEditorFontSize(s => Math.max(10, s - 1))}
                                                className="px-1.5 py-0.5 rounded text-xs cursor-pointer"
                                                style={{ color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)' }}>
                                                A-
                                            </button>
                                            <span className="text-xs w-6 text-center tabular-nums" style={{ color: 'rgba(255,255,255,0.6)' }}>
                                                {editorFontSize}
                                            </span>
                                            <button
                                                onClick={() => setEditorFontSize(s => Math.min(24, s + 1))}
                                                className="px-1.5 py-0.5 rounded text-xs cursor-pointer"
                                                style={{ color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)' }}>
                                                A+
                                            </button>
                                            <div className="w-px h-3.5 mx-1" style={{ background: 'rgba(255,255,255,0.12)' }} />
                                            {!isNew && selected && (
                                                <button onClick={deleteStyle} disabled={deleting || !connected}
                                                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded cursor-pointer disabled:opacity-40"
                                                    style={{ background: 'rgba(239,68,68,0.2)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
                                                    <Trash2 size={11} />
                                                    {deleting ? '삭제 중' : '삭제'}
                                                </button>
                                            )}
                                            <button onClick={save} disabled={saving || !connected}
                                                className="flex items-center gap-1 px-3 py-1 text-xs font-medium rounded cursor-pointer disabled:opacity-40"
                                                style={{ background: 'var(--accent)', color: '#fff' }}>
                                                <Save size={11} />
                                                {saving ? '저장 중' : isNew ? '생성' : '저장'}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Monaco 에디터: 전체 높이 사용 */}
                                    {loadingSld ? (
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
                                                style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
                                        </div>
                                    ) : (
                                        <MonacoEditor
                                            height="100%"
                                            language="xml"
                                            theme="vs-dark"
                                            value={sld}
                                            onChange={v => setSld(v ?? '')}
                                            onMount={editor => {
                                                editor.setScrollTop(0)
                                                editor.getAction('editor.unfoldAll')?.run()
                                            }}
                                            options={{
                                                fontSize: editorFontSize,
                                                minimap: { enabled: false },
                                                scrollBeyondLastLine: false,
                                                wordWrap: 'off',
                                                tabSize: 2,
                                                automaticLayout: true,
                                                lineNumbers: 'on',
                                                folding: true,
                                                renderLineHighlight: 'all',
                                                bracketPairColorization: { enabled: true },
                                                formatOnPaste: true,
                                                padding: { top: 44 },
                                                stickyScroll: { enabled: false },
                                            }}
                                        />
                                    )}
                                </>
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <p className="text-sm" style={{ color: 'var(--text-faint)' }}>
                                        좌측에서 스타일을 선택하거나 새 스타일을 만드세요.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* 패널 3: 범례 미리보기 + 레이어 적용 */}
                        {hasEditor && (
                            <div className="w-64 shrink-0 flex flex-col gap-3" inert={conn.state === 'expired'}
                                style={conn.state === 'expired' ? { opacity: 0.55 } : undefined}>
                                {/* 범례 미리보기 */}
                                <div className="rounded-xl overflow-hidden shrink-0"
                                    style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                                    <div className="px-4 py-2.5 text-xs font-medium"
                                        style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                                        범례 미리보기
                                    </div>
                                    <div className="p-3 flex items-center justify-center min-h-16"
                                        style={{ background: 'var(--bg-page)' }}>
                                        {!legendSld ? (
                                            <span className="text-xs" style={{ color: 'var(--text-faint)' }}>SLD 입력 후 자동 표시</span>
                                        ) : legendLoading ? (
                                            <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
                                                style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
                                        ) : legendError ? (
                                            <span className="text-xs" style={{ color: '#ef4444' }}>범례 생성 실패</span>
                                        ) : legendBlobUrl ? (
                                            /* eslint-disable-next-line @next/next/no-img-element */
                                            <img src={legendBlobUrl} alt="범례" style={{ maxWidth: '100%' }} />
                                        ) : null}
                                    </div>
                                </div>

                                {/* 레이어 적용 */}
                                {!isNew && selected && (
                                    <div className="flex-1 flex flex-col rounded-xl overflow-hidden min-h-0"
                                        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                                        <div className="px-4 py-2.5 text-xs font-medium shrink-0"
                                            style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                                            레이어에 적용
                                        </div>

                                        <div className="p-3 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
                                            <label className="text-xs mb-1.5 block" style={{ color: 'var(--text-faint)' }}>워크스페이스</label>
                                            <select
                                                value={applyWs}
                                                onChange={e => onWsChange(e.target.value)}
                                                className="w-full text-sm px-2 py-1.5 rounded-lg outline-none"
                                                style={{ background: 'var(--bg-page)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                                                <option value="">선택</option>
                                                {workspaces.map(w => <option key={w} value={w}>{w}</option>)}
                                            </select>
                                        </div>

                                        {/* 레이어 검색 + 목록 */}
                                        {wsLayers.length > 0 && (
                                            <div className="px-3 py-2 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
                                                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg"
                                                    style={{ background: 'var(--bg-page)', border: '1px solid var(--border)' }}>
                                                    <Search size={11} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
                                                    <input
                                                        value={layerSearch}
                                                        onChange={e => setLayerSearch(e.target.value)}
                                                        placeholder="레이어 검색"
                                                        className="flex-1 text-xs bg-transparent outline-none"
                                                        style={{ color: 'var(--text-primary)' }}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                        <div className="flex-1 overflow-y-auto min-h-0">
                                            {loadingLayers ? (
                                                <div className="flex items-center justify-center py-6">
                                                    <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
                                                        style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
                                                </div>
                                            ) : wsLayers.length > 0 ? (
                                                <>
                                                    <button onClick={() => toggleAll(filteredLayers)}
                                                        className="w-full flex items-center gap-2 px-3 py-2 text-xs cursor-pointer"
                                                        style={{
                                                            borderBottom: '1px solid var(--border)',
                                                            color: 'var(--text-secondary)',
                                                            background: 'var(--bg-hover)',
                                                        }}>
                                                        {filteredLayers.length > 0 && filteredLayers.every(l => selectedLayers.includes(l.name))
                                                            ? <CheckSquare size={12} style={{ color: 'var(--accent)' }} />
                                                            : <Square size={12} />}
                                                        전체 선택 ({selectedLayers.length}/{wsLayers.length})
                                                    </button>
                                                    {filteredLayers.map(layer => (
                                                        <button key={layer.name} onClick={() => toggleLayer(layer.name)}
                                                            className="w-full flex items-center gap-2 px-3 py-2 text-xs cursor-pointer transition-colors"
                                                            style={{
                                                                color: selectedLayers.includes(layer.name) ? 'var(--accent)' : 'var(--text-primary)',
                                                                background: selectedLayers.includes(layer.name) ? 'var(--accent-bg)' : 'transparent',
                                                            }}>
                                                            {selectedLayers.includes(layer.name)
                                                                ? <CheckSquare size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                                                                : <Square size={12} style={{ flexShrink: 0, opacity: 0.4 }} />}
                                                            <span className="truncate text-left">{layer.name}</span>
                                                            {layer.currentStyle === selected && (
                                                                <span className="ml-auto shrink-0 text-[10px] px-1.5 py-0.5 rounded"
                                                                    style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}>
                                                                    적용됨
                                                                </span>
                                                            )}
                                                        </button>
                                                    ))}
                                                    {filteredLayers.length === 0 && (
                                                        <p className="px-3 py-4 text-xs text-center" style={{ color: 'var(--text-faint)' }}>검색 결과 없음</p>
                                                    )}
                                                </>
                                            ) : applyWs ? (
                                                <p className="px-3 py-4 text-xs text-center" style={{ color: 'var(--text-faint)' }}>레이어 없음</p>
                                            ) : (
                                                <p className="px-3 py-4 text-xs text-center" style={{ color: 'var(--text-faint)' }}>워크스페이스를 선택하세요</p>
                                            )}
                                        </div>

                                        {selectedLayers.length > 0 && (
                                            <div className="p-3 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
                                                <button onClick={applyToLayers} disabled={applying || !connected}
                                                    className="w-full py-2 text-sm font-medium rounded-lg cursor-pointer disabled:opacity-40"
                                                    style={{ background: 'var(--accent)', color: '#fff' }}>
                                                    {applying ? '적용 중...' : `${selectedLayers.length}개 레이어에 적용`}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    </>
                    )}
                </main>
            </div>
            {showReconnect && conn.stored && (
                <ReconnectDialog stored={conn.stored} onConnected={conn.setConnected} onClose={() => setShowReconnect(false)} />
            )}
        </div>
    )
}
