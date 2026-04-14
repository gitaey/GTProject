package com.gtp.global.init;

import com.gtp.domain.user.entity.Role;
import com.gtp.domain.user.entity.User;
import com.gtp.domain.user.entity.UserStatus;
import com.gtp.domain.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Component
@RequiredArgsConstructor
public class DataInitializer implements ApplicationRunner {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        createSuperAdmin();
    }

    private void createSuperAdmin() {
        if (userRepository.existsByUserId("gitaey")) {
            log.info("[초기화] 슈퍼관리자 계정이 이미 존재합니다. (user_id: gitaey)");
            return;
        }

        User superAdmin = User.builder()
                .userId("gitaey")
                .nickname("기빵")
                .email(null)
                .password(passwordEncoder.encode("sis3047!@"))
                .role(Role.SUPER_ADMIN)
                .permission(null)
                .status(UserStatus.ACTIVE)
                .build();

        userRepository.save(superAdmin);
        log.info("[초기화] 슈퍼관리자 계정이 생성되었습니다. (user_id: gitaey, nickname: 기빵)");
    }
}
