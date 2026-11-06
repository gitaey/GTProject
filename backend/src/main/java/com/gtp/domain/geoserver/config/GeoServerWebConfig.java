package com.gtp.domain.geoserver.config;

import com.gtp.domain.geoserver.connection.GeoServerConnectionArgumentResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.List;

/** GeoServer 연결 번호표 인자 해석기 등록. */
@Configuration
@RequiredArgsConstructor
public class GeoServerWebConfig implements WebMvcConfigurer {

    private final GeoServerConnectionArgumentResolver connectionResolver;

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(connectionResolver);
    }
}
