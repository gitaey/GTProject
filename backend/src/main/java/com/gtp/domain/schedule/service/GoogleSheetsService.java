package com.gtp.domain.schedule.service;

import com.google.api.client.googleapis.javanet.GoogleNetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import com.google.api.services.sheets.v4.Sheets;
import com.google.api.services.sheets.v4.model.ValueRange;
import com.google.auth.http.HttpCredentialsAdapter;
import com.google.auth.oauth2.GoogleCredentials;
import com.gtp.domain.schedule.dto.CharacterScheduleItem;
import com.gtp.domain.schedule.dto.ExpeditionScheduleResponse;
import com.gtp.domain.schedule.dto.PartyCompositionResult;
import com.gtp.domain.schedule.dto.PartyMember;
import com.gtp.domain.schedule.dto.TodayPartyItem;
import com.google.api.services.sheets.v4.model.AddSheetRequest;
import com.google.api.services.sheets.v4.model.BatchUpdateSpreadsheetRequest;
import com.google.api.services.sheets.v4.model.BatchClearValuesRequest;
import com.google.api.services.sheets.v4.model.BatchUpdateValuesRequest;
import com.google.api.services.sheets.v4.model.ClearValuesRequest;
import com.google.api.services.sheets.v4.model.Request;
import com.google.api.services.sheets.v4.model.SheetProperties;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Calendar;
import java.util.List;
import java.util.Map;
import java.util.OptionalDouble;
import java.util.Set;

@Slf4j
@Service
public class GoogleSheetsService {

    @Value("${google.sheets.spreadsheet-id}")
    private String spreadsheetId;

    @Value("${google.sheets.sheet-name}")
    private String sheetName;

    @Value("${google.sheets.character-sheet-name}")
    private String characterSheetName;

    @Value("${google.sheets.credentials-path}")
    private Resource credentialsResource;

    @Value("${google.sheets.credentials-json:}")
    private String credentialsJson;

    private Sheets sheetsService;

    // ── 레이드일정 시트 구조 ──────────────────────────────────────────
    // 범위 A4:Z 기준 (4행부터 읽음)
    // index 0 = 4행(요일), 1 = 5행(시간), 2 = 6행(숙련도), 3 = 7행(레이드명)
    // index 4~ = 데이터 (캐릭터 슬롯, 슬롯당 4행)
    //   슬롯 내부: +0=닉네임, +1=클래스, +2=아이템레벨, +3=전투력
    // G열(index 6)부터 파티 데이터 시작, 각 열이 하나의 파티
    private static final int ROW_DAY        = 0;  // 요일
    private static final int ROW_TIME       = 1;  // 시간
    private static final int ROW_RAID       = 3;  // 레이드명
    private static final int DATA_START_ROW = 5;  // 첫 번째 슬롯 닉네임 행 (index 4는 단계 행)
    private static final int DATA_START_COL = 6;  // G열 (0-indexed)
    private static final int SLOT_SIZE      = 4;  // 슬롯당 행 수
    private static final int SLOT_CLASS     = 1;  // 슬롯 내 클래스 offset
    private static final int SLOT_POWER     = 3;  // 슬롯 내 전투력 offset
    private static final int TOTAL_SLOTS    = 8;  // 파티당 최대 슬롯 수
    private static final int ROW_COMPLETE   = 45; // 완료 체크박스 행 (시트 49행 = A4 기준 index 45)

    // 서폿 가능 직업 목록 (이 클래스라도 아크패시브가 딜러면 딜러로 분류)
    private static final Set<String> SUPPORT_CLASSES = new HashSet<>(
            Arrays.asList("바드", "홀리나이트", "도화가", "발키리"));

    // 서폿 아크패시브 목록 (아크패시브가 있는 경우 이 목록에 있어야 서폿으로 분류)
    // ※ 게임 업데이트로 이름이 바뀌면 이 목록을 수정하세요
    private static final Set<String> SUPPORT_ARC_PASSIVES = new HashSet<>(
            Arrays.asList("만개", "회귀", "축복의 오라", "심판자", "절실한 구원", "진실된 용맹", "해방자"));

    // 파티 편성 관련
    private static final String COMPOSE_SHEET_NAME = "다음주레이드";
    private static final double MIN_ITEM_LEVEL     = 1750.0;

    // 딜러 티어 (캐릭터 시트 Z/AA/AB 열)
    private static final String TIER_Z  = "Z";   // 강함
    private static final String TIER_AA = "AA";  // 보통
    private static final String TIER_AB = "AB";  // 조금약함

    // 워로드 선호 파티 클래스 (같은 파티에 있으면 좋은 클래스들)
    private static final String WARLORD_CLASS = "워로드";
    private static final Set<String> WARLORD_PREFERRED_CLASSES = new HashSet<>(Arrays.asList(
            "창술사", "블레이드", "브레이커", "데빌헌터",
            "인파이터", "스트라이커", "디스트로이어", "가디언나이트", "리퍼", "슬레이어"));

    // 캐시 유효 시간 (5분)
    private static final long CACHE_TTL_MS = 5 * 60 * 1000L;

    // 레이드일정 시트 캐시
    private volatile List<List<Object>> cachedData = null;
    private volatile long cacheTime = 0;

