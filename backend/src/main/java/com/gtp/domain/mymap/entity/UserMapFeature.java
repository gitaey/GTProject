package com.gtp.domain.mymap.entity;

import jakarta.persistence.*;
import lombok.*;

/**
 * UserMap 한 장에 속한 개별 피처(점/선/면) 하나.
 * geometryJson은 EPSG:4326 좌표의 GeoJSON geometry 객체 문자열 (hibernate-spatial 미사용 —
 * 특정 DB에 종속되지 않도록 텍스트로 저장).
 */
@Entity
@Table(name = "tbl_user_map_feature")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class UserMapFeature {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_map_id", nullable = false)
    private UserMap userMap;

    @Column(name = "geometry_json", nullable = false, columnDefinition = "TEXT")
    private String geometryJson;

    @Column(name = "properties_json", columnDefinition = "TEXT")
    private String propertiesJson;
}
