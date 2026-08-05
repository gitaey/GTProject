package com.gtp.domain.bot.room.entity;

import jakarta.persistence.*;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "bot_room")
@Getter
@NoArgsConstructor
public class BotRoom {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100, unique = true)
    private String roomName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private BotRoomStatus status = BotRoomStatus.ALLOWED;

    @Column(length = 300)
    private String memo;

    @Column(nullable = false)
    private LocalDateTime lastSeenAt;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    @Builder
    public BotRoom(String roomName, BotRoomStatus status, String memo) {
        this.roomName = roomName;
        this.status = status != null ? status : BotRoomStatus.ALLOWED;
        this.memo = memo;
        this.lastSeenAt = LocalDateTime.now();
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }

    public void update(BotRoomStatus status, String memo) {
        this.status = status;
        this.memo = memo;
        this.updatedAt = LocalDateTime.now();
    }

    public void toggleStatus() {
        this.status = (this.status == BotRoomStatus.ALLOWED) ? BotRoomStatus.BLOCKED : BotRoomStatus.ALLOWED;
        this.updatedAt = LocalDateTime.now();
    }

    public void updateLastSeen() {
        this.lastSeenAt = LocalDateTime.now();
    }
}
