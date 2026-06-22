package com.gtp.domain.botlog.entity;

import jakarta.persistence.*;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

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

    @Builder
    public BotLog(BotLogType type, String room, String sender,
                  String command, String detail, boolean success) {
        this.type = type;
        this.room = room;
        this.sender = sender;
        this.command = command;
        this.detail = detail;
        this.success = success;
        this.createdAt = LocalDateTime.now();
    }
}
