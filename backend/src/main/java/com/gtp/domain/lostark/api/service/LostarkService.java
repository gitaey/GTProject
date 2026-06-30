package com.gtp.domain.lostark.api.service;

import com.gtp.domain.lostark.api.dto.armory.*;
import com.gtp.global.exception.CustomException;
import com.gtp.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.http.*;
import org.springframework.http.client.SimpleClientHttpRequestFactory;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;

@Service
@RequiredArgsConstructor
@Slf4j
public class LostarkService {

    @Value("${lostark.api.key}")
    private String apiKey;

    private static final String BASE_URL = "https://developer-lostark.game.onstove.com";

    // 연결 5초, 읽기 8초 타임아웃 설정
    private RestTemplate restTemplate() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5_000);
        factory.setReadTimeout(8_000);
        return new RestTemplate(factory);
    }

    private HttpEntity<Void> authEntity() {
        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "bearer " + apiKey);
        headers.setContentType(MediaType.APPLICATION_JSON);
        return new HttpEntity<>(headers);
    }

    // !캐릭터 - 기본 프로필
    public ArmoryProfile getCharacter(String name) {
        RestTemplate restTemplate = restTemplate();
        try {
            ResponseEntity<ArmoryProfile> response = restTemplate.exchange(
                BASE_URL + "/armories/characters/" + name + "/profiles",
                HttpMethod.GET, authEntity(), ArmoryProfile.class
            );
            return response.getBody();
        } catch (Exception e) {
            log.error("LostArk 프로필 조회 오류: {}", e.getMessage());
            throw new CustomException(ErrorCode.LOSTARK_API_ERROR);
        }
    }

    // !보석 - 보석 정보
    public ArmoryGem getGems(String name) {
        RestTemplate restTemplate = restTemplate();
        try {
            ResponseEntity<ArmoryGem> response = restTemplate.exchange(
                BASE_URL + "/armories/characters/" + name + "/gems",
                HttpMethod.GET, authEntity(), ArmoryGem.class
            );
            return response.getBody();
        } catch (Exception e) {
            log.error("LostArk 보석 조회 오류: {}", e.getMessage());
            throw new CustomException(ErrorCode.LOSTARK_API_ERROR);
        }
    }

    // !스킬 - 스킬 정보
    public List<SkillItem> getSkills(String name) {
        RestTemplate restTemplate = restTemplate();
        try {
            ResponseEntity<List<SkillItem>> response = restTemplate.exchange(
                BASE_URL + "/armories/characters/" + name + "/combat-skills",
                HttpMethod.GET, authEntity(), new ParameterizedTypeReference<List<SkillItem>>() {}
            );
            return response.getBody() != null ? response.getBody() : new ArrayList<>();
        } catch (Exception e) {
            log.error("LostArk 스킬 조회 오류: {}", e.getMessage());
            throw new CustomException(ErrorCode.LOSTARK_API_ERROR);
        }
    }

    // !악세 - 장비 전체 (악세는 봇에서 필터링)
    public List<EquipmentItem> getEquipment(String name) {
        RestTemplate restTemplate = restTemplate();
        try {
            ResponseEntity<List<EquipmentItem>> response = restTemplate.exchange(
                BASE_URL + "/armories/characters/" + name + "/equipment",
                HttpMethod.GET, authEntity(), new ParameterizedTypeReference<List<EquipmentItem>>() {}
            );
            return response.getBody() != null ? response.getBody() : new ArrayList<>();
        } catch (Exception e) {
            log.error("LostArk 장비 조회 오류: {}", e.getMessage());
            throw new CustomException(ErrorCode.LOSTARK_API_ERROR);
        }
    }

    // !내실 - 내실 수집품
    public List<CollectibleItem> getCollectibles(String name) {
        RestTemplate restTemplate = restTemplate();
        try {
            ResponseEntity<List<CollectibleItem>> response = restTemplate.exchange(
                BASE_URL + "/armories/characters/" + name + "/collectibles",
                HttpMethod.GET, authEntity(), new ParameterizedTypeReference<List<CollectibleItem>>() {}
            );
            return response.getBody() != null ? response.getBody() : new ArrayList<>();
        } catch (Exception e) {
            log.error("LostArk 내실 조회 오류: {}", e.getMessage());
            throw new CustomException(ErrorCode.LOSTARK_API_ERROR);
        }
    }

    // !원정대 - 원정대 캐릭터 목록
    public List<SiblingCharacter> getSiblings(String name) {
        RestTemplate restTemplate = restTemplate();
        try {
            ResponseEntity<List<SiblingCharacter>> response = restTemplate.exchange(
                BASE_URL + "/characters/" + name + "/siblings",
                HttpMethod.GET, authEntity(), new ParameterizedTypeReference<List<SiblingCharacter>>() {}
            );
            return response.getBody() != null ? response.getBody() : new ArrayList<>();
        } catch (Exception e) {
            log.error("LostArk 원정대 조회 오류: {}", e.getMessage());
            throw new CustomException(ErrorCode.LOSTARK_API_ERROR);
        }
    }

    // !각인 - 각인 정보
    public ArmoryEngraving getEngravings(String name) {
        RestTemplate restTemplate = restTemplate();
        try {
            ResponseEntity<ArmoryEngraving> response = restTemplate.exchange(
                BASE_URL + "/armories/characters/" + name + "/engravings",
                HttpMethod.GET, authEntity(), ArmoryEngraving.class
            );
            return response.getBody();
        } catch (Exception e) {
            log.error("LostArk 각인 조회 오류: {}", e.getMessage());
            throw new CustomException(ErrorCode.LOSTARK_API_ERROR);
        }
    }

    // !아크패시브 - 아크 패시브 노드
    public ArmoryArkPassive getArkPassive(String name) {
        RestTemplate restTemplate = restTemplate();
        try {
            ResponseEntity<ArmoryArkPassive> response = restTemplate.exchange(
                BASE_URL + "/armories/characters/" + name + "/arkpassive",
                HttpMethod.GET, authEntity(), ArmoryArkPassive.class
            );
            return response.getBody();
        } catch (Exception e) {
            log.error("LostArk 아크패시브 조회 오류: {}", e.getMessage());
            throw new CustomException(ErrorCode.LOSTARK_API_ERROR);
        }
    }

    // !아크그리드 - 아크 그리드
    public ArmoryArkGrid getArkGrid(String name) {
        RestTemplate restTemplate = restTemplate();
        try {
            ResponseEntity<ArmoryArkGrid> response = restTemplate.exchange(
                BASE_URL + "/armories/characters/" + name + "/arkgrid",
                HttpMethod.GET, authEntity(), ArmoryArkGrid.class
            );
            return response.getBody();
        } catch (Exception e) {
            log.error("LostArk 아크그리드 조회 오류: {}", e.getMessage());
            throw new CustomException(ErrorCode.LOSTARK_API_ERROR);
        }
    }

    // /정보 통합 조회 (프로필 + 아크패시브 + 각인 + 아크그리드) - 병렬 호출
    public CharacterInfoResponse getCharacterInfo(String name) {
        long total = System.currentTimeMillis();

        CompletableFuture<ArmoryProfile> profileFuture =
            CompletableFuture.supplyAsync(() -> {
                long t = System.currentTimeMillis();
                ArmoryProfile r = getCharacter(name);
                log.info("[TIMING] profile: {}ms", System.currentTimeMillis() - t);
                return r;
            });

        CompletableFuture<ArmoryArkPassive> arkPassiveFuture =
            CompletableFuture.supplyAsync(() -> {
                long t = System.currentTimeMillis();
                try {
                    ArmoryArkPassive r = getArkPassive(name);
                    log.info("[TIMING] arkPassive: {}ms", System.currentTimeMillis() - t);
                    return r;
                } catch (Exception e) {
                    log.warn("[TIMING] arkPassive 실패 {}ms: {}", System.currentTimeMillis() - t, e.getMessage());
                    return null;
                }
            });

        CompletableFuture<ArmoryEngraving> engravingFuture =
            CompletableFuture.supplyAsync(() -> {
                long t = System.currentTimeMillis();
                try {
                    ArmoryEngraving r = getEngravings(name);
                    log.info("[TIMING] engraving: {}ms", System.currentTimeMillis() - t);
                    return r;
                } catch (Exception e) {
                    log.warn("[TIMING] engraving 실패 {}ms: {}", System.currentTimeMillis() - t, e.getMessage());
                    return null;
                }
            });

        CompletableFuture<ArmoryArkGrid> arkGridFuture =
            CompletableFuture.supplyAsync(() -> {
                long t = System.currentTimeMillis();
                try {
                    ArmoryArkGrid r = getArkGrid(name);
                    log.info("[TIMING] arkGrid: {}ms", System.currentTimeMillis() - t);
                    return r;
                } catch (Exception e) {
                    log.warn("[TIMING] arkGrid 실패 {}ms: {}", System.currentTimeMillis() - t, e.getMessage());
                    return null;
                }
            });

        CompletableFuture.allOf(profileFuture, arkPassiveFuture, engravingFuture, arkGridFuture).join();
        log.info("[TIMING] getCharacterInfo 전체: {}ms", System.currentTimeMillis() - total);

        return new CharacterInfoResponse(
            profileFuture.join(),
            arkPassiveFuture.join(),
            engravingFuture.join(),
            arkGridFuture.join()
        );
    }
}