    // 캐릭터 시트 캐시
    private volatile List<List<Object>> cachedCharData = null;
    private volatile long charCacheTime = 0;

    @PostConstruct
    public void init() {
        try {
            java.io.InputStream credStream = (credentialsJson != null && !credentialsJson.isBlank())
                    ? new java.io.ByteArrayInputStream(credentialsJson.getBytes(java.nio.charset.StandardCharsets.UTF_8))
                    : credentialsResource.getInputStream();

            GoogleCredentials credentials = GoogleCredentials
                    .fromStream(credStream)
                    .createScoped("https://www.googleapis.com/auth/spreadsheets");

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
        String range = sheetName + "!A4:AZ";
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
                String complete = cell(row(values, ROW_COMPLETE), col);
                if ("TRUE".equalsIgnoreCase(complete)) continue; // 완료된 레이드 스킵

                String day  = cell(dayRow, col);
                String time = cell(timeRow, col);
                String schedule = time.isEmpty() ? day : day + "(" + time + ")";

                // 이 파티 열에서 캐릭터 슬롯을 순회
                String selfDisplay = null;
                List<String> participants = new ArrayList<>();

                int slotLimit = DATA_START_ROW + TOTAL_SLOTS * SLOT_SIZE;
                for (int slotRow = DATA_START_ROW; slotRow < slotLimit; slotRow += SLOT_SIZE) {
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

            result.sort(Comparator.comparingInt(item -> dayOrder(item.getSchedule())));
            return result;

        } catch (IOException e) {
            log.error("Google Sheets 조회 오류: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    private static final List<String> DAY_ORDER = Arrays.asList(
            "수요일", "목요일", "금요일", "토요일", "일요일", "월요일", "화요일");

    private int dayOrder(String schedule) {
        for (int i = 0; i < DAY_ORDER.size(); i++) {
            if (schedule.contains(DAY_ORDER.get(i))) return i;
        }
        return DAY_ORDER.size();
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

    /**
     * 캐릭터 시트 데이터 캐싱 (5분 TTL)
     * 범위: 캐릭터!A2:H
     * A=길드원(원정대명, 머지셀), B=닉네임, C=클래스, D=아크패시브, E=아이템레벨, F=전투력, G=로펙, H=참여여부
     */
    private List<List<Object>> getCharacterSheetData() throws IOException {
        long now = System.currentTimeMillis();
        if (cachedCharData != null && (now - charCacheTime) < CACHE_TTL_MS) {
            return cachedCharData;
        }
        String range = characterSheetName + "!A2:H";
        ValueRange response = sheetsService.spreadsheets().values()
                .get(spreadsheetId, range)
                .execute();
        cachedCharData = response.getValues();
        charCacheTime = now;
        log.info("캐릭터 시트 데이터 캐시 갱신");
        return cachedCharData;
    }

    /**
     * 캐릭터 이름으로 동일 원정대 캐릭터 목록 조회
     * A열이 머지셀이므로 마지막으로 읽힌 비어있지 않은 값을 현재 원정대명으로 간주
     * 반환: [원정대명, 닉네임1, 닉네임2, ...]
     * 반환값[0] = 원정대명, [1~] = 해당 원정대의 닉네임 목록
     */
    private ExpeditionMembersResult getExpeditionMembers(String characterName) throws IOException {
        List<List<Object>> rows = getCharacterSheetData();
        if (rows == null || rows.isEmpty()) return null;

        // 1단계: 검색 캐릭터가 속한 원정대명 찾기
        String targetExpedition = null;
        String lastExpedition = "";
        for (List<Object> row : rows) {
            String expCell = (row.size() > 0) ? String.valueOf(row.get(0)).trim() : "";
            if (!expCell.isEmpty()) {
                lastExpedition = expCell;
            }
            String nick = (row.size() > 1) ? String.valueOf(row.get(1)).trim() : "";
            if (nick.equals(characterName)) {
                targetExpedition = lastExpedition;
                break;
            }
        }
        if (targetExpedition == null || targetExpedition.isEmpty()) return null;

        // 2단계: 동일 원정대의 모든 캐릭터 수집
        List<String> members = new ArrayList<>();
        lastExpedition = "";
        boolean inTarget = false;
        for (List<Object> row : rows) {
            String expCell = (row.size() > 0) ? String.valueOf(row.get(0)).trim() : "";
            if (!expCell.isEmpty()) {
                // 새 원정대 시작
                if (inTarget) break; // 이전까지 수집 완료
                lastExpedition = expCell;
                inTarget = lastExpedition.equals(targetExpedition);
            }
            if (inTarget) {
                String nick = (row.size() > 1) ? String.valueOf(row.get(1)).trim() : "";
                if (!nick.isEmpty()) {
                    members.add(nick);
                }
            }
        }
        return new ExpeditionMembersResult(targetExpedition, members);
    }

    /** 원정대 멤버 조회 결과 내부 클래스 */
    private static class ExpeditionMembersResult {
        final String expeditionName;
        final List<String> members;
        ExpeditionMembersResult(String expeditionName, List<String> members) {
            this.expeditionName = expeditionName;
            this.members = members;
        }
    }

    /**
     * 원정대 전체 일정 조회
     * 캐릭터 이름 → 원정대 찾기 → 원정대 멤버 각각의 레이드일정 조회
     */
    public ExpeditionScheduleResponse getExpeditionSchedule(String characterName) {
        if (sheetsService == null) {
            log.error("Google Sheets 서비스가 초기화되지 않았습니다.");
            return null;
        }
        try {
            ExpeditionMembersResult expResult = getExpeditionMembers(characterName);
            if (expResult == null) {
                log.warn("원정대를 찾을 수 없음: {}", characterName);
                return null;
            }

            List<ExpeditionScheduleResponse.MemberSchedule> memberSchedules = new ArrayList<>();
            for (String member : expResult.members) {
                List<CharacterScheduleItem> schedules = getCharacterSchedule(member);
                memberSchedules.add(new ExpeditionScheduleResponse.MemberSchedule(member, schedules));
            }
            memberSchedules.sort(Comparator.comparingInt(ms -> {
                List<CharacterScheduleItem> s = ms.getSchedules();
                return (s == null || s.isEmpty()) ? DAY_ORDER.size() : dayOrder(s.get(0).getSchedule());
            }));
            return new ExpeditionScheduleResponse(expResult.expeditionName, memberSchedules);

        } catch (IOException e) {
            log.error("원정대 일정 조회 오류: {}", e.getMessage());
            return null;
        }
    }

    /** 오늘 요일에 해당하는 미완료 파티 목록 반환 */
    public List<TodayPartyItem> getTodayParties() {
        if (sheetsService == null) return Collections.emptyList();
        try {
            List<List<Object>> values = getSheetData();
            if (values == null || values.size() <= DATA_START_ROW) return Collections.emptyList();

            String[] dayNames = {"일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"};
            String today = dayNames[Calendar.getInstance().get(Calendar.DAY_OF_WEEK) - 1];

            List<Object> dayRow  = row(values, ROW_DAY);
            List<Object> timeRow = row(values, ROW_TIME);
            List<Object> raidRow = row(values, ROW_RAID);

            int maxCol = 0;
            for (List<Object> r : values) maxCol = Math.max(maxCol, r.size());

            List<TodayPartyItem> result = new ArrayList<>();
            int slotLimit = DATA_START_ROW + TOTAL_SLOTS * SLOT_SIZE;

            for (int col = DATA_START_COL; col < maxCol; col++) {
                String raidName = cell(raidRow, col);
                if (raidName.isEmpty()) continue;
                String complete = cell(row(values, ROW_COMPLETE), col);
                if ("TRUE".equalsIgnoreCase(complete)) continue;
                String day = cell(dayRow, col);
                if (!today.equals(day.trim())) continue;

                String time = cell(timeRow, col);
                List<String> members = new ArrayList<>();
                for (int slotRow = DATA_START_ROW; slotRow < slotLimit; slotRow += SLOT_SIZE) {
                    String nick = cell(row(values, slotRow), col);
                    if (nick.isEmpty()) continue;
                    if (nick.equalsIgnoreCase("TRUE") || nick.equalsIgnoreCase("FALSE")) continue;
                    String cls   = cell(row(values, slotRow + SLOT_CLASS), col);
                    String power = cell(row(values, slotRow + SLOT_POWER), col);
                    members.add(formatMember(nick, cls, power));
                }
                result.add(new TodayPartyItem(raidName, time, members));
            }
            return result;

        } catch (IOException e) {
            log.error("오늘의 파티 조회 오류: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    // ══════════════════════════════════════════════════════════════
    // 파티 자동 편성
    //
    // 규칙 요약
    //   - 깐부 쌍(W:X열)은 항상 같은 파티, 인덱스 0·1 고정 (스왑 금지)
    //   - 딜러 티어: Z(강함) / AA(보통) / AB(약함)  ← Z:AB열
    //   - AB 허용 조건: 서폿 있거나 Z 있는 파티에만 (한도: Z없으면1 / Z있으면2)
    //   - 허용 조합: 서폿X + Z + AA + AB
    // ══════════════════════════════════════════════════════════════

    public PartyCompositionResult composeParties() throws IOException {
        if (sheetsService == null) throw new IllegalStateException("Google Sheets 서비스가 초기화되지 않았습니다.");

        // 1. 캐릭터 시트 읽기 → 서폿/딜러 분리
        List<PartyMember> supports = new ArrayList<>();
        List<PartyMember> dealers  = new ArrayList<>();
        readParticipants(supports, dealers);

        // 2. 깐부 쌍 읽기 → 자유 풀에서 제거
        List<KkanbuPair> kkanbuPairs = readKkanbuPairs(supports, dealers);
        Set<String> kkanbuNicks = new HashSet<>();
        for (KkanbuPair kp : kkanbuPairs) {
            kkanbuNicks.add(kp.a.getNickname());
            kkanbuNicks.add(kp.b.getNickname());
        }
        supports.removeIf(m -> kkanbuNicks.contains(m.getNickname()));
        dealers.removeIf(m -> kkanbuNicks.contains(m.getNickname()));

        // 3. 딜러 티어 맵 읽기, 서폿 셔플
        Map<String, String> tierMap = readDealerTiers();
        Collections.shuffle(supports);

        // 4. 파티 시드 생성
        //    깐부 쌍 순서를 셔플해서 서폿 배정 기회 균등화
        List<List<PartyMember>> parties = new ArrayList<>();
        Collections.shuffle(kkanbuPairs);
        for (KkanbuPair kp : kkanbuPairs) {
            List<PartyMember> party = new ArrayList<>(Arrays.asList(kp.a, kp.b));
            if (!kp.a.isSupport() && !kp.b.isSupport() && !supports.isEmpty()) {
                party.add(supports.remove(pickSupportIdx(supports, kp)));
            }
            parties.add(party);
        }
        for (PartyMember sup : supports) {
            parties.add(new ArrayList<>(Collections.singletonList(sup)));
        }

        // 5. 자유 딜러 → 티어별 풀 (각각 셔플)
        List<PartyMember> zPool  = new ArrayList<>();
        List<PartyMember> aaPool = new ArrayList<>();
        List<PartyMember> abPool = new ArrayList<>();
        for (PartyMember d : dealers) {
            String t = tierMap.getOrDefault(d.getNickname(), TIER_AA);
            if      (TIER_Z.equals(t))  zPool.add(d);
            else if (TIER_AB.equals(t)) abPool.add(d);
            else                        aaPool.add(d);
        }
        Collections.shuffle(zPool);
        Collections.shuffle(aaPool);
        Collections.shuffle(abPool);

        // 6. 각 파티 딜러 채우기
        //    ① AB 1명 (서폿 파티 우선 — 소외 방지)
        //    ② Z 1명  (AB 한도 확장 목적 + 강함 딜러)
        //    ③ Z 추가됐으면 AB 1명 더 (최대 2명)
        //    ④ 남은 슬롯: AA → Z 순서로 채우기
        for (List<PartyMember> party : parties) {
            if (!hasRoomForDealer(party)) continue;

            if (partyHasSupport(party) && !abPool.isEmpty() && hasRoomForDealer(party)) {
                PartyMember ab = pickDealer(abPool, party);
                if (ab != null) { party.add(ab); abPool.remove(ab); }
            }

            if (!zPool.isEmpty() && hasRoomForDealer(party)) {
                PartyMember z = pickDealer(zPool, party);
                if (z != null) { party.add(z); zPool.remove(z); }
            }

            if (partyHasZ(party, tierMap) && abCount(party, tierMap) < 2
                    && !abPool.isEmpty() && hasRoomForDealer(party)) {
                PartyMember ab = pickDealer(abPool, party);
                if (ab != null) { party.add(ab); abPool.remove(ab); }
            }

            while (hasRoomForDealer(party)) {
                PartyMember picked = pickDealer(aaPool, party);
                if (picked != null) aaPool.remove(picked);
                else {
                    picked = pickDealer(zPool, party);
                    if (picked != null) zPool.remove(picked);
                }
                if (picked != null) party.add(picked);
                else break;
            }
        }

        // 7. 남은 AB → 서폿 파티 빈 슬롯 재시도
        for (PartyMember ab : new ArrayList<>(abPool)) {
            for (List<PartyMember> party : parties) {
                if (!partyHasSupport(party) || !hasRoomForDealer(party)) continue;
                if (abCount(party, tierMap) < (partyHasZ(party, tierMap) ? 2 : 1)) {
                    party.add(ab);
                    abPool.remove(ab);
                    break;
                }
            }
        }

        // 8. 남은 Z/AA → 추가 파티 구성 (Z 있으면 AB 1명 허용)
        List<PartyMember> remaining = new ArrayList<>();
        remaining.addAll(zPool);
        remaining.addAll(aaPool);
        while (!remaining.isEmpty()) {
            List<PartyMember> extra = new ArrayList<>();
            PartyMember z = pickByTier(remaining, tierMap, TIER_Z, extra);
            if (z != null) { extra.add(z); remaining.remove(z); }
            if (partyHasZ(extra, tierMap) && !abPool.isEmpty()) {
                PartyMember ab = pickDealer(abPool, extra);
                if (ab != null) { extra.add(ab); abPool.remove(ab); }
            }
            while (extra.size() < 3 && !remaining.isEmpty()) {
                PartyMember p = pickDealer(remaining, extra);
                if (p == null) break;
                extra.add(p); remaining.remove(p);
            }
            if (!extra.isEmpty()) parties.add(extra);
        }
        if (!abPool.isEmpty()) log.warn("AB 딜러 {}명 배치 실패 (서폿/Z 슬롯 부족)", abPool.size());

        // 9. 충돌 해소 (깐부 인덱스 0·1 고정)
        resolveExpeditionConflicts(parties, tierMap);
        resolveClassConflicts(parties, tierMap);

        // 10. 워로드 선호 파티 배치 (soft)
        preferWarlordPlacement(parties, tierMap);

        // 11. 파티별 딜러 평균 계산 + 시트 기입
        List<String> partyAverages = new ArrayList<>();
        for (List<PartyMember> party : parties) {
            OptionalDouble avg = party.stream()
                    .filter(m -> !m.isSupport())
                    .mapToDouble(m -> parseLopec(m.getPower()))
                    .filter(v -> v > 0)
                    .average();
            partyAverages.add(avg.isPresent() ? String.format("[D]평균 L%.0f", avg.getAsDouble()) : "");
        }
        writePartiesToSheet(parties);
        return new PartyCompositionResult(
                parties.size(), parties.stream().mapToInt(List::size).sum(), parties, partyAverages);
    }

    // ── 데이터 읽기 ──────────────────────────────────────────────────

    /** 캐릭터 시트에서 참여자(O) 읽어 서폿/딜러 분리 */
    private void readParticipants(List<PartyMember> supports, List<PartyMember> dealers) throws IOException {
        List<List<Object>> rows = getCharacterSheetData();
        if (rows == null || rows.isEmpty()) throw new IllegalStateException("캐릭터 시트 데이터가 없습니다.");
        String lastExp = "";
        for (List<Object> row : rows) {
            String exp  = (row.size() > 0) ? String.valueOf(row.get(0)).trim() : "";
            if (!exp.isEmpty()) lastExp = exp;
            String nick = (row.size() > 1) ? String.valueOf(row.get(1)).trim() : "";
            String cls  = (row.size() > 2) ? String.valueOf(row.get(2)).trim() : "";
            String arc  = (row.size() > 3) ? String.valueOf(row.get(3)).trim() : "";
            String ilvRaw = (row.size() > 4) ? String.valueOf(row.get(4)).trim() : "";
            String power  = (row.size() > 6) ? String.valueOf(row.get(6)).trim() : "";
            String join   = (row.size() > 7) ? String.valueOf(row.get(7)).trim() : "";
            if (nick.isEmpty() || ilvRaw.isEmpty() || !join.equalsIgnoreCase("O")) continue;
            double ilv;
            try { ilv = Double.parseDouble(ilvRaw.replace(",", "")); }
            catch (NumberFormatException e) { continue; }
            if (ilv < MIN_ITEM_LEVEL) continue;
            boolean isSupport = isSupportCharacter(cls, arc);
            PartyMember m = new PartyMember(nick, cls, ilvRaw, power, lastExp, isSupport);
            (isSupport ? supports : dealers).add(m);
        }
    }

    /** 캐릭터 시트 W2:X에서 깐부 쌍 읽기 (참여자 목록에 있는 쌍만 유효) */
    private List<KkanbuPair> readKkanbuPairs(List<PartyMember> supports, List<PartyMember> dealers) throws IOException {
        ValueRange res = sheetsService.spreadsheets().values()
                .get(spreadsheetId, characterSheetName + "!W2:X").execute();
        List<List<Object>> rows = res.getValues();
        if (rows == null || rows.isEmpty()) return Collections.emptyList();
        Map<String, PartyMember> nickMap = new HashMap<>();
        for (PartyMember m : supports) nickMap.put(m.getNickname(), m);
        for (PartyMember m : dealers)  nickMap.put(m.getNickname(), m);
        List<KkanbuPair> result = new ArrayList<>();
        for (List<Object> row : rows) {
            if (row.size() < 2) continue;
            String nA = String.valueOf(row.get(0)).trim();
            String nB = String.valueOf(row.get(1)).trim();
            if (nA.isEmpty() || nB.isEmpty()) continue;
            PartyMember a = nickMap.get(nA), b = nickMap.get(nB);
            if (a != null && b != null) result.add(new KkanbuPair(a, b));
        }
        return result;
    }

    /** 캐릭터 시트 Z2:AB에서 딜러 티어 맵 읽기 (닉네임 → TIER_Z/AA/AB) */
    private Map<String, String> readDealerTiers() throws IOException {
        ValueRange res = sheetsService.spreadsheets().values()
                .get(spreadsheetId, characterSheetName + "!Z2:AB").execute();
        List<List<Object>> rows = res.getValues();
        Map<String, String> map = new HashMap<>();
        if (rows == null) return map;
        for (List<Object> row : rows) {
            if (row.size() > 0) { String n = String.valueOf(row.get(0)).trim(); if (!n.isEmpty()) map.put(n, TIER_Z);  }
            if (row.size() > 1) { String n = String.valueOf(row.get(1)).trim(); if (!n.isEmpty()) map.put(n, TIER_AA); }
            if (row.size() > 2) { String n = String.valueOf(row.get(2)).trim(); if (!n.isEmpty()) map.put(n, TIER_AB); }
        }
        return map;
    }

    // ── 딜러 선택 헬퍼 ──────────────────────────────────────────────

    /** 깐부 파티에 배정할 서폿 인덱스 선택 (원정대 겹침 없는 서폿 우선) */
    private int pickSupportIdx(List<PartyMember> supports, KkanbuPair kp) {
        Set<String> kExp = new HashSet<>();
        if (!kp.a.getExpedition().isEmpty()) kExp.add(kp.a.getExpedition());
        if (!kp.b.getExpedition().isEmpty()) kExp.add(kp.b.getExpedition());
        for (int i = 0; i < supports.size(); i++) {
            if (!kExp.contains(supports.get(i).getExpedition())) return i;
        }
        return 0;
    }

    /**
     * 풀에서 파티 제약(원정대·클래스)을 최대한 지키는 딜러 선택
     * 1순위: 원정대+클래스 모두 OK / 2순위: 원정대만 OK / 3순위: 아무나
     */
    private PartyMember pickDealer(List<PartyMember> pool, List<PartyMember> party) {
        for (PartyMember d : pool) {
            String exp = d.getExpedition();
            if ((exp.isEmpty() || party.stream().noneMatch(m -> m.getExpedition().equals(exp)))
                    && party.stream().noneMatch(m -> m.getClassName().equals(d.getClassName()))) return d;
        }
        for (PartyMember d : pool) {
            String exp = d.getExpedition();
            if (exp.isEmpty() || party.stream().noneMatch(m -> m.getExpedition().equals(exp))) return d;
        }
        return pool.isEmpty() ? null : pool.get(0);
    }

    /** 풀에서 특정 티어 딜러만 골라 pickDealer 수행 */
    private PartyMember pickByTier(List<PartyMember> pool, Map<String, String> tierMap,
                                    String tier, List<PartyMember> party) {
        List<PartyMember> filtered = new ArrayList<>();
        for (PartyMember d : pool) {
            if (tier.equals(tierMap.getOrDefault(d.getNickname(), TIER_AA))) filtered.add(d);
        }
        return pickDealer(filtered, party);
    }

    /** 파티에 딜러 슬롯이 남아 있는지 확인 (최대 4인, 딜러 최대 3명) */
    private boolean hasRoomForDealer(List<PartyMember> party) {
        if (party.size() >= 4) return false;
        return party.stream().filter(m -> !m.isSupport()).count() < 3;
    }

    // ── 파티 상태 조회 헬퍼 ─────────────────────────────────────────

    private boolean partyHasSupport(List<PartyMember> party) {
        return party.stream().anyMatch(PartyMember::isSupport);
    }

    private boolean partyHasZ(List<PartyMember> party, Map<String, String> tierMap) {
        return party.stream().filter(m -> !m.isSupport())
                .anyMatch(m -> TIER_Z.equals(tierMap.getOrDefault(m.getNickname(), TIER_AA)));
    }

    private int abCount(List<PartyMember> party, Map<String, String> tierMap) {
        return (int) party.stream().filter(m -> !m.isSupport())
                .filter(m -> TIER_AB.equals(tierMap.getOrDefault(m.getNickname(), TIER_AA))).count();
    }

    // ── 기타 헬퍼 ───────────────────────────────────────────────────

    /** 서폿 여부 판단: 클래스 + 아크패시브 */
    private boolean isSupportCharacter(String className, String arcPassive) {
        if (!SUPPORT_CLASSES.contains(className)) return false;
        if (arcPassive.isEmpty()) return true;
        return SUPPORT_ARC_PASSIVES.contains(arcPassive);
    }

    /** 로펙 문자열 → double ("L7044.36" / "7,044.36" / "7044.36" → 7044.36) */
    private double parseLopec(String power) {
        if (power == null || power.isEmpty()) return 0.0;
        String s = power.startsWith("L") ? power.substring(1) : power;
        s = s.replace(",", "").trim();
        try { return Double.parseDouble(s); }
        catch (NumberFormatException e) { return 0.0; }
    }

    private double dealerAvg(List<PartyMember> party) {
        return party.stream().filter(m -> !m.isSupport())
                .mapToDouble(m -> parseLopec(m.getPower())).average().orElse(0.0);
    }

    private Set<String> partyExpsWithout(List<PartyMember> party, int excludeIdx) {
        Set<String> s = new HashSet<>();
        for (int i = 0; i < party.size(); i++) {
            if (i == excludeIdx || party.get(i).getExpedition().isEmpty()) continue;
            s.add(party.get(i).getExpedition());
        }
        return s;
    }

    private Set<String> partyClassesWithout(List<PartyMember> party, int excludeIdx) {
        Set<String> s = new HashSet<>();
        for (int i = 0; i < party.size(); i++) {
            if (i != excludeIdx) s.add(party.get(i).getClassName());
        }
        return s;
    }

    // ── 깐부 쌍 내부 클래스 ─────────────────────────────────────────

    private static class KkanbuPair {
        final PartyMember a, b;
        KkanbuPair(PartyMember a, PartyMember b) { this.a = a; this.b = b; }
    }

    // ══════════════════════════════════════════════════════════════
    // 후처리: 충돌 해소 + 워로드 배치
    // ══════════════════════════════════════════════════════════════

    private void resolveExpeditionConflicts(List<List<PartyMember>> parties, Map<String, String> tierMap) {
        for (int pi = 0; pi < parties.size(); pi++) {
            List<PartyMember> party = parties.get(pi);
            Set<String> seen = new HashSet<>();
            for (int mi = 0; mi < party.size(); mi++) {
                String exp = party.get(mi).getExpedition();
                if (!exp.isEmpty() && !seen.add(exp) && !party.get(mi).isSupport()) {
                    trySwap(parties, pi, mi, tierMap);
                }
            }
        }
    }

    private void resolveClassConflicts(List<List<PartyMember>> parties, Map<String, String> tierMap) {
        for (int pi = 0; pi < parties.size(); pi++) {
            List<PartyMember> party = parties.get(pi);
            Set<String> seen = new HashSet<>();
            for (int mi = 0; mi < party.size(); mi++) {
                if (!party.get(mi).isSupport() && mi > 1 && !seen.add(party.get(mi).getClassName())) {
                    trySwap(parties, pi, mi, tierMap);
                }
            }
        }
    }

    /** 원정대·클래스 충돌 딜러를 다른 파티 딜러와 스왑 (깐부 인덱스 0·1 고정, AB 조건 검증) */
    private void trySwap(List<List<PartyMember>> parties, int pi, int mi, Map<String, String> tierMap) {
        if (mi <= 1) return;
        PartyMember target = parties.get(pi).get(mi);
        Set<String> curExps     = partyExpsWithout(parties.get(pi), mi);
        Set<String> curClasses  = partyClassesWithout(parties.get(pi), mi);

        for (int pj = 0; pj < parties.size(); pj++) {
            if (pj == pi) continue;
            List<PartyMember> other = parties.get(pj);
            for (int mj = 0; mj < other.size(); mj++) {
                if (mj <= 1 || other.get(mj).isSupport()) continue;
                PartyMember cand = other.get(mj);
                Set<String> otherExps    = partyExpsWithout(other, mj);
                Set<String> otherClasses = partyClassesWithout(other, mj);
                boolean ok = (cand.getExpedition().isEmpty()   || !curExps.contains(cand.getExpedition()))
                          && (target.getExpedition().isEmpty()  || !otherExps.contains(target.getExpedition()))
                          && !curClasses.contains(cand.getClassName())
                          && !otherClasses.contains(target.getClassName())
                          && isAbSwapValid(parties.get(pi), mi, cand, other, mj, target, tierMap);
                if (ok) { parties.get(pi).set(mi, cand); other.set(mj, target); return; }
            }
        }
    }

    /** 워로드를 선호 클래스(창술사/블레이드 등) 보유 파티로 이동 (soft constraint) */
    private void preferWarlordPlacement(List<List<PartyMember>> parties, Map<String, String> tierMap) {
        for (int pi = 0; pi < parties.size(); pi++) {
            List<PartyMember> party = parties.get(pi);
            for (int mi = 0; mi < party.size(); mi++) {
                PartyMember m = party.get(mi);
                if (!WARLORD_CLASS.equals(m.getClassName()) || m.isSupport()) continue;
                boolean hasPreferred = party.stream().filter(x -> x != m)
                        .anyMatch(x -> WARLORD_PREFERRED_CLASSES.contains(x.getClassName()));
                if (!hasPreferred) trySwapWarlord(parties, pi, mi, tierMap);
            }
        }
    }

    private void trySwapWarlord(List<List<PartyMember>> parties, int pi, int mi, Map<String, String> tierMap) {
        if (mi <= 1) return;
        PartyMember warlord = parties.get(pi).get(mi);
        Set<String> curExps    = partyExpsWithout(parties.get(pi), mi);
        Set<String> curClasses = partyClassesWithout(parties.get(pi), mi);

        for (int pj = 0; pj < parties.size(); pj++) {
            if (pj == pi) continue;
            List<PartyMember> other = parties.get(pj);
            if (!other.stream().anyMatch(x -> WARLORD_PREFERRED_CLASSES.contains(x.getClassName()))) continue;
            if (other.stream().anyMatch(x -> WARLORD_CLASS.equals(x.getClassName()) && !x.isSupport())) continue;

            for (int mj = 0; mj < other.size(); mj++) {
                if (mj <= 1 || other.get(mj).isSupport() || WARLORD_CLASS.equals(other.get(mj).getClassName())) continue;
                PartyMember cand = other.get(mj);
                Set<String> otherExps    = partyExpsWithout(other, mj);
                Set<String> otherClasses = partyClassesWithout(other, mj);
                boolean ok = (cand.getExpedition().isEmpty()    || !curExps.contains(cand.getExpedition()))
                          && (warlord.getExpedition().isEmpty()  || !otherExps.contains(warlord.getExpedition()))
                          && !curClasses.contains(cand.getClassName())
                          && !otherClasses.contains(WARLORD_CLASS)
                          && isAbSwapValid(parties.get(pi), mi, cand, other, mj, warlord, tierMap);
                if (ok) { parties.get(pi).set(mi, cand); other.set(mj, warlord); return; }
            }
        }
    }

    // ── AB 조건 검증 ─────────────────────────────────────────────────

    /** 두 파티 간 스왑 후 양쪽 모두 AB 조건을 만족하는지 확인 */
    private boolean isAbSwapValid(List<PartyMember> pA, int removeA, PartyMember addToA,
                                  List<PartyMember> pB, int removeB, PartyMember addToB,
                                  Map<String, String> tierMap) {
        return isAbValidAfterSwap(pA, removeA, addToA, tierMap)
            && isAbValidAfterSwap(pB, removeB, addToB, tierMap);
    }

    /** 파티에서 removedIdx 제거 + added 추가 후 AB 조건 유효성 확인
     *  조건: AB는 서폿 있거나 Z 있는 파티에만 (한도: Z없으면1, Z있으면2) */
    private boolean isAbValidAfterSwap(List<PartyMember> party, int removedIdx,
                                       PartyMember added, Map<String, String> tierMap) {
        boolean hasSupport = false, hasZ = false;
        int abCnt = 0;
        for (int i = 0; i < party.size(); i++) {
            PartyMember m = (i == removedIdx) ? added : party.get(i);
            if (m.isSupport()) { hasSupport = true; continue; }
            String tier = tierMap.getOrDefault(m.getNickname(), TIER_AA);
            if (TIER_Z.equals(tier))  hasZ = true;
            if (TIER_AB.equals(tier)) abCnt++;
        }
        if (abCnt == 0) return true;
        if (!hasSupport && !hasZ) return false;
        return abCnt <= (hasZ ? 2 : 1);
    }

    /** 다음주레이드 시트에 파티 데이터 기입 (닉네임 행만 초기화/기입, 클래스/아이템레벨/전투력 행은 유지) */
    private void writePartiesToSheet(List<List<PartyMember>> parties) throws IOException {
        ensureSheetExists(COMPOSE_SHEET_NAME);

        // G8 (평균 행) + 닉네임 행(G9, G13, G17...) 만 초기화 (G7 레이드 종류는 건드리지 않음)
        int maxSlots = 8;
        List<String> clearRanges = new ArrayList<>();
        clearRanges.add(COMPOSE_SHEET_NAME + "!G3:Z3");
        for (int slot = 0; slot < maxSlots; slot++) {
            int sheetRow = 9 + slot * SLOT_SIZE;
            clearRanges.add(COMPOSE_SHEET_NAME + "!G" + sheetRow + ":Z" + sheetRow);
        }
        sheetsService.spreadsheets().values()
                .batchClear(spreadsheetId, new BatchClearValuesRequest().setRanges(clearRanges))
                .execute();

        if (parties.isEmpty()) return;

        int numParties   = parties.size();
        int maxPartySize = parties.stream().mapToInt(List::size).max().orElse(0);

        // 각 파티 내 서폿을 맨 앞으로 정렬
        parties.forEach(party -> party.sort((a, b) -> Boolean.compare(!a.isSupport(), !b.isSupport())));

        // ── G8: 파티별 딜러 로펙 평균 기입
        List<Object> avgRow = new ArrayList<>();
        for (List<PartyMember> party : parties) {
            OptionalDouble avg = party.stream()
                    .filter(m -> !m.isSupport())
                    .mapToDouble(m -> parseLopec(m.getPower()))
                    .filter(v -> v > 0)
                    .average();
            avgRow.add(avg.isPresent() ? String.format("[D]평균 L%.0f", avg.getAsDouble()) : "");
        }

        // ── 닉네임 행만 기입 (G9, G13, G17... slotOffset=0 행만)
        List<ValueRange> data = new ArrayList<>();
        data.add(new ValueRange()
                .setRange(COMPOSE_SHEET_NAME + "!G3")
                .setValues(Collections.singletonList(avgRow)));
        for (int memberIdx = 0; memberIdx < maxPartySize; memberIdx++) {
            int sheetRow = 9 + memberIdx * SLOT_SIZE;
            List<Object> nickRow = new ArrayList<>();
            for (int p = 0; p < numParties; p++) {
                List<PartyMember> party = parties.get(p);
                nickRow.add(memberIdx < party.size() ? party.get(memberIdx).getNickname() : "");
            }
            data.add(new ValueRange()
                    .setRange(COMPOSE_SHEET_NAME + "!G" + sheetRow)
                    .setValues(Collections.singletonList(nickRow)));
        }
        sheetsService.spreadsheets().values()
                .batchUpdate(spreadsheetId, new BatchUpdateValuesRequest()
                        .setValueInputOption("RAW")
                        .setData(data))
                .execute();

        log.info("다음주레이드 시트 파티 편성 완료: {}파티", parties.size());
    }

    /** 시트가 없으면 생성 */
    private void ensureSheetExists(String sheetName) throws IOException {
        com.google.api.services.sheets.v4.model.Spreadsheet spreadsheet =
                sheetsService.spreadsheets().get(spreadsheetId).execute();

        boolean exists = spreadsheet.getSheets().stream()
                .anyMatch(s -> sheetName.equals(s.getProperties().getTitle()));

        if (!exists) {
            AddSheetRequest addSheet = new AddSheetRequest()
                    .setProperties(new SheetProperties().setTitle(sheetName));
            BatchUpdateSpreadsheetRequest batchReq = new BatchUpdateSpreadsheetRequest()
                    .setRequests(Collections.singletonList(new Request().setAddSheet(addSheet)));
            sheetsService.spreadsheets().batchUpdate(spreadsheetId, batchReq).execute();
            log.info("새 시트 생성: {}", sheetName);
        }
    }

    public void clearCache() {
        cachedData = null;
        cacheTime = 0;
        cachedCharData = null;
        charCacheTime = 0;
        log.info("Google Sheets 캐시 초기화");
    }
}
