package com.gtp.domain.mymap.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.gtp.domain.mymap.infra.FakePnuParcelProvider;
import com.gtp.domain.mymap.infra.InMemoryAddressRefReader;
import com.gtp.domain.mymap.infra.JdbcAddressRefReader;
import com.gtp.domain.mymap.infra.PostgisPnuParcelProvider;
import com.gtp.domain.mymap.infra.TableAddressResolver;
import com.gtp.domain.mymap.port.AddressResolver;
import com.gtp.domain.mymap.port.PnuParcelProvider;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.sql.DataSource;

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
     * 주소 → PNU. postgis면 도로명주소 건물DB 표를 읽는 {@link TableAddressResolver}, fake면 샘플 청사 7곳 메모리 자료.
     * provider 검사는 {@link #pnuParcelProvider}가 기동 때 이미 했다(모르는 값이면 거기서 실패).
     */
    @Bean
    public AddressResolver addressResolver(MyMapProperties props, MyMapRefJdbc refJdbc) {
        MyMapProperties.Ref ref = props.getRef();
        int max = ref.getAddress().getMaxCandidates();
        if ("fake".equalsIgnoreCase(ref.getProvider())) {
            return new TableAddressResolver(InMemoryAddressRefReader.samples(), max);
        }
        return new TableAddressResolver(new JdbcAddressRefReader(refJdbc.template(), ref), max);
    }
}
