package com.gtp.domain.botsender.service;

import com.gtp.domain.botsender.dto.BotSenderRequest;
import com.gtp.domain.botsender.dto.BotSenderResponse;
import com.gtp.domain.botsender.entity.BotSender;
import com.gtp.domain.botsender.entity.BotSenderRole;
import com.gtp.domain.botsender.repository.BotSenderRepository;
import com.gtp.global.exception.CustomException;
import com.gtp.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class BotSenderService {

    private final BotSenderRepository repo;

    public List<BotSenderResponse> getAll() {
        return repo.findAllByOrderByLastSeenAtDesc().stream()
                .map(BotSenderResponse::new).toList();
    }

    public String getSenderRole(String senderName) {
        return repo.findBySenderName(senderName)
                .map(s -> s.getSenderRole().name())
                .orElse(BotSenderRole.NORMAL.name());
    }

    /** 봇에서 활동 기록 시 자동 등록/갱신 */
    @Transactional
    public void upsert(String senderName) {
        repo.findBySenderName(senderName).ifPresentOrElse(
                BotSender::updateLastSeen,
                () -> repo.save(BotSender.builder().senderName(senderName).senderRole(BotSenderRole.NORMAL).build())
        );
    }

    @Transactional
    public BotSenderResponse create(BotSenderRequest req) {
        if (repo.existsBySenderName(req.getSenderName()))
            throw new CustomException(ErrorCode.DUPLICATE_USER_ID);
        BotSender s = BotSender.builder()
                .senderName(req.getSenderName())
                .senderRole(req.getSenderRole())
                .memo(req.getMemo())
                .build();
        return new BotSenderResponse(repo.save(s));
    }

    @Transactional
    public BotSenderResponse update(Long id, BotSenderRequest req) {
        BotSender s = repo.findById(id).orElseThrow(() -> new CustomException(ErrorCode.USER_NOT_FOUND));
        s.update(req.getSenderRole(), req.getMemo());
        return new BotSenderResponse(s);
    }

    @Transactional
    public void delete(Long id) {
        if (!repo.existsById(id)) throw new CustomException(ErrorCode.USER_NOT_FOUND);
        repo.deleteById(id);
    }
}
