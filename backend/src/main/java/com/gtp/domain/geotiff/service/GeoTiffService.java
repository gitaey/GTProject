package com.gtp.domain.geotiff.service;

import com.gtp.domain.geotiff.dto.GeoTiffListItem;
import com.gtp.domain.geotiff.dto.GeoTiffStatusResponse;
import com.gtp.domain.geotiff.dto.GeoTiffUploadResponse;
import com.gtp.domain.geotiff.entity.GeoTiffFile;
import com.gtp.domain.geotiff.repository.GeoTiffFileRepository;
import com.gtp.global.exception.CustomException;
import com.gtp.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class GeoTiffService {

    private final GeoTiffFileRepository geoTiffFileRepository;
    private final GeoTiffProcessor geoTiffProcessor;

    @Value("${geotiff.upload-dir:./geotiff-uploads}")
    private String uploadDir;

    @Value("${titiler.url:http://localhost:8000}")
    private String titilerUrl;

    public GeoTiffUploadResponse upload(MultipartFile file, String uploadedBy) {
        String originalName = file.getOriginalFilename();
        if (originalName == null || (!originalName.toLowerCase().endsWith(".tif") && !originalName.toLowerCase().endsWith(".tiff"))) {
            throw new CustomException(ErrorCode.INVALID_FILE_TYPE);
        }

        String extension = originalName.substring(originalName.lastIndexOf('.'));
        String storedName = UUID.randomUUID().toString() + extension;

        Path uploadPath = Paths.get(uploadDir);
        try {
            Files.createDirectories(uploadPath);
            Path filePath = uploadPath.toAbsolutePath().resolve(storedName);
            Files.copy(file.getInputStream(), filePath, StandardCopyOption.REPLACE_EXISTING);

            GeoTiffFile entity = GeoTiffFile.builder()
                    .originalName(originalName)
                    .storedName(storedName)
                    .filePath(filePath.toAbsolutePath().toString())
                    .uploadedBy(uploadedBy)
                    .fileSize(file.getSize())
                    .build();

            GeoTiffFile saved = geoTiffFileRepository.save(entity);

            // 비동기로 COG 변환 + WGS84 bounds 처리
            geoTiffProcessor.process(saved.getId(), filePath);

            return GeoTiffUploadResponse.builder()
                    .id(saved.getId())
                    .originalName(saved.getOriginalName())
                    .tileUrl(buildTileUrl(saved.getId()))
                    .uploadedAt(saved.getUploadedAt())
                    .fileSize(saved.getFileSize())
                    .status(saved.getStatus())
                    .build();

        } catch (IOException e) {
            throw new CustomException(ErrorCode.FILE_UPLOAD_FAILED);
        }
    }

    public List<GeoTiffListItem> findAll(String uploadedBy) {
        List<GeoTiffFile> files = (uploadedBy != null && !uploadedBy.isBlank())
                ? geoTiffFileRepository.findAllByUploadedByOrderByUploadedAtDesc(uploadedBy)
                : geoTiffFileRepository.findAllByOrderByUploadedAtDesc();
        return files.stream()
                .map(f -> GeoTiffListItem.builder()
                        .id(f.getId())
                        .originalName(f.getOriginalName())
                        .tileUrl(buildTileUrl(f.getId()))
                        .uploadedAt(f.getUploadedAt())
                        .fileSize(f.getFileSize())
                        .status(f.getStatus())
                        .minLon(f.getMinLon())
                        .minLat(f.getMinLat())
                        .maxLon(f.getMaxLon())
                        .maxLat(f.getMaxLat())
                        .build())
                .collect(Collectors.toList());
    }

    public GeoTiffStatusResponse getStatus(Long id) {
        GeoTiffFile file = geoTiffFileRepository.findById(id)
                .orElseThrow(() -> new CustomException(ErrorCode.GEOTIFF_NOT_FOUND));
        return GeoTiffStatusResponse.builder()
                .id(file.getId())
                .status(file.getStatus())
                .errorMessage(file.getErrorMessage())
                .tileUrl("READY".equals(file.getStatus()) ? buildTileUrl(file.getId()) : null)
                .minLon(file.getMinLon())
                .minLat(file.getMinLat())
                .maxLon(file.getMaxLon())
                .maxLat(file.getMaxLat())
                .build();
    }

    public void reprocessBounds(Long id) {
        GeoTiffFile file = geoTiffFileRepository.findById(id)
                .orElseThrow(() -> new CustomException(ErrorCode.GEOTIFF_NOT_FOUND));
        file.updateProcessing();
        geoTiffFileRepository.save(file);
        geoTiffProcessor.process(id, Paths.get(file.getFilePath()));
    }

    public void delete(Long id) {
        GeoTiffFile file = geoTiffFileRepository.findById(id)
                .orElseThrow(() -> new CustomException(ErrorCode.GEOTIFF_NOT_FOUND));
        try {
            Files.deleteIfExists(Paths.get(file.getFilePath()));
        } catch (IOException e) {
            // 파일 삭제 실패해도 DB는 삭제 진행
        }
        geoTiffFileRepository.delete(file);
    }

    public byte[] getTile(Long id, int z, int x, int y) {
        GeoTiffFile file = geoTiffFileRepository.findById(id).orElse(null);
        if (file == null || !"READY".equals(file.getStatus())) return null;
        String url = titilerUrl + "/cog/tiles/WebMercatorQuad/" + z + "/" + x + "/" + y
                + ".png?url=file:///data/" + file.getStoredName();
        try {
            java.net.HttpURLConnection conn = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(30000);
            if (conn.getResponseCode() != 200) return null;
            return conn.getInputStream().readAllBytes();
        } catch (Exception e) {
            log.warn("타일 요청 실패 z={} x={} y={}: {}", z, x, y, e.getMessage());
            return null;
        }
    }

    private String buildTileUrl(Long id) {
        return "/api/geotiff/tiles/" + id + "/{z}/{x}/{y}.png";
    }
}
