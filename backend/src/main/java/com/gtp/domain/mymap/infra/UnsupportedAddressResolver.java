package com.gtp.domain.mymap.infra;

import com.gtp.domain.mymap.model.ImportFailureReason;
import com.gtp.domain.mymap.port.AddressMatch;
import com.gtp.domain.mymap.port.AddressResolver;

import java.util.List;

/** 주소 모드를 쓰지 않는 호스트용 구현(주소 자료 없이 PNU·좌표만 쓸 때). GTProject는 {@link TableAddressResolver}를 쓴다. */
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
