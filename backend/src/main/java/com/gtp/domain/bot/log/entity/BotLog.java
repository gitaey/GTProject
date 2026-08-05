package com.gtp.domain.bot.log.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 봇(bot 서비스)이 기록하는 bot_log 테이블을 읽기 전용으로 조회하기 위한 엔티티.
 * 로그 저장은 bot 서비스가 전담하며, 백엔드는 대시보드 조회용으로만 사용한다.
 */
@Entity
@Table(name = "bot_log")
@Getter
@NoArgsConstructor
public class BotLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private BotLogType type;

    @Column(length = 100)
    private String room;

    @Column(length = 100)
    private String sender;

    @Column(length = 200)
    private String command;

    @Column(length = 500)
    private String detail;

    private boolean success;

    @Column(nullable = false)
    private LocalDateTime createdAt;
}
