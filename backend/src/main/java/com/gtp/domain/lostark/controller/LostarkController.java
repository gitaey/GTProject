package com.gtp.domain.lostark.controller;

import com.gtp.domain.lostark.dto.armory.*;
import com.gtp.domain.lostark.service.LostarkService;
import com.gtp.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/lostark")
@RequiredArgsConstructor
public class LostarkController {

    private final LostarkService lostarkService;

    // /캐릭터 - 기본 프로필
    @GetMapping("/character/{name}")
    public ApiResponse<ArmoryProfile> getCharacter(@PathVariable String name) {
        return ApiResponse.ok(lostarkService.getCharacter(name));
    }

    // /보석 - 보석 정보
    @GetMapping("/character/{name}/gems")
    public ApiResponse<ArmoryGem> getGems(@PathVariable String name) {
        return ApiResponse.ok(lostarkService.getGems(name));
    }

    // /스킬 - 스킬 정보
    @GetMapping("/character/{name}/skills")
    public ApiResponse<List<SkillItem>> getSkills(@PathVariable String name) {
        return ApiResponse.ok(lostarkService.getSkills(name));
    }

    // /악세 - 장비 목록 (악세는 봇에서 필터링)
    @GetMapping("/character/{name}/equipment")
    public ApiResponse<List<EquipmentItem>> getEquipment(@PathVariable String name) {
        return ApiResponse.ok(lostarkService.getEquipment(name));
    }

    // /내실 - 내실 수집품
    @GetMapping("/character/{name}/collectibles")
    public ApiResponse<List<CollectibleItem>> getCollectibles(@PathVariable String name) {
        return ApiResponse.ok(lostarkService.getCollectibles(name));
    }

    // /원정대 - 원정대 캐릭터 목록
    @GetMapping("/character/{name}/siblings")
    public ApiResponse<List<SiblingCharacter>> getSiblings(@PathVariable String name) {
        return ApiResponse.ok(lostarkService.getSiblings(name));
    }

    // /각인 - 각인 정보
    @GetMapping("/character/{name}/engravings")
    public ApiResponse<ArmoryEngraving> getEngravings(@PathVariable String name) {
        return ApiResponse.ok(lostarkService.getEngravings(name));
    }

    // /아크패시브 - 아크 패시브 노드
    @GetMapping("/character/{name}/arkpassive")
    public ApiResponse<ArmoryArkPassive> getArkPassive(@PathVariable String name) {
        return ApiResponse.ok(lostarkService.getArkPassive(name));
    }

    // /아크그리드 - 아크 그리드
    @GetMapping("/character/{name}/arkgrid")
    public ApiResponse<ArmoryArkGrid> getArkGrid(@PathVariable String name) {
        return ApiResponse.ok(lostarkService.getArkGrid(name));
    }

    // /정보 통합 조회 (프로필 + 아크패시브 + 각인 + 아크그리드)
    @GetMapping("/character/{name}/info")
    public ApiResponse<CharacterInfoResponse> getCharacterInfo(@PathVariable String name) {
        return ApiResponse.ok(lostarkService.getCharacterInfo(name));
    }
}
