package com.gtp.domain.geotiff.controller;

import com.gtp.domain.geotiff.dto.GeoTiffListItem;
import com.gtp.domain.geotiff.dto.GeoTiffUploadResponse;
import com.gtp.domain.geotiff.service.GeoTiffService;
import com.gtp.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
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
        return ResponseEntity.ok(ApiResponse.ok(geoTiffService.findAll()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        geoTiffService.delete(id);
        return ResponseEntity.ok(ApiResponse.ok(null));
    }
}
