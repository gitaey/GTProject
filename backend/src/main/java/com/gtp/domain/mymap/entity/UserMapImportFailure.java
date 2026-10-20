package com.gtp.domain.mymap.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * 엑셀 가져오기에서 지도에 오르지 못한 행(결과 보고서·실패 행 엑셀). 다른 엔티티와 FK로 묶지 않는다 —
 * 레이어를 지울 때 앱이 함께 지우고, 30일이 지나면 정리 작업이 지운다. 쓰기는 JdbcTemplate 배치(UserMapImportStore),
 * 읽기는 이 엔티티의 리포지토리.
 */
@Entity
@Table(name = "tbl_user_map_import_failure")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class UserMapImportFailure {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_map_id", nullable = false)
    private Long userMapId;

    /** 엑셀 행 번호(머리글 = 1) */
    @Column(name = "row_no", nullable = false)
    private int rowNo;

    @Column(name = "reason_code", nullable = false, length = 30)
    private String reasonCode;

    /** 매칭에 쓴 칸의 값 */
    @Column(name = "input_value", length = 500)
    private String inputValue;

    /** AMBIGUOUS 후보 ["…", …] */
    @Column(name = "candidates_json", columnDefinition = "TEXT")
    private String candidatesJson;

    /** 원본 행 전체 {컬럼: 값} — 실패 행 엑셀용 */
    @Column(name = "row_json", nullable = false, columnDefinition = "TEXT")
    private String rowJson;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
