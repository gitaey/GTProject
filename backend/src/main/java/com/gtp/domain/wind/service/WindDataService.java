package com.gtp.domain.wind.service;

import com.gtp.domain.wind.entity.WindFrameEntity;
import com.gtp.domain.wind.repository.WindFrameRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.nullschool.grib2json.Grib2Json;
import net.nullschool.grib2json.Options;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.lexicalscope.jewel.cli.CliFactory;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * NOAA GFS(0.25도) 바람 데이터를 6시간마다 내려받아 grib2json 포맷으로 변환 후 저장한다.
 * 한 사이클(00/06/12/18 UTC)마다 forecastHour 0~5의 시간별 프레임을 받아두면,
 * 프론트에서는 매시간 다음 프레임으로 넘어가며 보여줄 수 있다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WindDataService {

    private final WindFrameRepository windFrameRepository;

    @Value("${wind.nomads-base-url}")
    private String nomadsBaseUrl;

    @Value("${wind.bbox.left-lon}")
    private double leftLon;
    @Value("${wind.bbox.right-lon}")
    private double rightLon;
    @Value("${wind.bbox.top-lat}")
    private double topLat;
    @Value("${wind.bbox.bottom-lat}")
    private double bottomLat;

    @Value("${wind.forecast-hours}")
    private int forecastHours;

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(15))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    /* GFS는 하루 4번(00/06/12/18 UTC)만 생산되고, 생산 후 실제로 다운로드 가능해지기까지
       통상 3~4시간이 걸린다. 각 사이클 + 4시간 10분 뒤에 갱신을 시도한다. */
    @Scheduled(cron = "0 10 4,10,16,22 * * *", zone = "UTC")
    public void scheduledRefresh() {
        try {
            refresh();
        } catch (Exception e) {
            log.error("[바람길] GFS 데이터 갱신 실패", e);
        }
    }

    @Transactional
    public void refresh() {
        LocalDateTime latencyAdjustedNow = LocalDateTime.now(ZoneOffset.UTC).minusHours(4);
        int cycleHour = (latencyAdjustedNow.getHour() / 6) * 6;
        LocalDate cycleDate = latencyAdjustedNow.toLocalDate();

        if (windFrameRepository.existsByCycleDateAndCycleHour(cycleDate, cycleHour)) {
            log.info("[바람길] 이미 최신 사이클({} {}Z) 데이터가 있어 건너뜀", cycleDate, cycleHour);
            return;
        }

        log.info("[바람길] GFS {} {}Z 사이클 다운로드 시작 (f000~f{})", cycleDate, cycleHour, String.format("%03d", forecastHours - 1));

        for (int fh = 0; fh < forecastHours; fh++) {
            try {
                File gribFile = downloadGrib(cycleDate, cycleHour, fh);
                String json = convertToJson(gribFile);
                Files.deleteIfExists(gribFile.toPath());

                windFrameRepository.save(WindFrameEntity.builder()
                        .cycleDate(cycleDate)
                        .cycleHour(cycleHour)
                        .forecastHour(fh)
                        .validTime(cycleDate.atStartOfDay().plusHours(cycleHour + fh))
                        .dataJson(json)
                        .build());
            } catch (Exception e) {
                log.error("[바람길] f{} 프레임 처리 실패", String.format("%03d", fh), e);
            }
        }

        windFrameRepository.deleteAllExceptCycle(cycleDate, cycleHour);
        log.info("[바람길] GFS {} {}Z 사이클 갱신 완료", cycleDate, cycleHour);
    }

    private File downloadGrib(LocalDate cycleDate, int cycleHour, int forecastHour) throws IOException, InterruptedException {
        String dateStr = cycleDate.format(DateTimeFormatter.BASIC_ISO_DATE); // yyyyMMdd
        String cc = String.format("%02d", cycleHour);
        String fff = String.format("%03d", forecastHour);

        // subregion= 파라미터가 없으면 leftlon/rightlon/toplat/bottomlat이 무시되고 전지구 격자가 내려온다
        String url = nomadsBaseUrl
                + "?file=gfs.t" + cc + "z.pgrb2.0p25.f" + fff
                + "&var_UGRD=on&var_VGRD=on&lev_10_m_above_ground=on"
                + "&subregion="
                + "&leftlon=" + leftLon + "&rightlon=" + rightLon
                + "&toplat=" + topLat + "&bottomlat=" + bottomLat
                + "&dir=%2Fgfs." + dateStr + "%2F" + cc + "%2Fatmos";

        HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(60))
                .GET()
                .build();

        HttpResponse<byte[]> response = httpClient.send(request, HttpResponse.BodyHandlers.ofByteArray());
        if (response.statusCode() != 200 || response.body().length == 0) {
            throw new IOException("GFS 다운로드 실패: HTTP " + response.statusCode() + " (" + url + ")");
        }

        File tmpFile = File.createTempFile("gfs-" + dateStr + cc + "f" + fff + "-", ".grib2");
        Files.write(tmpFile.toPath(), response.body());
        return tmpFile;
    }

    private String convertToJson(File gribFile) throws IOException {
        Options options = CliFactory.parseArguments(Options.class, new String[]{
                "--fp", "wind", "-d", "-n", gribFile.getAbsolutePath()
        });
        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            new Grib2Json(gribFile, List.of(options), out).write();
            return out.toString(StandardCharsets.UTF_8);
        }
    }
}
