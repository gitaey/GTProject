package com.gtp.domain.geoserver.connection;

import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import com.gtp.global.gis.GisUserContext;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.core.MethodParameter;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

/** {@code @ConnectedGeoServer GeoServerConnection} 파라미터를 번호표 헤더로 채운다. 실패는 전부 428(GEOSERVER_NOT_CONNECTED). */
@Component
@RequiredArgsConstructor
public class GeoServerConnectionArgumentResolver implements HandlerMethodArgumentResolver {

    public static final String HEADER = "X-GeoServer-Connection";

    private final GeoServerConnectionRegistry registry;
    private final GisUserContext userContext;

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return parameter.hasParameterAnnotation(ConnectedGeoServer.class)
                && GeoServerConnection.class.isAssignableFrom(parameter.getParameterType());
    }

    @Override
    public Object resolveArgument(MethodParameter parameter, ModelAndViewContainer mavContainer,
                                  NativeWebRequest webRequest, WebDataBinderFactory binderFactory) {
        HttpServletRequest request = webRequest.getNativeRequest(HttpServletRequest.class);
        String token = request == null ? null : request.getHeader(HEADER);
        String userId = userContext.currentUserId();
        if (userId == null) throw new CustomException(GisErrorCode.GEOSERVER_NOT_CONNECTED);
        return registry.resolve(token, userId);
    }
}
