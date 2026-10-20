package com.gtp.domain.mymap.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.gtp.domain.mymap.infra.FakePnuParcelProvider;
import com.gtp.domain.mymap.infra.PostgisPnuParcelProvider;
import com.gtp.domain.mymap.infra.UnsupportedAddressResolver;
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

    /** 1단계 자리표시. 2단계에서 TableAddressResolver로 바꾼다. */
    @Bean
    public AddressResolver addressResolver() {
        return new UnsupportedAddressResolver();
    }
}
