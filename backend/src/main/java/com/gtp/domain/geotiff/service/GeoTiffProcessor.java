package com.gtp.domain.geotiff.service;

import com.gtp.domain.geotiff.entity.GeoTiffFile;
import com.gtp.domain.geotiff.repository.GeoTiffFileRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

@Slf4j
@Component
@RequiredArgsConstructor
public class GeoTiffProcessor {

    private final GeoTiffFileRepository repository;

    @Value("${titiler.url:http://localhost:8000}")
    private String titilerUrl;

    @Async
    public void process(Long id, Path filePath) {
        GeoTiffFile file = repository.findById(id).orElse(null);
        if (file == null) return;
        try {
            convertToCog(filePath);
            double[] wgs84 = getWgs84Bounds(filePath);
            if (wgs84 != null) {
                file.updateReady(wgs84[0], wgs84[1], wgs84[2], wgs84[3]);
            } else {
                file.updateReady(null, null, null, null);
            }
            repository.save(file);
            log.info("GeoTIFF 처리 완료 id={}", id);
        } catch (Exception e) {
            log.error("GeoTIFF 처리 실패 id={}: {}", id, e.getMessage());
            file.updateFailed(e.getMessage());
            repository.save(file);
        }
    }

    private void convertToCog(Path srcPath) {
        if (tryGdalTranslate(srcPath)) return;
        log.info("gdal_translate 없음 → titiler 컨테이너로 COG 변환 시도");
        tryTitilerCogConvert(srcPath);
    }

    private boolean tryGdalTranslate(Path srcPath) {
        Path tmpPath = srcPath.resolveSibling(srcPath.getFileName() + ".cog.tmp.tif");
        try {
            ProcessBuilder pb = new ProcessBuilder(
                "gdal_translate", "-of", "COG",
                "-co", "COMPRESS=DEFLATE",
                "-co", "BLOCKSIZE=512",
                "-co", "OVERVIEWS=AUTO",
                srcPath.toString(), tmpPath.toString()
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

    private double[] getWgs84Bounds(Path filePath) {
        try {
            ProcessBuilder pb = new ProcessBuilder("gdalinfo", "-json", filePath.toString());
            pb.redirectErrorStream(true);
            Process p = pb.start();
            String output = new String(p.getInputStream().readAllBytes()).trim();
            p.waitFor();
            int idx = output.indexOf("\"wgs84Extent\"");
            if (idx < 0) return null;
            String sub = output.substring(idx);
            java.util.regex.Matcher m = java.util.regex.Pattern
                .compile("\\[\\s*([\\-0-9.]+)\\s*,\\s*([\\-0-9.]+)\\s*\\]")
                .matcher(sub);
            double minLon = Double.MAX_VALUE, minLat = Double.MAX_VALUE;
            double maxLon = -Double.MAX_VALUE, maxLat = -Double.MAX_VALUE;
            while (m.find()) {
                double lon = Double.parseDouble(m.group(1));
                double lat = Double.parseDouble(m.group(2));
                if (lon < -180 || lon > 180 || lat < -90 || lat > 90) continue;
                minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
                minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
            }
            if (minLon == Double.MAX_VALUE) return null;
            log.info("WGS84 bounds: [{}, {}, {}, {}]", minLon, minLat, maxLon, maxLat);
            return new double[]{minLon, minLat, maxLon, maxLat};
        } catch (Exception e) {
            log.warn("WGS84 bounds 계산 실패: {}", e.getMessage());
            return null;
        }
    }
}
