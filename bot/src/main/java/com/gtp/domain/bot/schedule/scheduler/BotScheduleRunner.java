package com.gtp.domain.bot.schedule.scheduler;

import com.gtp.domain.bot.message.dto.BotMessageRequest;
import com.gtp.domain.bot.message.service.BotMessageService;
import com.gtp.domain.bot.schedule.entity.BotSchedule;
import com.gtp.domain.bot.schedule.repository.BotScheduleRepository;
import com.gtp.domain.bot.schedule.service.BotScheduleService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class BotScheduleRunner {

    private final BotScheduleRepository botScheduleRepository;
    private final BotScheduleService botScheduleService;
    private final BotMessageService botMessageService;

    // 매 분마다 실행
    @Scheduled(cron = "0 * * * * *", zone = "Asia/Seoul")
    public void runSchedules() {
        LocalDateTime now = LocalDateTime.now(ZoneId.of("Asia/Seoul"));
        String currentTime = String.format("%02d:%02d", now.getHour(), now.getMinute());
        int currentDow = now.getDayOfWeek().getValue(); // 1=월 ... 7=일

        List<BotSchedule> schedules = botScheduleRepository.findByActiveTrue();

        for (BotSchedule schedule : schedules) {
            if (!schedule.getSendTime().equals(currentTime)) continue;

            // dayOfWeek가 null이면 매일, 아니면 요일 일치 확인
            if (schedule.getDayOfWeek() != null && schedule.getDayOfWeek() != currentDow) continue;

            try {
                BotMessageRequest req = new BotMessageRequest(
                        schedule.getTargetRoom(),
                        schedule.getMessage(),
                        "기빵봇"
                );

                botMessageService.handle(req);
                botScheduleService.markSent(schedule.getId());

                log.info("스케줄 전송 완료: [{}] {} → {}", schedule.getTitle(), currentTime, schedule.getTargetRoom());
            } catch (Exception e) {
                log.error("스케줄 전송 실패: [{}] {}", schedule.getTitle(), e.getMessage());
            }
        }
    }
}
