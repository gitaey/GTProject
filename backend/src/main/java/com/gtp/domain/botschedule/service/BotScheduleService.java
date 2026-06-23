package com.gtp.domain.botschedule.service;

import com.gtp.domain.botschedule.dto.BotScheduleRequest;
import com.gtp.domain.botschedule.dto.BotScheduleResponse;
import com.gtp.domain.botschedule.entity.BotSchedule;
import com.gtp.domain.botschedule.repository.BotScheduleRepository;
import com.gtp.global.exception.CustomException;
import com.gtp.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class BotScheduleService {

    private final BotScheduleRepository repo;

    public List<BotScheduleResponse> getAll() {
        return repo.findAllByOrderByCreatedAtDesc().stream()
                .map(BotScheduleResponse::new).toList();
    }

    public List<BotScheduleResponse> getActive() {
        return repo.findByActiveTrue().stream()
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
    public BotScheduleResponse markSent(Long id) {
        BotSchedule s = repo.findById(id).orElseThrow(() -> new CustomException(ErrorCode.USER_NOT_FOUND));
        s.markSent();
        return new BotScheduleResponse(s);
    }

    @Transactional
    public void delete(Long id) {
        if (!repo.existsById(id)) throw new CustomException(ErrorCode.USER_NOT_FOUND);
        repo.deleteById(id);
    }
}
