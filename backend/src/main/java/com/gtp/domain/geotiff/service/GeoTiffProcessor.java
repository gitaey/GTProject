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

    @Value("${titiler.container-name:gtp-titiler-local}")
    private String titilerContainerName;

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
            ProcessBuilder pb = new ProcessBuilder("docker", "exec", titilerContainerName, "python", "-c", script);
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
        double[] fromGdalinfo = getWgs84BoundsFromGdalinfo(filePath);
        if (fromGdalinfo != null) return fromGdalinfo;
        log.info("gdalinfo bounds 없음 → titiler /cog/info 폴백: {}", filePath.getFileName());
        return getWgs84BoundsFromTitiler(filePath);
    }

    private double[] getWgs84BoundsFromGdalinfo(Path filePath) {
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
                .compile("\\[\\s*([\\-0-9.eE+]+)\\s*,\\s*([\\-0-9.eE+]+)\\s*\\]")
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
            log.info("WGS84 bounds (gdalinfo): [{}, {}, {}, {}]", minLon, minLat, maxLon, maxLat);
            return new double[]{minLon, minLat, maxLon, maxLat};
        } catch (Exception e) {
            log.warn("gdalinfo bounds 실패: {}", e.getMessage());
            return null;
        }
    }

    private double[] getWgs84BoundsFromTitiler(Path filePath) {
        String filename = filePath.getFileName().toString();
        String script = String.format("""
            import rasterio, json
            from rasterio.crs import CRS
            from rasterio.warp import transform_bounds
            try:
                with rasterio.open('/data/%s') as r:
                    bounds = transform_bounds(r.crs, CRS.from_epsg(4326), *r.bounds)
                    print(json.dumps({'minLon': bounds[0], 'minLat': bounds[1], 'maxLon': bounds[2], 'maxLat': bounds[3]}))
            except Exception as e:
                print(json.dumps({'error': str(e)}))
            """, filename);
        try {
            ProcessBuilder pb = new ProcessBuilder("docker", "exec", titilerContainerName, "python", "-c", script);
            pb.redirectErrorStream(true);
            Process p = pb.start();
            String output = new String(p.getInputStream().readAllBytes()).trim();
            p.waitFor();

            java.util.regex.Matcher m = java.util.regex.Pattern
                .compile("\"minLon\":\\s*([\\-0-9.eE+]+).*?\"minLat\":\\s*([\\-0-9.eE+]+).*?\"maxLon\":\\s*([\\-0-9.eE+]+).*?\"maxLat\":\\s*([\\-0-9.eE+]+)")
                .matcher(output);
            if (!m.find()) {
                log.warn("titiler bounds 파싱 실패: {}", output);
                return null;
            }
            double minLon = Double.parseDouble(m.group(1));
            double minLat = Double.parseDouble(m.group(2));
            double maxLon = Double.parseDouble(m.group(3));
            double maxLat = Double.parseDouble(m.group(4));
            if (minLon < -180 || maxLon > 180 || minLat < -90 || maxLat > 90) {
                log.warn("titiler bounds 범위 초과: [{}, {}, {}, {}]", minLon, minLat, maxLon, maxLat);
                return null;
            }
            log.info("WGS84 bounds (titiler docker exec): [{}, {}, {}, {}]", minLon, minLat, maxLon, maxLat);
            return new double[]{minLon, minLat, maxLon, maxLat};
        } catch (IOException e) {
            log.warn("titiler docker exec 실패: {}", e.getMessage());
            return null;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return null;
        }
    }
}
