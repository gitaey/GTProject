package com.gtp.domain.geoserver.connection;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/** 컨트롤러 파라미터에 붙이면 번호표 헤더(X-GeoServer-Connection)를 {@link GeoServerConnection}으로 바꿔 넣는다. 없거나 틀리면 428. */
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface ConnectedGeoServer {
}
