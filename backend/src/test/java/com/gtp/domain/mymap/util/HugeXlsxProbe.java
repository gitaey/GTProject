package com.gtp.domain.mymap.util;

import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;

import java.nio.file.Path;

/**
 * HugeXlsxMemoryTest가 작은 힙(-Xmx)의 별도 JVM에서 돌리는 실행기. 미리보기와 같은 방식(스트리밍 읽기 + 행 수 한도)으로 큰 xlsx를 연다.
 * 인자: 파일 한도(0이면 한도 없이 끝까지 센다). 출력: "REJECTED rows=N" | "OK rows=N". OutOfMemoryError면 JVM이 비정상 종료한다.
 */
public final class HugeXlsxProbe {

    private HugeXlsxProbe() {
    }

    public static void main(String[] args) {
        Path file = Path.of(args[0]);
        int limit = Integer.parseInt(args[1]);
        int[] rows = {0};
        try {
            ExcelSheet.read(file, h -> {
            }, row -> {
                rows[0]++;
                if (limit > 0 && rows[0] > limit) throw GisErrorCode.MYMAP_ROW_LIMIT.exception(limit);
                return true;
            });
            System.out.println("OK rows=" + rows[0]);
        } catch (CustomException e) {
            if (e.getErrorCode() == GisErrorCode.MYMAP_ROW_LIMIT) {
                System.out.println("REJECTED rows=" + rows[0]);
            } else {
                System.out.println("ERROR " + e.getErrorCode());
                System.exit(4);
            }
        }
    }
}
