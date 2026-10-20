package com.gtp.domain.mymap.infra;

import com.gtp.domain.mymap.model.ImportFailureReason;
import com.gtp.domain.mymap.port.AddressMatch;
import com.gtp.domain.mymap.port.AddressResolver;

import java.util.List;

/** 1단계 자리표시 구현: 주소 모드를 아직 지원하지 않는다. 2단계에서 TableAddressResolver로 바뀐다. */
public class UnsupportedAddressResolver implements AddressResolver {

    @Override
    public boolean supported() {
        return false;
    }

    @Override
    public List<AddressMatch> resolve(List<String> rawAddresses) {
        return rawAddresses.stream().map(a -> AddressMatch.failed(ImportFailureReason.PARSE_FAILED)).toList();
    }
}
