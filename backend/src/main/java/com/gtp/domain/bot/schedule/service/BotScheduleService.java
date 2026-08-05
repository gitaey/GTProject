package com.gtp.domain.bot.schedule.service;

import com.gtp.domain.bot.schedule.dto.BotScheduleRequest;
import com.gtp.domain.bot.schedule.dto.BotScheduleResponse;
import com.gtp.domain.bot.schedule.entity.BotSchedule;
import com.gtp.domain.bot.schedule.repository.BotScheduleRepository;
import com.gtp.global.exception.CustomException;
import com.gtp.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * bot_schedule 테이블 관리 (대시보드 관리자 페이지용).
 * 실제 예약 발송 실행은 bot 서비스의 스케줄러가 전담한다.
 */
@Service
@RequiredArgsConstructor
public class BotScheduleService {

    private final BotScheduleRepository repo;

    public List<BotScheduleResponse> getAll() {
        return repo.findAllByOrderByCreatedAtDesc().stream()
                .map(BotScheduleResponse::new).toList();
    }

    @Transactional
    public BotScheduleResponse create(BotScheduleRequest req) {
        BotSchedule s = BotSchedule.builder()
                .title(req.getTitle())
                .message(req.getMessage())
                .targetRoom(req.getTargetRoom())
                .dayOfWeek(req.getDayOfWeek())
                .sendTime(req.getSendTime())
                .active(req.isActive())
                .build();
        return new BotScheduleResponse(repo.save(s));
    }

    @Transactional
    public BotScheduleResponse update(Long id, BotScheduleRequest req) {
        BotSchedule s = repo.findById(id).orElseThrow(() -> new CustomException(ErrorCode.USER_NOT_FOUND));
        s.update(req.getTitle(), req.getMessage(), req.getTargetRoom(),
                req.getDayOfWeek(), req.getSendTime(), req.isActive());
        return new BotScheduleResponse(s);
    }

    @Transactional
    public BotScheduleResponse toggle(Long id) {
        BotSchedule s = repo.findById(id).orElseThrow(() -> new CustomException(ErrorCode.USER_NOT_FOUND));
        s.toggleActive();
        return new BotScheduleResponse(s);
    }

    @Transactional
    public void delete(Long id) {
        if (!repo.existsById(id)) throw new CustomException(ErrorCode.USER_NOT_FOUND);
        repo.deleteById(id);
    }
}
