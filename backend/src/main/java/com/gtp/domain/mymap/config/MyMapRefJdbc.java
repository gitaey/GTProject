package com.gtp.domain.mymap.config;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;

/**
 * 참조 데이터(연속지적도 등)를 읽는 JdbcTemplate을 담는 상자.
 *
 * 일부러 JdbcTemplate·DataSource를 스프링 빈으로 직접 내놓지 않는다: 그 타입의 빈이 하나 더 생기면 Boot 자동 구성의
 * 서비스용 {@code jdbcTemplate}이 사라져서 다른 도메인(GeoTIFF·바람길 등)이 엉뚱한 DB를 보게 된다.
 * {@code mymap.ref.datasource.url}이 비어 있으면 서비스 DataSource를 그대로 쓰고, 있으면 읽기 전용 풀을 따로 만든다.
 */
public class MyMapRefJdbc implements AutoCloseable {

    private final JdbcTemplate template;
    private final HikariDataSource ownDataSource;

    private MyMapRefJdbc(JdbcTemplate template, HikariDataSource ownDataSource) {
        this.template = template;
        this.ownDataSource = ownDataSource;
    }

    public static MyMapRefJdbc create(MyMapProperties.Datasource conf, DataSource serviceDataSource) {
        if (!conf.isConfigured()) {
            return new MyMapRefJdbc(new JdbcTemplate(serviceDataSource), null);
        }
        HikariConfig hc = new HikariConfig();
        hc.setPoolName("mymap-ref");
        hc.setJdbcUrl(conf.getUrl());
        if (!conf.getUsername().isBlank()) hc.setUsername(conf.getUsername());
        if (!conf.getPassword().isBlank()) hc.setPassword(conf.getPassword());
        hc.setReadOnly(true);
        hc.setMaximumPoolSize(conf.getMaxPoolSize());
        hc.setConnectionTimeout(conf.getConnectionTimeoutMillis());
        hc.setInitializationFailTimeout(-1); // 참조 DB가 잠깐 내려가 있어도 앱 기동은 막지 않는다
        HikariDataSource ds = new HikariDataSource(hc);
        return new MyMapRefJdbc(new JdbcTemplate(ds), ds);
    }

    public JdbcTemplate template() {
        return template;
    }

    /** 서비스 DB와 별도 풀을 쓰는가 */
    public boolean separate() {
        return ownDataSource != null;
    }

    @Override
    public void close() {
        if (ownDataSource != null) ownDataSource.close();
    }
}
