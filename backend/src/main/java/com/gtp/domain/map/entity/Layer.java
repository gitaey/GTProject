package com.gtp.domain.map.entity;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

@Entity
@Table(name = "tbl_layer")
@EntityListeners(AuditingEntityListener.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Builder
@AllArgsConstructor
public class Layer {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false, length = 20)
    private String type; // WMS, WMTS, TMS, WFS, MVT, GEOJSON, ARCGIS, XYZ

    @Column(name = "source_type", nullable = false, length = 20)
    private String sourceType; // OPENAPI, GEOSERVER, GEOWEBCACHE, XYZ, STATIC

    @Column(nullable = false, length = 500)
    private String url;

    @Column(name = "layer_name", length = 200)
    private String layerName;

    @Column(name = "style_name", length = 100)
    private String styleName;

    @Column(name = "style_config", columnDefinition = "TEXT")
    private String styleConfig;

    @Column(length = 50)
    private String format;

    @Column(length = 20)
    private String projection;

    @Column(name = "min_zoom")
    private Integer minZoom;

    @Column(name = "max_zoom")
    private Integer maxZoom;

    @Column(nullable = false)
    @Builder.Default
    private double opacity = 1.0;

    @Column(nullable = false)
    @Builder.Default
    private boolean visible = true;

    @Column(name = "sort_order", nullable = false)
    @Builder.Default
    private int sortOrder = 0;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "group_id")
    private LayerGroup group;

    @Column(name = "group_name", length = 100)
    private String groupName;

    @Column(length = 300)
    private String description;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    public void update(String name, String type, String sourceType, String url, String layerName,
                       String styleName, String styleConfig, String format, String projection,
                       Integer minZoom, Integer maxZoom, double opacity, boolean visible,
                       int sortOrder, LayerGroup group, String description) {
        this.name = name;
        this.type = type;
        this.sourceType = sourceType;
        this.url = url;
        this.layerName = layerName;
        this.styleName = styleName;
        this.styleConfig = styleConfig;
        this.format = format;
        this.projection = projection;
        this.minZoom = minZoom;
        this.maxZoom = maxZoom;
        this.opacity = opacity;
        this.visible = visible;
        this.sortOrder = sortOrder;
        this.group = group;
        this.groupName = group != null ? group.getName() : null;
        this.description = description;
    }

    public void updateSortOrderAndGroup(int sortOrder, LayerGroup group) {
        this.sortOrder = sortOrder;
        this.group = group;
        this.groupName = group != null ? group.getName() : null;
    }
}
