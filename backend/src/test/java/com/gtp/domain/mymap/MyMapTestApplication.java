package com.gtp.domain.mymap;

import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

/**
 * @DataJpaTest가 찾는 시험용 설정 — 나만의지도 엔티티·리포지토리만 H2에 올린다(다른 도메인·시큐리티·스케줄러를 끌어들이지 않는다).
 */
@SpringBootConfiguration
@EnableAutoConfiguration
@EntityScan("com.gtp.domain.mymap.entity")
@EnableJpaRepositories("com.gtp.domain.mymap.repository")
public class MyMapTestApplication {
}
