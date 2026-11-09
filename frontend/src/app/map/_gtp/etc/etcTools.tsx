'use client'

// 기타 패널의 도구 목록. 새 도구 = 아래 ETC_TOOLS 배열에 한 줄(id·제목·설명·아이콘·render)을 더하면 카드로 붙는다.

import type { ReactNode } from 'react'
import { FileSpreadsheet, MapPinned } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import CsvToExcelTool from './CsvToExcelTool'
import PnuAddressTool from './PnuAddressTool'
import { usePnuAddressJob } from './pnuAddressJob'

export interface EtcToolDef {
    id: string
    title: string
    description: string
    icon: LucideIcon
    render: () => ReactNode
    /** 패널을 다시 열 때 이 도구 카드를 자동으로 펼칠지(작업 중·결과가 남은 도구). 훅이 아니라 스토어를 직접 읽는다 */
    isActive?: () => boolean
}

export const ETC_TOOLS: readonly EtcToolDef[] = Object.freeze([
    {
        id: 'pnu-address',
        title: 'PNU → 주소 찾기',
        description: '엑셀의 PNU로 지번·도로명주소를 붙여요',
        icon: MapPinned,
        render: () => <PnuAddressTool />,
        isActive: () => usePnuAddressJob.getState().phase !== 'idle',
    },
    {
        id: 'csv-excel',
        title: 'CSV → Excel 변환',
        description: '긴 번호·앞자리 0을 지켜 변환해요',
        icon: FileSpreadsheet,
        render: () => <CsvToExcelTool />,
    },
])
