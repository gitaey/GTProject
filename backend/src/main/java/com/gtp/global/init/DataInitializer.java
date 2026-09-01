package com.gtp.global.init;

import com.gtp.domain.member.role.entity.PermissionEntity;
import com.gtp.domain.member.role.entity.RoleEntity;
import com.gtp.domain.member.role.repository.PermissionRepository;
import com.gtp.domain.member.role.repository.RoleRepository;
import com.gtp.domain.member.user.entity.User;
import com.gtp.domain.member.user.entity.UserStatus;
import com.gtp.domain.member.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class DataInitializer implements ApplicationRunner {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final RoleRepository roleRepository;
    private final PermissionRepository permissionRepository;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        initRoles();
        createSuperAdmin();
    }

    private void initRoles() {
        if (roleRepository.count() > 0) {
            log.info("[초기화] 역할 데이터가 이미 존재합니다.");
            return;
        }

        roleRepository.saveAll(List.of(
            RoleEntity.builder().code("SUPER_ADMIN").label("슈퍼관리자").hasSubPermission(false).isSuper(true).sortOrder(1).build(),
            RoleEntity.builder().code("MAP_ADMIN").label("지도관리자").hasSubPermission(false).isSuper(false).sortOrder(2).build(),
            RoleEntity.builder().code("MAP_USER").label("지도사용자").hasSubPermission(true).isSuper(false).sortOrder(3).build()
        ));

        permissionRepository.saveAll(List.of(
            PermissionEntity.builder().code("VIEWER").roleCode("MAP_USER").label("뷰어").sortOrder(1).build(),
            PermissionEntity.builder().code("DEPT_A").roleCode("MAP_USER").label("부서A").sortOrder(2).build(),
            PermissionEntity.builder().code("DEPT_B").roleCode("MAP_USER").label("부서B").sortOrder(3).build()
        ));

        log.info("[초기화] 역할/세부권한 기본 데이터가 생성되었습니다.");
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
                .roleCode("SUPER_ADMIN")
                .permissionCode(null)
                .status(UserStatus.ACTIVE)
                .build();

        userRepository.save(superAdmin);
        log.info("[초기화] 슈퍼관리자 계정이 생성되었습니다. (user_id: gitaey, nickname: 기빵)");
    }
}
