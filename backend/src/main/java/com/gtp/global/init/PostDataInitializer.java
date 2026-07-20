package com.gtp.global.init;

import com.gtp.domain.blog.entity.Post;
import com.gtp.domain.blog.entity.PostStatus;
import com.gtp.domain.blog.repository.PostRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Slf4j
@Component
@Order(2)
@RequiredArgsConstructor
public class PostDataInitializer implements ApplicationRunner {

    private final PostRepository postRepository;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (postRepository.count() > 0) {
            log.info("[초기화] 블로그 포스트 데이터가 이미 존재합니다.");
            return;
        }

        List<Post> posts = List.of(
            Post.builder()
                .slug("nextjs-spring-boot-jwt")
                .title("Next.js + Spring Boot JWT 인증 구현기")
                .excerpt("Next.js 15와 Spring Boot 3.x 환경에서 JWT 기반 인증 시스템을 구축하면서 겪은 삽질과 해결 과정을 정리했습니다.")
                .content("""
                    ## 들어가며

                    Next.js 15와 Spring Boot 3.x를 함께 사용하면서 JWT 인증을 구현한 경험을 공유합니다.
                    프론트엔드와 백엔드가 분리된 환경에서 CORS 이슈부터 토큰 저장 방식까지 꽤 많은 고민이 있었습니다.

                    ## 구조 설계

                    Frontend에서는 Zustand + persist로 토큰을 localStorage에 저장하고,\\
                    Next.js 미들웨어에서 쿠키 기반으로 라우트를 보호합니다.

                    ## 마치며

                    아직 refresh token은 없지만 access token 만료 시 자동 로그아웃으로 처리하고 있습니다.
                    """)
                .category("DEV")
                .tags("Next.js,Spring Boot,JWT,TypeScript")
                .gradient("from-blue-500 via-indigo-600 to-violet-700")
                .featured(true)
                .status(PostStatus.PUBLISHED)
                .authorId("gitaey")
                .build(),

            Post.builder()
                .slug("baby-100days")
                .title("우리 아가 100일 기념")
                .excerpt("어느새 100일이 됐어. 매일매일 조금씩 커가는 모습을 보면서 세상에서 제일 행복한 아빠가 된 것 같아.")
                .content("""
                    ## 어느새 100일

                    정말 100일이 됐어. 처음엔 하루하루가 얼마나 길게 느껴졌는지 모르는데,
                    돌아보니 너무나 빠르게 지나간 100일이야.

                    ## 요즘 하는 것들

                    - 옹알이를 시작했어
                    - 물체를 눈으로 따라보기 시작
                    - 팔다리를 엄청 활발하게 움직임
                    - 웃음이 많아짐
                    """)
                .category("PARENTING")
                .tags("100일,육아일기,신생아")
                .gradient("from-pink-400 via-rose-400 to-orange-300")
                .featured(false)
                .status(PostStatus.PUBLISHED)
                .authorId("gitaey")
                .build(),

            Post.builder()
                .slug("openlayers-vworld")
                .title("OpenLayers로 VWorld 지도 연동하기")
                .excerpt("국토지리정보원 VWorld API를 OpenLayers 10.x와 연동하는 방법. WMTS, WMS 레이어 설정 및 EPSG:5186 좌표계 변환까지.")
                .content("""
                    ## VWorld란?

                    국토지리정보원에서 제공하는 공간정보 오픈플랫폼입니다.
                    무료로 사용 가능하며 WMTS, WMS 방식으로 레이어를 제공합니다.

                    ## OpenLayers 설정

                    proj4 라이브러리를 사용해서 EPSG:5186 좌표계를 등록하고,
                    ol/proj에 register해서 사용합니다.
                    """)
                .category("DEV")
                .tags("OpenLayers,VWorld,GIS,WebGIS")
                .gradient("from-emerald-500 via-teal-500 to-cyan-600")
                .featured(false)
                .status(PostStatus.PUBLISHED)
                .authorId("gitaey")
                .build(),

            Post.builder()
                .slug("daily-coffee-routine")
                .title("개발자의 커피 루틴")
                .excerpt("재택근무 3년차가 되면서 자연스럽게 생긴 하루 커피 루틴을 공유합니다.")
                .content("""
                    ## 아침의 시작

                    알람을 끄고 제일 먼저 하는 건 커피 그라인딩이에요.

                    ## 핸드드립 루틴

                    - 원두 15g
                    - 뜨거운 물 240ml (93도)
                    - 드리퍼: V60
                    """)
                .category("DAILY")
                .tags("커피,재택근무,일상")
                .gradient("from-amber-500 via-orange-500 to-red-400")
                .featured(false)
                .status(PostStatus.PUBLISHED)
                .authorId("gitaey")
                .build()
        );

        postRepository.saveAll(posts);
        log.info("[초기화] 블로그 샘플 포스트 {}개가 생성되었습니다.", posts.size());
    }
}
