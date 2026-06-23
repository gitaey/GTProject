package com.gtp.domain.botsender.entity;

import jakarta.persistence.*;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "bot_sender")
@Getter
@NoArgsConstructor
public class BotSender {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100, unique = true)
    private String senderName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private BotSenderRole senderRole = BotSenderRole.NORMAL;

    @Column(length = 300)
    private String memo;

    @Column(nullable = false)
    private LocalDateTime lastSeenAt;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    @Builder
    public BotSender(String senderName, BotSenderRole senderRole, String memo) {
        this.senderName = senderName;
        this.senderRole = senderRole != null ? senderRole : BotSenderRole.NORMAL;
        this.memo = memo;
        this.lastSeenAt = LocalDateTime.now();
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }

    public void update(BotSenderRole senderRole, String memo) {
        this.senderRole = senderRole;
        this.memo = memo;
        this.updatedAt = LocalDateTime.now();
    }

    public void updateLastSeen() {
        this.lastSeenAt = LocalDateTime.now();
    }
}
