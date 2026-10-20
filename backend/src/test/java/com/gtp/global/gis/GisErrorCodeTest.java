package com.gtp.global.gis;

import com.gtp.global.exception.CustomException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import static org.assertj.core.api.Assertions.assertThat;

class GisErrorCodeTest {

    @Test
    void 설계의_새_코드_8개와_상태() {
        assertThat(GisErrorCode.MYMAP_LAYER_LIMIT.getStatus()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(GisErrorCode.MYMAP_ROW_LIMIT.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(GisErrorCode.MYMAP_FILE_TOO_LARGE.getStatus()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
        assertThat(GisErrorCode.MYMAP_IMPORT_BUSY.getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        assertThat(GisErrorCode.MYMAP_COLUMN_REQUIRED.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(GisErrorCode.MYMAP_REF_UNAVAILABLE.getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(GisErrorCode.MYMAP_SAMPLE_NOT_FOUND.getStatus()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(GisErrorCode.MYMAP_STYLE_INVALID.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void 추가한_코드_두_개는_400() {
        assertThat(GisErrorCode.MYMAP_MODE_UNSUPPORTED.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(GisErrorCode.MYMAP_SRID_UNSUPPORTED.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void 메시지의_자리표시를_값으로_채운다() {
        CustomException e = GisErrorCode.MYMAP_LAYER_LIMIT.exception(20);
        assertThat(e.getMessage()).isEqualTo("나만의지도는 한 사람당 최대 20개까지 만들 수 있습니다.");
        assertThat(e.getErrorCode()).isEqualTo(GisErrorCode.MYMAP_LAYER_LIMIT);
        assertThat(GisErrorCode.MYMAP_ROW_LIMIT.exception(5000).getMessage()).isEqualTo("한 번에 최대 5000행까지 올릴 수 있습니다.");
        assertThat(GisErrorCode.MYMAP_FILE_TOO_LARGE.exception(10).getMessage()).isEqualTo("파일이 너무 큽니다(최대 10MB).");
        assertThat(GisErrorCode.MYMAP_COLUMN_REQUIRED.exception("PNU").getMessage()).isEqualTo("PNU에 쓸 컬럼을 선택하세요.");
        assertThat(GisErrorCode.MYMAP_MODE_UNSUPPORTED.getMessage()).doesNotContain("{");   // 자리표시 없이도 쓸 수 있는 문장
        assertThat(new CustomException(GisErrorCode.MYMAP_MODE_UNSUPPORTED, "주소 엑셀은 지원 예정").getMessage()).isEqualTo("주소 엑셀은 지원 예정");
        assertThat(GisErrorCode.MYMAP_SRID_UNSUPPORTED.exception("EPSG:1").getMessage()).contains("EPSG:1");
    }

    @Test
    void 값이_없는_코드는_기본_메시지() {
        assertThat(new CustomException(GisErrorCode.MYMAP_IMPORT_BUSY).getMessage()).contains("처리 중인 업로드");
        assertThat(GisErrorCode.MYMAP_REF_UNAVAILABLE.exception().getMessage()).isEqualTo(GisErrorCode.MYMAP_REF_UNAVAILABLE.getMessage());
    }

    @Test
    void 메시지를_따로_준_예외도_상태는_코드를_따른다() {
        CustomException e = new CustomException(GisErrorCode.MYMAP_ROW_LIMIT, "다른 문구");
        assertThat(e.getMessage()).isEqualTo("다른 문구");
        assertThat(e.getErrorCode().getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
    }
}
