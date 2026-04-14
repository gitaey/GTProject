package com.gtp.domain.user.repository;

import com.gtp.domain.user.entity.Role;
import com.gtp.domain.user.entity.User;
import com.gtp.domain.user.entity.UserStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<User, String> {

    boolean existsByUserId(String userId);

    boolean existsByNickname(String nickname);

    boolean existsByEmail(String email);

    /* 키워드(user_id/이름/닉네임/이메일) + 역할 + 상태 필터 검색 */
    @Query("""
        SELECT u FROM User u
        WHERE (:keyword IS NULL
               OR u.userId   LIKE %:keyword%
               OR u.userName LIKE %:keyword%
               OR u.nickname LIKE %:keyword%
               OR u.email    LIKE %:keyword%)
          AND (:role   IS NULL OR u.role   = :role)
          AND (:status IS NULL OR u.status = :status)
        ORDER BY u.createdAt DESC
    """)
    Page<User> search(
            @Param("keyword") String keyword,
            @Param("role") Role role,
            @Param("status") UserStatus status,
            Pageable pageable
    );
}
