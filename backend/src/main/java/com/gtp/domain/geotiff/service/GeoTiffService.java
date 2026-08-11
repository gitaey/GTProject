package com.gtp.domain.geotiff.service;

import com.gtp.domain.geotiff.dto.GeoTiffListItem;
import com.gtp.domain.geotiff.dto.GeoTiffUploadResponse;
import com.gtp.domain.geotiff.entity.GeoTiffFile;
import com.gtp.domain.geotiff.repository.GeoTiffFileRepository;
import com.gtp.global.exception.CustomException;
import com.gtp.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
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
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
@RequiredArgsConstructor
public class GeoTiffService {

    private final GeoTiffFileRepository geoTiffFileRepository;

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
            convertToCog(filePath);
            double[] wgs84 = getWgs84Bounds(storedName);

            GeoTiffFile entity = GeoTiffFile.builder()
                    .originalName(originalName)
                    .storedName(storedName)
                    .filePath(filePath.toAbsolutePath().toString())
                    .uploadedBy(uploadedBy)
                    .fileSize(file.getSize())
                    .minLon(wgs84 != null ? wgs84[0] : null)
                    .minLat(wgs84 != null ? wgs84[1] : null)
                    .maxLon(wgs84 != null ? wgs84[2] : null)
                    .maxLat(wgs84 != null ? wgs84[3] : null)
                    .build();

            GeoTiffFile saved = geoTiffFileRepository.save(entity);

            String tileUrl = buildTileUrl(storedName);

            return GeoTiffUploadResponse.builder()
                    .id(saved.getId())
                    .originalName(saved.getOriginalName())
                    .tileUrl(tileUrl)
                    .uploadedAt(saved.getUploadedAt())
                    .fileSize(saved.getFileSize())
                    .minLon(saved.getMinLon())
                    .minLat(saved.getMinLat())
                    .maxLon(saved.getMaxLon())
                    .maxLat(saved.getMaxLat())
                    .build();

        } catch (IOException e) {
            throw new CustomException(ErrorCode.FILE_UPLOAD_FAILED);
        }
    }

    public List<GeoTiffListItem> findAll() {
        return geoTiffFileRepository.findAllByOrderByUploadedAtDesc().stream()
                .map(f -> GeoTiffListItem.builder()
                        .id(f.getId())
                        .originalName(f.getOriginalName())
                        .tileUrl(buildTileUrl(f.getStoredName()))
                        .uploadedAt(f.getUploadedAt())
                        .fileSize(f.getFileSize())
                        .minLon(f.getMinLon())
                        .minLat(f.getMinLat())
                        .maxLon(f.getMaxLon())
                        .maxLat(f.getMaxLat())
                        .build())
                .collect(Collectors.toList());
    }

    public void delete(Long id) {
        GeoTiffFile file = geoTiffFileRepository.findById(id)
                .orElseThrow(() -> new CustomException(ErrorCode.GEOTIFF_NOT_FOUND));

        try {
            Path filePath = Paths.get(file.getFilePath());
            Files.deleteIfExists(filePath);
        } catch (IOException e) {
            // 파일 삭제 실패해도 DB는 삭제 진행
        }

        geoTiffFileRepository.delete(file);
    }

    private void convertToCog(Path srcPath) {
        if (tryGdalTranslate(srcPath)) return;
        log.info("gdal_translate 없음 → titiler 컨테이너로 COG 변환 시도");
        tryTitilerCogConvert(srcPath);
    }

    private double[] getWgs84Bounds(String filename) {
        String script = String.format("""
            import rasterio
            from rasterio.warp import transform_bounds
            with rasterio.open('/data/%s') as r:
                b = transform_bounds(r.crs, 'EPSG:4326', *r.bounds)
                print(f'{b[0]},{b[1]},{b[2]},{b[3]}')
            """, filename);
        try {
            ProcessBuilder pb = new ProcessBuilder("docker", "exec", "gtp-titiler-local", "python", "-c", script);
            pb.redirectErrorStream(true);
            Process p = pb.start();
            String output = new String(p.getInputStream().readAllBytes()).trim();
            p.waitFor();
            String[] parts = output.split(",");
            if (parts.length == 4) {
                return new double[]{
                    Double.parseDouble(parts[0]), Double.parseDouble(parts[1]),
                    Double.parseDouble(parts[2]), Double.parseDouble(parts[3])
                };
            }
        } catch (Exception e) {
            log.warn("WGS84 bounds 계산 실패: {}", e.getMessage());
        }
        return null;
    }

    private boolean tryGdalTranslate(Path srcPath) {
        Path tmpPath = srcPath.resolveSibling(srcPath.getFileName() + ".cog.tmp.tif");
        try {
            ProcessBuilder pb = new ProcessBuilder(
                "gdal_translate",
                "-of", "COG",
                "-co", "COMPRESS=DEFLATE",
                "-co", "BLOCKSIZE=512",
                "-co", "OVERVIEWS=AUTO",
                srcPath.toString(),
                tmpPath.toString()
            );
            pb.redirectErrorStream(true);
            int exitCode = pb.start().waitFor();
            if (exitCode == 0) {
                Files.move(tmpPath, srcPath, StandardCopyOption.REPLACE_EXISTING);
                log.info("COG 변환 완료 (gdal_translate): {}", srcPath.getFileName());
                return true;
            }
            Files.deleteIfExists(tmpPath);
            return false;
        } catch (IOException e) {
            return false;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    private void tryTitilerCogConvert(Path srcPath) {
        String filename = srcPath.getFileName().toString();
        String script = String.format("""
            import rasterio, shutil
            from rasterio.enums import Resampling
            src='/data/%s'; dst='/data/%s.cog.tmp.tif'
            with rasterio.open(src) as r:
                p=r.profile.copy()
                p.update(driver='GTiff',tiled=True,blockxsize=512,blockysize=512,compress='deflate',interleave='band')
                with rasterio.open(dst,'w',**p) as w:
                    for i in range(1,r.count+1): w.write(r.read(i),i)
                    w.build_overviews([2,4,8,16,32],Resampling.average)
                    w.update_tags(ns='rio_overview',resampling='average')
            shutil.move(dst,src)
            print('done')
            """, filename, filename);
        try {
            ProcessBuilder pb = new ProcessBuilder("docker", "exec", "gtp-titiler-local", "python", "-c", script);
            pb.redirectErrorStream(true);
            int exitCode = pb.start().waitFor();
            if (exitCode == 0) {
                log.info("COG 변환 완료 (titiler 컨테이너): {}", filename);
            } else {
                log.warn("COG 변환 실패 (titiler 컨테이너 exitCode={})", exitCode);
            }
        } catch (IOException e) {
            log.warn("docker exec 실행 불가: {}", e.getMessage());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private String buildTileUrl(String storedName) {
        return titilerUrl + "/cog/tiles/WebMercatorQuad/{z}/{x}/{y}.png?url=file:///data/" + storedName;
    }
}
