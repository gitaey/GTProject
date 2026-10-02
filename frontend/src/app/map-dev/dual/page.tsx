import { notFound } from 'next/navigation'
import DualMaps from './_dual/DualMaps'

/*
 * FE-6a 검증용 페이지 — 한 화면에 지도 2개(서로 다른 설정)를 띄워 인스턴스 독립성을 사람이 확인한다.
 * 개발 환경(npm run dev)에서만 열린다. 운영 빌드에서는 404. 메뉴에 노출하지 않는다.
 * 설계문서(2026-09-23-map-module-restructure.md)대로 검증이 끝나면 이 폴더(app/map-dev/)를 통째로 지운다.
 */
export default function MapDevDualPage() {
    if (process.env.NODE_ENV !== 'development') notFound()
    return <DualMaps />
}
