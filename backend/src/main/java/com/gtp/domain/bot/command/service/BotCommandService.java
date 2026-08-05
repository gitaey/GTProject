package com.gtp.domain.bot.command.service;

import com.gtp.domain.bot.command.dto.BotCommandRequest;
import com.gtp.domain.bot.command.dto.BotCommandResponse;
import com.gtp.domain.bot.command.entity.BotCommand;
import com.gtp.domain.bot.command.repository.BotCommandRepository;
import com.gtp.global.exception.CustomException;
import com.gtp.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * bot_command 테이블 관리 (대시보드 관리자 페이지용).
 * 실제 명령어 매칭/응답 로직은 bot 서비스가 전담한다.
 */
@Service
@RequiredArgsConstructor
public class BotCommandService {

    private final BotCommandRepository repo;

    public List<BotCommandResponse> getAll() {
        return repo.findAllByOrderByCreatedAtDesc().stream()
                .map(BotCommandResponse::new).toList();
    }

    @Transactional
    public BotCommandResponse create(BotCommandRequest req) {
        if (repo.existsByKeyword(req.getKeyword()))
            throw new CustomException(ErrorCode.DUPLICATE_USER_ID);
        BotCommand cmd = BotCommand.builder()
                .keyword(req.getKeyword())
                .description(req.getDescription())
                .response(req.getResponse())
                .active(req.isActive())
                .build();
        return new BotCommandResponse(repo.save(cmd));
    }

    @Transactional
    public BotCommandResponse update(Long id, BotCommandRequest req) {
        BotCommand cmd = repo.findById(id).orElseThrow(() -> new CustomException(ErrorCode.USER_NOT_FOUND));
        if (repo.existsByKeywordAndIdNot(req.getKeyword(), id))
            throw new CustomException(ErrorCode.DUPLICATE_USER_ID);
        cmd.update(req.getKeyword(), req.getDescription(), req.getResponse(), req.isActive());
        return new BotCommandResponse(cmd);
    }

    @Transactional
    public BotCommandResponse toggle(Long id) {
        BotCommand cmd = repo.findById(id).orElseThrow(() -> new CustomException(ErrorCode.USER_NOT_FOUND));
        cmd.toggleActive();
        return new BotCommandResponse(cmd);
    }

    @Transactional
    public void delete(Long id) {
        if (!repo.existsById(id)) throw new CustomException(ErrorCode.USER_NOT_FOUND);
        repo.deleteById(id);
    }
}
