package com.gtp.domain.botcommand.service;

import com.gtp.domain.botcommand.dto.BotCommandRequest;
import com.gtp.domain.botcommand.dto.BotCommandResponse;
import com.gtp.domain.botcommand.entity.BotCommand;
import com.gtp.domain.botcommand.repository.BotCommandRepository;
import com.gtp.global.exception.CustomException;
import com.gtp.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class BotCommandService {

    private final BotCommandRepository repo;

    public List<BotCommandResponse> getAll() {
        return repo.findAllByOrderByCreatedAtDesc().stream()
                .map(BotCommandResponse::new).toList();
    }

    public List<BotCommandResponse> getActive() {
        return repo.findByActiveTrue().stream()
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
