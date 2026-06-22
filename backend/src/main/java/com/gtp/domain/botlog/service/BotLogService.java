package com.gtp.domain.botlog.service;

import com.gtp.domain.botlog.dto.BotLogRequest;
import com.gtp.domain.botlog.dto.BotLogResponse;
import com.gtp.domain.botlog.entity.BotLog;
import com.gtp.domain.botlog.entity.BotLogType;
import com.gtp.domain.botlog.repository.BotLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class BotLogService {

    private final BotLogRepository botLogRepository;

    public void save(BotLogRequest req) {
        BotLog botLog = BotLog.builder()
                .type(req.getType())
                .room(req.getRoom())
                .sender(req.getSender())
                .command(req.getCommand())
                .detail(req.getDetail())
                .success(req.isSuccess())
                .build();
        botLogRepository.save(botLog);
    }

    public void saveApiError(String endpoint, String errorMessage) {
        BotLog botLog = BotLog.builder()
                .type(BotLogType.API_ERROR)
                .command(endpoint)
                .detail(errorMessage)
                .success(false)
                .build();
        botLogRepository.save(botLog);
    }

    public Page<BotLogResponse> getLogs(BotLogType type, int page, int size) {
        PageRequest pageable = PageRequest.of(page, size);
        Page<BotLog> logs = (type != null)
                ? botLogRepository.findByTypeOrderByCreatedAtDesc(type, pageable)
                : botLogRepository.findAllByOrderByCreatedAtDesc(pageable);
        return logs.map(BotLogResponse::new);
    }
}
