package com.gtp.domain.bot.room.service;

import com.gtp.domain.bot.room.dto.BotRoomRequest;
import com.gtp.domain.bot.room.dto.BotRoomResponse;
import com.gtp.domain.bot.room.entity.BotRoom;
import com.gtp.domain.bot.room.repository.BotRoomRepository;
import com.gtp.global.exception.CustomException;
import com.gtp.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * bot_room 테이블 관리 (대시보드 관리자 페이지용).
 * 방 자동 등록/최근 활동 갱신은 bot 서비스가 전담한다.
 */
@Service
@RequiredArgsConstructor
public class BotRoomService {

    private final BotRoomRepository repo;

    public List<BotRoomResponse> getAll() {
        return repo.findAllByOrderByLastSeenAtDesc().stream()
                .map(BotRoomResponse::new).toList();
    }

    @Transactional
    public BotRoomResponse create(BotRoomRequest req) {
        if (repo.existsByRoomName(req.getRoomName()))
            throw new CustomException(ErrorCode.DUPLICATE_USER_ID);
        BotRoom room = BotRoom.builder()
                .roomName(req.getRoomName())
                .status(req.getStatus())
                .memo(req.getMemo())
                .build();
        return new BotRoomResponse(repo.save(room));
    }

    @Transactional
    public BotRoomResponse update(Long id, BotRoomRequest req) {
        BotRoom room = repo.findById(id).orElseThrow(() -> new CustomException(ErrorCode.USER_NOT_FOUND));
        room.update(req.getStatus(), req.getMemo());
        return new BotRoomResponse(room);
    }

    @Transactional
    public BotRoomResponse toggle(Long id) {
        BotRoom room = repo.findById(id).orElseThrow(() -> new CustomException(ErrorCode.USER_NOT_FOUND));
        room.toggleStatus();
        return new BotRoomResponse(room);
    }

    @Transactional
    public void delete(Long id) {
        if (!repo.existsById(id)) throw new CustomException(ErrorCode.USER_NOT_FOUND);
        repo.deleteById(id);
    }
}
