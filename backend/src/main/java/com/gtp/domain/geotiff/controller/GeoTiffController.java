package com.gtp.domain.geotiff.controller;

import com.gtp.domain.geotiff.dto.GeoTiffListItem;
import com.gtp.domain.geotiff.dto.GeoTiffStatusResponse;
import com.gtp.domain.geotiff.dto.GeoTiffUploadResponse;
import com.gtp.domain.geotiff.service.GeoTiffService;
import com.gtp.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/geotiff")
@RequiredArgsConstructor
public class GeoTiffController {

    private final GeoTiffService geoTiffService;

    @PostMapping("/upload")
    public ResponseEntity<ApiResponse<GeoTiffUploadResponse>> upload(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "uploadedBy", required = false) String uploadedBy) {
        GeoTiffUploadResponse response = geoTiffService.upload(file, uploadedBy);
        return ResponseEntity.ok(ApiResponse.ok(response));
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<GeoTiffListItem>>> findAll() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        String userId = (auth != null && auth.isAuthenticated() && !"anonymousUser".equals(auth.getName()))
                ? auth.getName() : null;
        return ResponseEntity.ok(ApiResponse.ok(geoTiffService.findAll(userId)));
    }

    @GetMapping("/{id}/status")
    public ResponseEntity<ApiResponse<GeoTiffStatusResponse>> getStatus(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(geoTiffService.getStatus(id)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        geoTiffService.delete(id);
        return ResponseEntity.ok(ApiResponse.ok(null));
    }

    @PostMapping("/{id}/reprocess-bounds")
    public ResponseEntity<ApiResponse<Void>> reprocessBounds(@PathVariable Long id) {
        geoTiffService.reprocessBounds(id);
        return ResponseEntity.ok(ApiResponse.ok(null));
    }

    @GetMapping("/tiles/{id}/{z}/{x}/{y}.png")
    public ResponseEntity<byte[]> getTile(
            @PathVariable Long id,
            @PathVariable int z,
            @PathVariable int x,
            @PathVariable int y) {
        byte[] tile = geoTiffService.getTile(id, z, x, y);
        if (tile == null) return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        return ResponseEntity.ok().contentType(MediaType.IMAGE_PNG).body(tile);
    }
}
