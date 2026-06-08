package com.gtp.domain.schedule.service;

import com.google.api.client.googleapis.javanet.GoogleNetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import com.google.api.services.sheets.v4.Sheets;
import com.google.api.services.sheets.v4.model.ValueRange;
import com.google.auth.http.HttpCredentialsAdapter;
import com.google.auth.oauth2.GoogleCredentials;
import com.gtp.domain.schedule.dto.CharacterScheduleItem;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Slf4j
@Service
public class GoogleSheetsService {

    @Value("${google.sheets.spreadsheet-id}")
    private String spreadsheetId;

    @Value("${google.sheets.sheet-name}")
    private String sheetName;

    @Value("${google.sheets.credentials-path}")
    private Resource credentialsResource;

    private Sheets sheetsService;

    // 헤더 행 인덱스 (시트 3행 = 배열 인덱스 0)
    private static final int HEADER_ROW_INDEX = 0;
    // 닉네임 열 인덱스 (B열 = 인덱스 1)
    private static final int NICK_COL_INDEX = 1;
    // 레이드 시작 열 인덱스 (G열 = 인덱스 6)
    private static final int RAID_START_COL_INDEX = 6;
    // 캐시 유효 시간 (5분)
    private static final long CACHE_TTL_MS = 5 * 60 * 1000L;

    private List<List<Object>> cachedData = null;
    private long cacheTime = 0;

    @PostConstruct
    public void init() {
        try {
            GoogleCredentials credentials = GoogleCredentials
                    .fromStream(credentialsResource.getInputStream())
                    .createScoped("https://www.googleapis.com/auth/spreadsheets.readonly");

            sheetsService = new Sheets.Builder(
                    GoogleNetHttpTransport.newTrustedTransport(),
                    GsonFactory.getDefaultInstance(),
                    new HttpCredentialsAdapter(credentials))
                    .setApplicationName("GuildRaidBot")
                    .build();

            log.info("Google Sheets 서비스 초기화 완료");
        } catch (Exception e) {
            log.error("Google Sheets 서비스 초기화 실패: {}", e.getMessage());
        }
    }

    /**
     * 캐릭터 이름으로 레이드 일정 조회
     * 레이드현황판 시트에서 닉네임(B열) 기준으로 검색
     */
    // 시트 전체 데이터를 캐싱해서 읽기 (5분 TTL)
    private List<List<Object>> getSheetData() throws IOException {
        long now = System.currentTimeMillis();
        if (cachedData != null && (now - cacheTime) < CACHE_TTL_MS) {
            return cachedData;
        }
        String range = sheetName + "!A3:Z";
        ValueRange response = sheetsService.spreadsheets().values()
                .get(spreadsheetId, range)
                .execute();
        cachedData = response.getValues();
        cacheTime = now;
        log.info("Google Sheets 데이터 캐시 갱신");
        return cachedData;
    }

    public List<CharacterScheduleItem> getCharacterSchedule(String characterName) {
        if (sheetsService == null) {
            log.error("Google Sheets 서비스가 초기화되지 않았습니다.");
            return Collections.emptyList();
        }

        try {
            List<List<Object>> values = getSheetData();
            if (values == null || values.size() < 2) {
                return Collections.emptyList();
            }

            // 0행 = 헤더 (레이드명)
            List<Object> headers = values.get(HEADER_ROW_INDEX);

            // 1행부터 캐릭터 데이터 탐색
            for (int i = 1; i < values.size(); i++) {
                List<Object> row = values.get(i);
                if (row.size() <= NICK_COL_INDEX) continue;

                String nick = String.valueOf(row.get(NICK_COL_INDEX)).trim();
                if (!nick.equals(characterName)) continue;

                // 캐릭터 찾음 - 레이드 열 파싱
                List<CharacterScheduleItem> result = new ArrayList<>();

                for (int col = RAID_START_COL_INDEX; col < headers.size(); col++) {
                    if (col >= row.size()) break;

                    String raidName = String.valueOf(headers.get(col)).trim();
                    String schedule = String.valueOf(row.get(col)).trim();

                    if (raidName.isEmpty() || schedule.isEmpty()) continue;

                    // 빈 셀이나 기본 배경 문자 제외
                    result.add(new CharacterScheduleItem(raidName, schedule));
                }

                return result;
            }

            return Collections.emptyList();

        } catch (IOException e) {
            log.error("Google Sheets 조회 오류: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    public List<List<Object>> getRawData() {
        try {
            List<List<Object>> data = getSheetData();
            return data != null ? data.subList(0, Math.min(8, data.size())) : Collections.emptyList();
        } catch (IOException e) {
            log.error("raw data 조회 오류: {}", e.getMessage());
            return Collections.emptyList();
        }
    }
}
