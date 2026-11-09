package com.gtp.domain.mymap.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.gtp.domain.mymap.infra.AddressRefReader;
import com.gtp.domain.mymap.infra.FakePnuParcelProvider;
import com.gtp.domain.mymap.infra.FakeRefLoadMetaReader;
import com.gtp.domain.mymap.infra.InMemoryAddressRefReader;
import com.gtp.domain.mymap.infra.JdbcAddressRefReader;
import com.gtp.domain.mymap.infra.JdbcRefLoadMetaReader;
import com.gtp.domain.mymap.infra.PostgisPnuParcelProvider;
import com.gtp.domain.mymap.infra.TableAddressResolver;
import com.gtp.domain.mymap.port.AddressResolver;
import com.gtp.domain.mymap.port.PnuParcelProvider;
import com.gtp.domain.mymap.port.RefLoadMetaReader;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.sql.DataSource;
import java.time.LocalDate;
import java.time.ZoneId;

@Configuration
@EnableConfigurationProperties(MyMapProperties.class)
public class MyMapConfig {

    @Bean
    public MyMapRefJdbc mymapRefJdbc(MyMapProperties props, DataSource serviceDataSource) {
        return MyMapRefJdbc.create(props.getRef().getDatasource(), serviceDataSource);
    }

    @Bean
    public MyMapImportExecutor mymapImportExecutor(MyMapProperties props) {
        return new MyMapImportExecutor(props.getUpload().getPoolSize(), props.getUpload().getQueueCapacity());
    }

    /** {@code mymap.ref.provider}: postgis(기본) 또는 fake. 그 밖의 값은 기동 때 바로 알려 준다. */
    @Bean
    public PnuParcelProvider pnuParcelProvider(MyMapProperties props, MyMapRefJdbc refJdbc, ObjectMapper objectMapper) {
        String provider = props.getRef().getProvider();
        if ("postgis".equalsIgnoreCase(provider)) {
            return new PostgisPnuParcelProvider(refJdbc.template(), props.getRef());
        }
        if ("fake".equalsIgnoreCase(provider)) {
            return FakePnuParcelProvider.fromClasspath(objectMapper);
        }
        throw new IllegalStateException("mymap.ref.provider는 postgis 또는 fake여야 합니다: " + provider);
    }

    /**
     * 주소 자료 읽기(건물DB). postgis면 {@link JdbcAddressRefReader}, fake면 샘플 메모리 자료. 주소 변환({@link #addressResolver})과
     * 필지 정보 카드(ParcelBuildingService)가 같은 인스턴스를 쓴다 — 색인 확인 결과 기억이 하나.
     * provider 검사는 {@link #pnuParcelProvider}가 기동 때 이미 했다(모르는 값이면 거기서 실패).
     */
    @Bean
    public AddressRefReader addressRefReader(MyMapProperties props, MyMapRefJdbc refJdbc) {
        MyMapProperties.Ref ref = props.getRef();
        if ("fake".equalsIgnoreCase(ref.getProvider())) {
            return InMemoryAddressRefReader.samples();
        }
        return new JdbcAddressRefReader(refJdbc.template(), ref);
    }

    /**
     * 참조 자료 적재 기록(ref.load_meta) 읽기 — GET /api/mymap/ref/status. postgis면 {@link JdbcRefLoadMetaReader}(SELECT만),
     * fake면 오늘 기준으로 막 적재한 메모리 기록. provider 검사는 {@link #pnuParcelProvider}가 이미 했다.
     */
    @Bean
    public RefLoadMetaReader refLoadMetaReader(MyMapProperties props, MyMapRefJdbc refJdbc) {
        MyMapProperties.Ref ref = props.getRef();
        if ("fake".equalsIgnoreCase(ref.getProvider())) {
            return FakeRefLoadMetaReader.samples(ref, LocalDate.now(ZoneId.of("Asia/Seoul")));
        }
        return new JdbcRefLoadMetaReader(refJdbc.template(), ref);
    }

    /** 주소 → PNU. 도로명주소 건물DB 표를 읽는 {@link TableAddressResolver}(fake면 샘플 청사 7곳 메모리 자료). */
    @Bean
    public AddressResolver addressResolver(MyMapProperties props, AddressRefReader addressRefReader) {
        return new TableAddressResolver(addressRefReader, props.getRef().getAddress().getMaxCandidates());
    }
}
