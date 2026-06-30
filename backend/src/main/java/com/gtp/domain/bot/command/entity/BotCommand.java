package com.gtp.domain.bot.command.entity;

import jakarta.persistence.*;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "bot_command")
@Getter
@NoArgsConstructor
public class BotCommand {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100, unique = true)
    private String keyword;

    @Column(length = 500)
    private String description;

    @Column(length = 2000)
    private String response;

    @Column(nullable = false)
    private boolean active = true;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    @Builder
    public BotCommand(String keyword, String description, String response, boolean active) {
        this.keyword = keyword;
        this.description = description;
        this.response = response;
        this.active = active;
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }

    public void update(String keyword, String description, String response, boolean active) {
        this.keyword = keyword;
        this.description = description;
        this.response = response;
        this.active = active;
        this.updatedAt = LocalDateTime.now();
    }

    public void toggleActive() {
        this.active = !this.active;
        this.updatedAt = LocalDateTime.now();
    }
}
