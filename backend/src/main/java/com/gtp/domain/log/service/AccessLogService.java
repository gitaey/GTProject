package com.gtp.domain.log.service;

import com.gtp.domain.log.dto.AccessLogRequest;
import com.gtp.domain.log.dto.AccessLogResponse;
import com.gtp.domain.log.dto.AccessLogStatsResponse;
import com.gtp.domain.log.entity.AccessLog;
import com.gtp.domain.log.repository.AccessLogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AccessLogService {

    private final AccessLogRepository accessLogRepository;

    @Transactional
    public void save(String userId, AccessLogRequest req) {
        AccessLog log = AccessLog.builder()
                .userId(userId)
                .path(req.getPath())
                .pageTitle(req.getPageTitle())
                .build();
        accessLogRepository.save(log);
    }

    @Transactional(readOnly = true)
    public Page<AccessLogResponse> findAll(Pageable pageable) {
        return accessLogRepository.findAllByOrderByAccessedAtDesc(pageable)
                .map(AccessLogResponse::new);
    }

    @Transactional(readOnly = true)
    public List<AccessLogStatsResponse> getStats() {
        return accessLogRepository.countByUserId().stream()
                .map(row -> new AccessLogStatsResponse((String) row[0], (Long) row[1]))
                .collect(Collectors.toList());
    }
}
