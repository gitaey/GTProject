package com.gtp.domain.bot.log.service;

import com.gtp.domain.bot.log.dto.BotLogRequest;
import com.gtp.domain.bot.log.dto.BotLogResponse;
import com.gtp.domain.bot.log.dto.BotLogStatsResponse;
import com.gtp.domain.bot.log.dto.BotLogStatsResponse.DayStat;
import com.gtp.domain.bot.log.dto.BotLogStatsResponse.HourStat;
import com.gtp.domain.bot.log.entity.BotLog;
import com.gtp.domain.bot.log.entity.BotLogType;
import com.gtp.domain.bot.log.repository.BotLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

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

    /** 일별 통계: date = "2026-06-23" */
    public BotLogStatsResponse getDailyStats(String date, BotLogType type) {
        LocalDate d   = LocalDate.parse(date);
        LocalDateTime from = d.atStartOfDay();
        LocalDateTime to   = d.plusDays(1).atStartOfDay();
        List<BotLog> logs  = fetchRange(type, from, to);
        return buildStats(logs, "daily");
    }

    /** 월별 통계: month = "2026-06" */
    public BotLogStatsResponse getMonthlyStats(String month, BotLogType type) {
        LocalDate first = LocalDate.parse(month + "-01");
        LocalDateTime from = first.atStartOfDay();
        LocalDateTime to   = first.plusMonths(1).atStartOfDay();
        List<BotLog> logs  = fetchRange(type, from, to);
        return buildStats(logs, "monthly");
    }

    private List<BotLog> fetchRange(BotLogType type, LocalDateTime from, LocalDateTime to) {
        return (type != null)
                ? botLogRepository.findByTypeAndCreatedAtBetweenOrderByCreatedAtDesc(type, from, to)
                : botLogRepository.findByCreatedAtBetweenOrderByCreatedAtDesc(from, to);
    }

    private BotLogStatsResponse buildStats(List<BotLog> logs, String mode) {
        int total        = logs.size();
        int successCount = (int) logs.stream().filter(BotLog::isSuccess).count();
        int failCount    = total - successCount;

        Map<String, Long> byType = logs.stream()
                .collect(Collectors.groupingBy(l -> l.getType().name(), Collectors.counting()));

        List<HourStat> byHour = new ArrayList<>();
        if ("daily".equals(mode)) {
            Map<Integer, List<BotLog>> grouped = logs.stream()
                    .collect(Collectors.groupingBy(l -> l.getCreatedAt().getHour()));
            for (int h = 0; h < 24; h++) {
                List<BotLog> g = grouped.getOrDefault(h, List.of());
                long ok = g.stream().filter(BotLog::isSuccess).count();
                byHour.add(HourStat.builder().hour(h).total(g.size()).success(ok).fail(g.size() - ok).build());
            }
        }

        List<DayStat> byDay = new ArrayList<>();
        if ("monthly".equals(mode)) {
            DateTimeFormatter fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd");
            Map<String, List<BotLog>> grouped = logs.stream()
                    .collect(Collectors.groupingBy(l -> l.getCreatedAt().format(fmt)));
            grouped.forEach((day, g) -> {
                long ok = g.stream().filter(BotLog::isSuccess).count();
                byDay.add(DayStat.builder().date(day).total(g.size()).success(ok).fail(g.size() - ok).build());
            });
            byDay.sort((a, b) -> a.getDate().compareTo(b.getDate()));
        }

        return BotLogStatsResponse.builder()
                .total(total)
                .successCount(successCount)
                .failCount(failCount)
                .byType(byType)
                .byHour(byHour)
                .byDay(byDay)
                .build();
    }
}
