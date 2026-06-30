package com.gtp.domain.bot.schedule.entity;

import jakarta.persistence.*;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "bot_schedule")
@Getter
@NoArgsConstructor
public class BotSchedule {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(nullable = false, length = 2000)
    private String message;

    @Column(nullable = false, length = 100)
    private String targetRoom;

    /** null = 매일, 1=월, 2=화, 3=수, 4=목, 5=금, 6=토, 7=일 */
    @Column
    private Integer dayOfWeek;

    /** HH:mm 형식 */
    @Column(nullable = false, length = 5)
    private String sendTime;

    @Column(nullable = false)
    private boolean active = true;

    @Column
    private LocalDateTime lastSentAt;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    @Builder
    public BotSchedule(String title, String message, String targetRoom,
                       Integer dayOfWeek, String sendTime, boolean active) {
        this.title = title;
        this.message = message;
        this.targetRoom = targetRoom;
        this.dayOfWeek = dayOfWeek;
        this.sendTime = sendTime;
        this.active = active;
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }

    public void update(String title, String message, String targetRoom,
                       Integer dayOfWeek, String sendTime, boolean active) {
        this.title = title;
        this.message = message;
        this.targetRoom = targetRoom;
        this.dayOfWeek = dayOfWeek;
        this.sendTime = sendTime;
        this.active = active;
        this.updatedAt = LocalDateTime.now();
    }

    public void toggleActive() {
        this.active = !this.active;
        this.updatedAt = LocalDateTime.now();
    }

    public void markSent() {
        this.lastSentAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }
}
