package com.gtp.domain.mymap.port;

import java.util.Collection;
import java.util.Map;

/**
 * PNU(필지고유번호)로 필지 모양을 찾는 포트. 기본 구현은 서비스 DB {@code ref.lsmd_cont_ldreg}을 읽는 {@code PostgisPnuParcelProvider},
 * 시험·로컬 개발용은 {@code FakePnuParcelProvider}. 다른 프로젝트로 옮길 때는 이 인터페이스 구현 하나만 새로 쓴다
 * (Oracle Spatial·MyBatis, 또는 지적 WFS 호출 등).
 */
public interface PnuParcelProvider {

    /**
     * @return PNU → 모양. 찾지 못한 PNU는 결과에 없다. 같은 PNU의 다중 폴리곤은 하나로 합쳐서 돌려준다.
     */
    Map<String, ParcelShape> findByPnus(Collection<String> pnus);

    /**
     * PNU → 필지 안쪽 대표점(+ 요청하면 면적㎡). 모양 전체를 돌려주지 않아 {@link #findByPnus}보다 가볍다. 찾지 못한 PNU는 결과에 없다.
     * 주소 변환 엑셀(경도·위도·면적 열)이 쓴다. 이 기능을 쓰지 않는 구현은 그대로 두면 된다(호출하면 거절).
     */
    default Map<String, ParcelPoint> findPointsByPnus(Collection<String> pnus, boolean withArea) {
        throw new UnsupportedOperationException("이 필지 공급자는 대표점·면적 조회를 지원하지 않습니다");
    }

    /** 적재된 시도·기준월·교체 중 여부. 자료가 없거나 읽지 못하면 {@link Coverage#unavailable()} */
    Coverage coverage();
}
