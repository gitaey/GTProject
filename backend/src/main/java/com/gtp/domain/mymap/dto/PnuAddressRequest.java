package com.gtp.domain.mymap.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;

/**
 * PNU 묶음 → 지번·도로명주소(U26) 요청. pnus는 1~500개, 각 값은 19자리 숫자(11번째 1·2).
 * 하이픈·공백 정리는 브라우저가 끝내고 보낸다 — 서버는 정리하지 않고 검사만 한다. 중복은 서버가 하나로 합친다.
 */
@Getter
@Setter
@NoArgsConstructor
public class PnuAddressRequest {
    private List<String> pnus;
}
