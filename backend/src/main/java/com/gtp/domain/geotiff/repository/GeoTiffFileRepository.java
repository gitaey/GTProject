package com.gtp.domain.geotiff.repository;

import com.gtp.domain.geotiff.entity.GeoTiffFile;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface GeoTiffFileRepository extends JpaRepository<GeoTiffFile, Long> {
    List<GeoTiffFile> findAllByOrderByUploadedAtDesc();
}
