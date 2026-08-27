package com.gtp.domain.log.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "tbl_access_log")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class AccessLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 50)
    private String userId;

    @Column(nullable = false, length = 255)
    private String path;

    @Column(length = 100)
    private String pageTitle;

    @CreationTimestamp
    @Column(updatable = false)
    private LocalDateTime accessedAt;
}
