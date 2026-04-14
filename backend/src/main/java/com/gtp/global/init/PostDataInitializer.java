package com.gtp.global.init;

import com.gtp.domain.post.entity.Post;
import com.gtp.domain.post.entity.PostCategory;
import com.gtp.domain.post.entity.PostStatus;
import com.gtp.domain.post.repository.PostRepository;
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

                    ## 핵심 포인트

                    ### 1. Next.js 미들웨어에서 쿠키로 인증 체크

                    localStorage는 서버사이드에서 접근할 수 없기 때문에, 로그인 시 쿠키에도 토큰을 저장해두고
                    middleware.ts에서 읽는 방식을 사용했습니다.

                    ### 2. Zustand persist로 새로고침 대응

                    zustand/middleware의 persist를 사용하면 localStorage와 자동으로 동기화됩니다.

                    ## 마치며

                    아직 refresh token은 없지만 access token 만료 시 자동 로그아웃으로 처리하고 있습니다.
                    """)
                .category(PostCategory.DEV)
                .tags("Next.js,Spring Boot,JWT,TypeScript")
                .emoji("🔐")
                .gradient("from-blue-500 via-indigo-600 to-violet-700")
                .featured(true)
                .status(PostStatus.PUBLISHED)
                .authorId("gitaey")
                .build(),

            Post.builder()
                .slug("baby-100days")
                .title("우리 아가 100일 기념 🎉")
                .excerpt("어느새 100일이 됐어. 매일매일 조금씩 커가는 모습을 보면서 세상에서 제일 행복한 아빠가 된 것 같아.")
                .content("""
                    ## 어느새 100일

                    정말 100일이 됐어. 처음엔 하루하루가 얼마나 길게 느껴졌는지 모르는데,
                    돌아보니 너무나 빠르게 지나간 100일이야.

                    ## 100일 기념 사진 촬영

                    스튜디오에서 100일 사진을 찍었어. 아가가 엄청 잘 웃어줘서 사진이 너무 잘 나왔어.

                    ## 요즘 하는 것들

                    - 옹알이를 시작했어. "아~" "우~" 하면서 나름 대화하려고 하는 것 같아서 너무 귀여움
                    - 물체를 눈으로 따라보기 시작
                    - 팔다리를 엄청 활발하게 움직임
                    - 웃음이 많아짐
                    """)
                .category(PostCategory.PARENTING)
                .tags("100일,육아일기,신생아")
                .emoji("👶")
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

                    ## WMTS 레이어 추가

                    VWorld에서 제공하는 XYZ 타일 URL 패턴을 사용하면 간단하게 추가할 수 있습니다.

                    ## 마치며

                    VWorld는 국내 지도 서비스 중 가장 고해상도 항공사진과 상세 지형도를 제공합니다.
                    """)
                .category(PostCategory.DEV)
                .tags("OpenLayers,VWorld,GIS,WebGIS")
                .emoji("🗺️")
                .gradient("from-emerald-500 via-teal-500 to-cyan-600")
                .featured(false)
                .status(PostStatus.PUBLISHED)
                .authorId("gitaey")
                .build(),

            Post.builder()
                .slug("baby-first-smile")
                .title("처음으로 웃어줬어요")
                .excerpt("오늘 드디어 진짜 사회적 미소를 지어줬어요! 눈을 맞추고 방긋 웃는 모습에 눈물이 핑 돌았습니다.")
                .content("""
                    ## 드디어!

                    오늘 드디어 진짜 사회적 미소를 지어줬어요.
                    배고파서 우는 것도 아니고, 가스 때문에 찡그리는 것도 아닌, 진짜 웃음이요.

                    ## 그 순간

                    눈을 마주치고 "안녕~" 했더니 입꼬리가 올라가면서 방긋!
                    그 순간 진짜 눈물이 핑 돌았어요.

                    이 순간을 영원히 기억하고 싶어서 기록해 둡니다.
                    """)
                .category(PostCategory.PARENTING)
                .tags("첫미소,육아일기,성장일기")
                .emoji("😊")
                .gradient("from-yellow-400 via-orange-400 to-pink-400")
                .featured(false)
                .status(PostStatus.PUBLISHED)
                .authorId("gitaey")
                .build(),

            Post.builder()
                .slug("postgresql-jpa-tips")
                .title("PostgreSQL + JPA 실전 팁 모음")
                .excerpt("JPA ddl-auto의 함정, 컬럼 제약조건 마이그레이션, N+1 문제 해결까지. 실무에서 자주 마주치는 문제들을 정리했습니다.")
                .content("""
                    ## ddl-auto: update 의 함정

                    ddl-auto: update는 새 컬럼을 추가하거나 테이블을 생성하지만,
                    기존 컬럼의 제약조건(NOT NULL 제거 등)은 변경하지 않습니다.
                    이런 경우 ALTER TABLE로 직접 수정해야 합니다.

                    ## N+1 문제

                    @ManyToOne 관계에서 LAZY 로딩 시 N+1이 발생할 수 있습니다.
                    @EntityGraph 또는 fetch join을 사용해서 해결하세요.

                    ## String PK vs Auto Increment

                    자연키(아이디, 이메일 등)를 PK로 사용할 때는 변경 불가능한 값인지 꼭 확인하세요.
                    """)
                .category(PostCategory.DEV)
                .tags("PostgreSQL,JPA,Spring Boot,DB")
                .emoji("🗄️")
                .gradient("from-sky-500 via-blue-600 to-indigo-700")
                .featured(false)
                .status(PostStatus.PUBLISHED)
                .authorId("gitaey")
                .build(),

            Post.builder()
                .slug("daily-coffee-routine")
                .title("개발자의 커피 루틴")
                .excerpt("재택근무 3년차가 되면서 자연스럽게 생긴 하루 커피 루틴. 아침 핸드드립 한 잔으로 시작하는 하루가 얼마나 달라지는지 공유해봅니다.")
                .content("""
                    ## 아침의 시작

                    알람을 끄고 제일 먼저 하는 건 커피 그라인딩이에요.
                    갓 갈린 원두 향이 집 안에 퍼지면서 하루가 시작되는 느낌이 너무 좋아요.

                    ## 핸드드립 루틴

                    - 원두 15g
                    - 뜨거운 물 240ml (93도)
                    - 드리퍼: V60
                    - 총 시간: 약 2분 30초

                    ## 개발과 커피

                    집중이 필요한 코딩 시간엔 커피 한 잔이 정말 큰 도움이 돼요.
                    """)
                .category(PostCategory.DAILY)
                .tags("커피,재택근무,일상")
                .emoji("☕")
                .gradient("from-amber-500 via-orange-500 to-red-400")
                .featured(false)
                .status(PostStatus.PUBLISHED)
                .authorId("gitaey")
                .build(),

            Post.builder()
                .slug("zustand-state-management")
                .title("Zustand로 전역 상태 관리 제대로 하기")
                .excerpt("Redux 없이 Zustand만으로 복잡한 상태를 관리하는 패턴들. persist 미들웨어, 스토어 분리 전략까지 실전 코드와 함께 설명합니다.")
                .content("""
                    ## Zustand가 뭔가요?

                    React를 위한 경량 상태 관리 라이브러리입니다.
                    Redux보다 훨씬 간결한 코드로 전역 상태를 관리할 수 있어요.

                    ## persist 미들웨어

                    zustand/middleware의 persist를 사용하면 localStorage에 자동으로 저장됩니다.
                    SSR 환경에서는 createJSONStorage(() => localStorage)를 명시적으로 전달해야 합니다.

                    ## 스토어 분리

                    하나의 큰 스토어보다 도메인별로 분리하는 게 유지보수에 유리합니다.
                    authStore, mapStore, layerStore처럼 역할별로 나누세요.
                    """)
                .category(PostCategory.DEV)
                .tags("Zustand,React,상태관리,TypeScript")
                .emoji("⚡")
                .gradient("from-violet-500 via-purple-600 to-indigo-700")
                .featured(false)
                .status(PostStatus.PUBLISHED)
                .authorId("gitaey")
                .build(),

            Post.builder()
                .slug("baby-tummy-time")
                .title("목 가누기 연습 시작!")
                .excerpt("소아과 선생님이 이제 터미 타임 시작해도 된다고 해서 오늘부터 조금씩 시작했어요.")
                .content("""
                    ## 터미 타임 시작

                    소아과에서 이제 터미 타임(tummy time)을 시작해도 된다고 했어요.

                    ## 첫 번째 시도

                    처음엔 싫어서 울었는데, 1-2분 정도 하고 나서는 고개를 들려고 버둥거리는 모습이
                    너무 귀여웠어요.

                    ## 매일 조금씩

                    하루 3-4회, 각 2-3분씩 해주는 게 좋다고 해서 매일 열심히 하고 있어요.
                    벌써 조금씩 고개를 드는 게 보여요! 🥹
                    """)
                .category(PostCategory.PARENTING)
                .tags("터미타임,발달,육아일기")
                .emoji("💪")
                .gradient("from-lime-400 via-green-500 to-emerald-600")
                .featured(false)
                .status(PostStatus.PUBLISHED)
                .authorId("gitaey")
                .build()
        );

        postRepository.saveAll(posts);
        log.info("[초기화] 블로그 샘플 포스트 {}개가 생성되었습니다.", posts.size());
    }
}
