package com.gtp.global.config;

import com.gtp.domain.botcommand.entity.BotCommand;
import com.gtp.domain.botcommand.repository.BotCommandRepository;
import com.gtp.domain.botroom.entity.BotRoom;
import com.gtp.domain.botroom.entity.BotRoomStatus;
import com.gtp.domain.botroom.repository.BotRoomRepository;
import com.gtp.domain.botschedule.entity.BotSchedule;
import com.gtp.domain.botschedule.repository.BotScheduleRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class BotDataInitializer implements CommandLineRunner {

    private final BotCommandRepository commandRepo;
    private final BotScheduleRepository scheduleRepo;
    private final BotRoomRepository roomRepo;

    @Override
    public void run(String... args) {
        seedCommands();
        seedSchedules();
        seedRooms();
    }

    private void seedCommands() {
        if (commandRepo.count() > 0) return;

        List<BotCommand> commands = List.of(
            cmd("/기빵봇",      "도움말 전체 출력",                         null,    true),
            // ── 기본 정보 ──
            cmd("/정보",        "캐릭터 종합 정보 (프로필/각인/아크패시브/아크그리드)",
                                "/정보 [캐릭명]",                            true),
            cmd("/각인",        "각인 정보",
                                "/각인 [캐릭명]",                            true),
            cmd("/아크패시브",  "아크패시브 포인트 및 효과 상세",
                                "/아크패시브 [캐릭명]",                      true),
            cmd("/아크그리드",  "아크그리드 슬롯 및 발동 효과",
                                "/아크그리드 [캐릭명]",                      true),
            cmd("/원정대",      "원정대 캐릭터 목록 (최소레벨 옵션 가능)",
                                "/원정대 [캐릭명] [최소레벨(선택)]",         true),
            cmd("/스킬",        "Lv.4 이상 스킬 및 트라이포드 정보",
                                "/스킬 [캐릭명]",                            true),
            cmd("/내실",        "내실(수집품) 달성률 정보",
                                "/내실 [캐릭명]",                            true),
            cmd("/로펙",        "로펙 달성 최고 점수 조회",
                                "/로펙 [캐릭명]",                            true),
            // ── 장비 ──
            cmd("/장비",        "방어구 장비 목록 및 등급",
                                "/장비 [캐릭명]",                            true),
            cmd("/악세",        "목걸이/귀걸이/반지 연마 효과",
                                "/악세 [캐릭명]",                            true),
            cmd("/팔찌",        "팔찌 옵션 상세",
                                "/팔찌 [캐릭명]",                            true),
            cmd("/보석",        "겁화/작열 보석 및 적용 스킬",
                                "/보석 [캐릭명]",                            true),
            // ── 경매 ──
            cmd("/분배금",      "공정 입찰가 계산 (4인/8인 공동분배·선점가)",
                                "/분배금 [금액]",                            true),
            // ── 길드 전용 (이쁜말 방) ──
            cmd("/일정",        "이번 주 레이드 일정 조회 [길드 방 전용]",
                                "/일정 [캐릭명]",                            true),
            cmd("/일정전체",    "원정대 전체 캐릭터 이번 주 일정 [길드 방 전용]",
                                "/일정전체 [캐릭명]",                        true),
            cmd("/오늘일정",    "오늘 레이드 일정 조회 [길드 방 전용]",
                                "/오늘일정 [캐릭명]",                        true),
            cmd("/파티편성",    "레이드 파티 자동 편성 [길드 방 전용, 현재 비활성]",
                                "/파티편성",                                 false),
            cmd("/일정새로고침","구글시트 일정 캐시 강제 초기화 [길드 방 전용]",
                                "/일정새로고침",                             true),
            cmd("/오늘파티테스트","오늘의 파티 자동 전송 즉시 테스트 실행",
                                "/오늘파티테스트",                           true)
        );

        commandRepo.saveAll(commands);
        log.info("[BotDataInitializer] 명령어 {}개 초기 데이터 삽입 완료", commands.size());
    }

    private void seedSchedules() {
        if (scheduleRepo.count() > 0) return;

        BotSchedule schedule = BotSchedule.builder()
                .title("오늘의 레이드 파티 자동 전송")
                .message("구글시트에서 오늘 날짜의 레이드 파티를 조회하여 자동 전송합니다.")
                .targetRoom("이쁜말")
                .dayOfWeek(null)     // 매일
                .sendTime("12:10")
                .active(true)
                .build();

        scheduleRepo.save(schedule);
        log.info("[BotDataInitializer] 자동 전송 일정 초기 데이터 삽입 완료");
    }

    private void seedRooms() {
        if (roomRepo.count() > 0) return;

        BotRoom room = BotRoom.builder()
                .roomName("이쁜말")
                .status(BotRoomStatus.ALLOWED)
                .memo("길드 메인 채팅방. 일정/파티편성 명령어 전용 방.")
                .build();

        roomRepo.save(room);
        log.info("[BotDataInitializer] 방 초기 데이터 삽입 완료");
    }

    private static BotCommand cmd(String keyword, String description, String response, boolean active) {
        return BotCommand.builder()
                .keyword(keyword)
                .description(description)
                .response(response)
                .active(active)
                .build();
    }
}
