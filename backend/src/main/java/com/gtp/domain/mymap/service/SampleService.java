package com.gtp.domain.mymap.service;

import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 엑셀 샘플(PNU·주소·좌표) 내려받기. 파일은 앱에 포함된 {@code resources/mymap/samples/*.xlsx}다
 * (만드는 스크립트: _workspace/mymap/make-samples.cjs — 공공청사 7곳, 개인 주소 없음).
 */
@Service
public class SampleService {

    public record Sample(String filename, byte[] bytes) {
    }

    private record Entry(String resource, String filename) {
    }

    private static final Map<String, Entry> ENTRIES = Map.of(
            "pnu", new Entry("mymap/samples/pnu.xlsx", "나만의지도_샘플_PNU.xlsx"),
            "address", new Entry("mymap/samples/address.xlsx", "나만의지도_샘플_주소.xlsx"),
            "coord", new Entry("mymap/samples/coord.xlsx", "나만의지도_샘플_좌표.xlsx"));

    private final Map<String, byte[]> cache = new ConcurrentHashMap<>();

    public Sample load(String kind) {
        Entry e = kind == null ? null : ENTRIES.get(kind.toLowerCase(Locale.ROOT));
        if (e == null) throw new CustomException(GisErrorCode.MYMAP_SAMPLE_NOT_FOUND);
        byte[] bytes = cache.computeIfAbsent(e.resource(), SampleService::read);
        if (bytes.length == 0) throw new CustomException(GisErrorCode.MYMAP_SAMPLE_NOT_FOUND);
        return new Sample(e.filename(), bytes);
    }

    private static byte[] read(String resource) {
        try (InputStream in = new ClassPathResource(resource).getInputStream()) {
            return in.readAllBytes();
        } catch (IOException ex) {
            return new byte[0];
        }
    }
}
