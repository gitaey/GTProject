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
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

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

    // ── 레이드일정 시트 구조 ──────────────────────────────────────────
    // 범위 A4:Z 기준 (4행부터 읽음)
    // index 0 = 4행(요일), 1 = 5행(시간), 2 = 6행(숙련도), 3 = 7행(레이드명)
    // index 4~ = 데이터 (캐릭터 슬롯, 슬롯당 4행)
    //   슬롯 내부: +0=닉네임, +1=클래스, +2=아이템레벨, +3=전투력
    // H열(index 7)부터 파티 데이터 시작, 각 열이 하나의 파티
    private static final int ROW_DAY        = 0;  // 요일
    private static final int ROW_TIME       = 1;  // 시간
    private static final int ROW_RAID       = 3;  // 레이드명
    private static final int DATA_START_ROW = 5;  // 첫 번째 슬롯 닉네임 행 (index 4는 단계 행)
    private static final int DATA_START_COL = 7;  // H열 (0-indexed)
    private static final int SLOT_SIZE      = 4;  // 슬롯당 행 수
    private static final int SLOT_CLASS     = 1;  // 슬롯 내 클래스 offset
    private static final int SLOT_POWER     = 3;  // 슬롯 내 전투력 offset

    // 서폿 직업 목록 (클래스만으로 [S]/[D] 판단)
    private static final Set<String> SUPPORT_CLASSES = new HashSet<>(
            Arrays.asList("바드", "홀리나이트", "도화가", "발키리"));

    // 캐시 유효 시간 (5분)
    private static final long CACHE_TTL_MS = 5 * 60 * 1000L;

    private volatile List<List<Object>> cachedData = null;
    private volatile long cacheTime = 0;

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

    // 시트 전체 데이터 캐싱 (5분 TTL), A4부터 읽음
    private List<List<Object>> getSheetData() throws IOException {
        long now = System.currentTimeMillis();
        if (cachedData != null && (now - cacheTime) < CACHE_TTL_MS) {
            return cachedData;
        }
        String range = sheetName + "!A4:Z";
        ValueRange response = sheetsService.spreadsheets().values()
                .get(spreadsheetId, range)
                .execute();
        cachedData = response.getValues();
        cacheTime = now;
        log.info("Google Sheets 데이터 캐시 갱신");
        return cachedData;
    }

    /** 특정 행의 col 번째 셀 값을 반환 (범위 초과 시 빈 문자열) */
    private String cell(List<Object> row, int col) {
        if (row == null || col >= row.size()) return "";
        return String.valueOf(row.get(col)).trim();
    }

    /** values 배열에서 안전하게 행 반환 */
    private List<Object> row(List<List<Object>> values, int idx) {
        if (idx < 0 || idx >= values.size()) return Collections.emptyList();
        return values.get(idx);
    }

    /**
     * [S]/[D] 닉네임 | 전투력 형식으로 포맷
     * 클래스만으로 서폿 여부 판단 (레이드일정 시트에는 아크패시브 열 없음)
     * powerCell = 시트의 전투력 셀 원본 (예: "2151.73 / L6731.48")
     */
    private String formatMember(String nick, String cls, String powerCell) {
        boolean isSupport = SUPPORT_CLASSES.contains(cls.trim());
        String tag = isSupport ? "[S]" : "[D]";
        StringBuilder sb = new StringBuilder(tag).append(" ").append(nick);
        if (!powerCell.isEmpty()) {
            // "7156.97 / L7044.36" 형식에서 앞부분(전투력)만 추출
            String power = powerCell.contains(" / ") ? powerCell.split(" / ")[0] : powerCell;
            sb.append(" | ").append(power);
        }
        return sb.toString();
    }

    /**
     * 캐릭터 이름으로 레이드 일정 조회
     * 레이드일정 시트: 열=파티, 슬롯(4행)=캐릭터 구조
     */
    public List<CharacterScheduleItem> getCharacterSchedule(String characterName) {
        if (sheetsService == null) {
            log.error("Google Sheets 서비스가 초기화되지 않았습니다.");
            return Collections.emptyList();
        }

        try {
            List<List<Object>> values = getSheetData();
            if (values == null || values.size() <= DATA_START_ROW) {
                return Collections.emptyList();
            }

            List<Object> dayRow  = row(values, ROW_DAY);
            List<Object> timeRow = row(values, ROW_TIME);
            List<Object> raidRow = row(values, ROW_RAID);

            // 전체 최대 열 수 계산
            int maxCol = 0;
            for (List<Object> r : values) {
                maxCol = Math.max(maxCol, r.size());
            }

            List<CharacterScheduleItem> result = new ArrayList<>();

            // H열(index 7)부터 각 열(=파티)을 순회
            for (int col = DATA_START_COL; col < maxCol; col++) {
                String raidName = cell(raidRow, col);
                if (raidName.isEmpty()) continue; // 빈 열(머지 공백) 스킵

                String day  = cell(dayRow, col);
                String time = cell(timeRow, col);
                String schedule = time.isEmpty() ? day : day + "(" + time + ")";

                // 이 파티 열에서 캐릭터 슬롯을 순회
                String selfDisplay = null;
                List<String> participants = new ArrayList<>();

                for (int slotRow = DATA_START_ROW; slotRow < values.size(); slotRow += SLOT_SIZE) {
                    String nick  = cell(row(values, slotRow), col);
                    if (nick.isEmpty()) continue;
                    // 체크박스 값(TRUE/FALSE) 건너뜀
                    if (nick.equalsIgnoreCase("TRUE") || nick.equalsIgnoreCase("FALSE")) continue;

                    String cls   = cell(row(values, slotRow + SLOT_CLASS), col);
                    String power = cell(row(values, slotRow + SLOT_POWER), col);
                    String formatted = formatMember(nick, cls, power);

                    if (nick.equals(characterName)) {
                        selfDisplay = formatted;
                    } else {
                        participants.add(formatted);
                    }
                }

                // 이 파티에 검색 캐릭터가 있으면 결과에 추가
                if (selfDisplay != null) {
                    result.add(new CharacterScheduleItem(raidName, schedule, selfDisplay, participants));
                }
            }

            return result;

        } catch (IOException e) {
            log.error("Google Sheets 조회 오류: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    public List<List<Object>> getRawData() {
        try {
            List<List<Object>> data = getSheetData();
            return data != null ? data.subList(0, Math.min(10, data.size())) : Collections.emptyList();
        } catch (IOException e) {
            log.error("raw data 조회 오류: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    public void clearCache() {
        cachedData = null;
        cacheTime = 0;
        log.info("Google Sheets 캐시 초기화");
    }
}
