package com.gtp.domain.bot.message.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gtp.domain.bot.log.entity.BotLog;
import com.gtp.domain.bot.log.entity.BotLogType;
import com.gtp.domain.bot.log.repository.BotLogRepository;
import com.gtp.domain.bot.message.dto.BotMessageRequest;
import com.gtp.domain.bot.message.dto.BotMessageResult;
import com.gtp.domain.bot.room.entity.BotRoomStatus;
import com.gtp.domain.bot.room.repository.BotRoomRepository;
import com.gtp.domain.lostark.api.dto.armory.*;
import com.gtp.domain.lostark.api.service.LostarkService;
import com.gtp.domain.lostark.raid.dto.CharacterScheduleItem;
import com.gtp.domain.lostark.raid.dto.ExpeditionScheduleResponse;
import com.gtp.domain.lostark.raid.service.GoogleSheetsService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Service
@RequiredArgsConstructor
public class BotMessageService {

    private final LostarkService lostarkService;
    private final GoogleSheetsService googleSheetsService;
    private final BotRoomRepository botRoomRepository;
    private final BotLogRepository botLogRepository;
    private final ObjectMapper objectMapper;

    private static final String GUILD_ROOM = "이쁜말";

    private static final String[] DAY_CHARS   = {"일","월","화","수","목","금","토"};
    private static final String[] DAY_FULL    = {"일요일","월요일","화요일","수요일","목요일","금요일","토요일"};
    private static final Set<String> ACC_TYPES = Set.of("목걸이","귀걸이","반지");
    private static final Set<String> NON_EQUIP_TYPES = Set.of("목걸이","귀걸이","반지","팔찌","어빌리티 스톤");

    // ── 진입점 ─────────────────────────────────────────────────────

    public BotMessageResult handle(BotMessageRequest req) {
        String room   = req.getRoom()   != null ? req.getRoom()   : "";
        String msg    = req.getMessage()!= null ? req.getMessage().trim() : "";
        String sender = req.getSender() != null ? req.getSender() : "";

        if (!msg.startsWith("/")) return BotMessageResult.silent();

        // 방 차단 체크
        if (isBlocked(room)) return BotMessageResult.silent();

        try {
            return route(room, msg, sender);
        } catch (Exception e) {
            log.error("[BotMessage] 처리 오류 room={} msg={}", room, msg, e);
            return BotMessageResult.of("오류: " + e.getMessage());
        }
    }

    private boolean isBlocked(String room) {
        return botRoomRepository.findByRoomName(room)
                .map(r -> r.getStatus() == BotRoomStatus.BLOCKED)
                .orElse(false);
    }

    // ── 명령어 라우팅 ───────────────────────────────────────────────

    private BotMessageResult route(String room, String text, String sender) {
        if (text.startsWith("/정보 "))        return cmdResult(room, sender, "/정보",   () -> handleInfoResult(text.substring(4).trim(), room));
        if (text.startsWith("/각인 "))        return cmd(room, sender, "/각인",        () -> handleEngraving(text.substring(4).trim()));
        if (text.startsWith("/아크패시브 "))  return cmd(room, sender, "/아크패시브",  () -> handleArkPassive(text.substring(7).trim()));
        if (text.startsWith("/아크그리드 "))  return cmd(room, sender, "/아크그리드",  () -> handleArkGrid(text.substring(7).trim()));
        if (text.startsWith("/보석 "))        return cmd(room, sender, "/보석",        () -> handleGems(text.substring(4).trim()));
        if (text.startsWith("/스킬 "))        return cmd(room, sender, "/스킬",        () -> handleSkills(text.substring(4).trim()));
        if (text.startsWith("/악세 "))        return cmd(room, sender, "/악세",        () -> handleAccessory(text.substring(4).trim()));
        if (text.startsWith("/팔찌 "))        return cmd(room, sender, "/팔찌",        () -> handleBracelet(text.substring(4).trim()));
        if (text.startsWith("/장비 "))        return cmd(room, sender, "/장비",        () -> handleEquipment(text.substring(4).trim()));
        if (text.startsWith("/내실 "))        return cmd(room, sender, "/내실",        () -> handleCollectibles(text.substring(4).trim()));
        if (text.startsWith("/분배금 "))      return cmd(room, sender, "/분배금",      () -> handleDistribution(text.substring(5).trim()));
        if (text.startsWith("/로펙 "))        return cmd(room, sender, "/로펙",        () -> handleLopec(text.substring(4).trim()));
        if (text.startsWith("/원정대 "))      return cmd(room, sender, "/원정대",      () -> handleSiblings(text.substring(5).trim()));
        if (text.equals("/기빵봇"))           return BotMessageResult.of(buildHelp(room));
        if (text.equals("/오늘파티테스트"))   return cmd(room, sender, "/오늘파티테스트", () -> handleTodayPartyTest());

        // 길드 전용 명령어
        boolean isGuildCmd = text.startsWith("/일정 ") || text.startsWith("/일정전체 ")
                || text.startsWith("/오늘일정 ") || text.equals("/일정새로고침");
        if (isGuildCmd) {
            // if (!room.equals(GUILD_ROOM)) return BotMessageResult.silent();
            if (text.startsWith("/일정 "))       return cmd(room, sender, "/일정",       () -> handleSchedule(text.substring(4).trim()));
            if (text.startsWith("/일정전체 "))   return cmd(room, sender, "/일정전체",   () -> handleScheduleAll(text.substring(6).trim()));
            if (text.startsWith("/오늘일정 "))   return cmd(room, sender, "/오늘일정",   () -> handleTodaySchedule(text.substring(6).trim()));
            if (text.equals("/일정새로고침"))    return cmd(room, sender, "/일정새로고침", () -> handleScheduleRefresh());
        }

        return BotMessageResult.silent();
    }

    /** 로스트아크 정기점검 시간대 여부 (매주 수요일 05:00~10:00) */
    private boolean isLostArkMaintenance() {
        LocalDateTime now = LocalDateTime.now(java.time.ZoneId.of("Asia/Seoul"));
        if (now.getDayOfWeek() != DayOfWeek.WEDNESDAY) return false;
        int hour = now.getHour();
        return hour >= 6 && hour < 10;
    }

    private static final String MAINTENANCE_MSG = "🔧 로스트아크 정기점검 중입니다.\n(매주 수요일 06:00 ~ 10:00)\n점검 종료 후 다시 시도해주세요!";

    /** 명령어 실행 + 로그 저장 (텍스트 반환) */
    private BotMessageResult cmd(String room, String sender, String command, java.util.concurrent.Callable<String> fn) {
        try {
            String reply = fn.call();
            saveLog(BotLogType.COMMAND, room, sender, command, "", true);
            return BotMessageResult.of(reply);
        } catch (Exception e) {
            String msg = isLostArkMaintenance() ? MAINTENANCE_MSG : "오류: " + e.getMessage();
            saveLog(BotLogType.COMMAND, room, sender, command, e.getMessage(), false);
            return BotMessageResult.of(msg);
        }
    }

    /** 명령어 실행 + 로그 저장 (BotMessageResult 직접 반환) */
    private BotMessageResult cmdResult(String room, String sender, String command, java.util.concurrent.Callable<BotMessageResult> fn) {
        try {
            BotMessageResult result = fn.call();
            saveLog(BotLogType.COMMAND, room, sender, command, "", true);
            return result;
        } catch (Exception e) {
            String msg = isLostArkMaintenance() ? MAINTENANCE_MSG : "오류: " + e.getMessage();
            saveLog(BotLogType.COMMAND, room, sender, command, e.getMessage(), false);
            return BotMessageResult.of(msg);
        }
    }

    private void saveLog(BotLogType type, String room, String sender, String command, String detail, boolean success) {
        try {
            botLogRepository.save(BotLog.builder()
                    .type(type).room(room).sender(sender)
                    .command(command).detail(detail != null ? detail : "").success(success)
                    .build());
        } catch (Exception e) {
            log.warn("[BotMessage] 로그 저장 실패: {}", e.getMessage());
        }
    }

    // ── 명령어 핸들러 ───────────────────────────────────────────────

    private BotMessageResult handleInfoResult(String name, String room) throws Exception {
        CharacterInfoResponse info = lostarkService.getCharacterInfo(name);
        String reply = handleInfo(name, room, info);
        String previewUrl = "https://api.gitaey-dev.com/preview/character/"
                + java.net.URLEncoder.encode(name, java.nio.charset.StandardCharsets.UTF_8);
        return BotMessageResult.of(reply, previewUrl);
    }

    private String handleInfo(String name, String room) throws Exception {
        CharacterInfoResponse info = lostarkService.getCharacterInfo(name);
        return handleInfo(name, room, info);
    }

    private String handleInfo(String name, String room, CharacterInfoResponse info) throws Exception {
        ArmoryProfile d  = info.getProfile();
        ArmoryArkPassive ap = info.getArkPassive();
        ArmoryEngraving  en = info.getEngraving();
        ArmoryArkGrid    ag = info.getArkGrid();

        // 치명/특화/신속 추출
        List<String> statParts = new ArrayList<>();
        if (d.getStats() != null) {
            for (CharacterStat s : d.getStats()) {
                String t = s.getType();
                if ("치명".equals(t) || "특화".equals(t) || "신속".equals(t)) {
                    statParts.add(t.substring(0, 1) + s.getValue());
                }
            }
        }
        String arkTitle = (ap != null && ap.isArkPassive() && ap.getTitle() != null) ? ap.getTitle() : "";

        // 로펙 점수
        String lopecScore = fetchLopecScore(name);

        // 어빌리티 스톤 각인 파싱
        Map<String, Integer> stoneEngravings = new HashMap<>();
        try {
            List<EquipmentItem> equipment = lostarkService.getEquipment(name);
            for (EquipmentItem item : equipment) {
                if ("어빌리티 스톤".equals(item.getType()) && item.getTooltip() != null) {
                    stoneEngravings = parseStoneEngravings(item.getTooltip());
                    break;
                }
            }
        } catch (Exception ignored) {}

        // 고대코어 개수
        long ancientCount = (ag != null && ag.getSlots() != null)
                ? ag.getSlots().stream().filter(s -> "고대".equals(s.getGrade())).count()
                : 0;

        StringBuilder sb = new StringBuilder();
        if (d.getTitle() != null && !d.getTitle().isEmpty()) sb.append("❖ ").append(d.getTitle()).append("\n");
        sb.append("【 ").append(d.getCharacterName()).append(" 】\n");
        sb.append(d.getServerName()).append("/").append(d.getCharacterClassName());
        if (!arkTitle.isEmpty()) sb.append("/").append(arkTitle);
        sb.append("\n");
        if (ancientCount > 0) sb.append("고대코어 ").append(ancientCount).append("개\n");
        sb.append("───────────────\n");
        sb.append("◆ 레벨  템").append(d.getItemAvgLevel()).append("/원").append(d.getExpeditionLevel()).append("\n");
        sb.append("◆ 투력  ").append(d.getCombatPower()).append("\n");
        if (lopecScore != null) sb.append("◆ 로펙  ").append(lopecScore).append("\n");
        String guild = d.getGuildName() != null ? d.getGuildName()
                + (d.getGuildMemberGrade() != null ? " (" + d.getGuildMemberGrade() + ")" : "") : "없음";
        sb.append("◆ 길드  ").append(guild).append("\n");
        if (!statParts.isEmpty()) sb.append("◆ 특성  ").append(String.join("/", statParts)).append("\n");

        // 각인
        List<?> engEffects = null;
        if (en != null) {
            if (en.getArkPassiveEffects() != null && !en.getArkPassiveEffects().isEmpty())
                engEffects = en.getArkPassiveEffects();
            else if (en.getEffects() != null && !en.getEffects().isEmpty())
                engEffects = en.getEffects();
        }
        if (engEffects != null && !engEffects.isEmpty()) {
            List<String> engParts = new ArrayList<>();
            for (Object ef : engEffects) {
                String engName; int level = 0; Integer stoneLv = null;
                if (ef instanceof ArkPassiveEngraving ape) {
                    engName = ape.getName(); level = ape.getLevel();
                } else if (ef instanceof EngravingEffect ee) {
                    engName = ee.getName() != null ? ee.getName() : "";
                    int lvIdx = engName.indexOf(" Lv.");
                    if (lvIdx >= 0) {
                        try { level = Integer.parseInt(engName.substring(lvIdx + 4).trim()); } catch (Exception ignored) {}
                        engName = engName.substring(0, lvIdx);
                    }
                } else continue;
                stoneLv = stoneEngravings.get(engName);
                engParts.add(engName.charAt(0) + "(" + level + (stoneLv != null ? "," + stoneLv : "") + ")");
            }
            if (!engParts.isEmpty()) sb.append("◆ 각인  ").append(String.join("", engParts)).append("\n");
        }

        // 아크그리드 (딜러/서폿 분리 표시)
        if (ag != null && ag.getEffects() != null && !ag.getEffects().isEmpty()) {
            Set<String> arkGridFilter = isSupportClass(d.getCharacterClassName(), ap)
                    ? Set.of("낙인력", "아군 피해 강화", "아군 공격 강화")
                    : Set.of("공격력", "추가 피해", "보스 피해");
            List<ArkGridEffect> filtered = ag.getEffects().stream()
                    .filter(ge -> arkGridFilter.contains(ge.getName()))
                    .toList();
            if (!filtered.isEmpty()) {
                sb.append("───────────────\n【 아크그리드 】\n");
                for (ArkGridEffect ge : filtered)
                    sb.append("◆ ").append(ge.getName()).append("  Lv.").append(ge.getLevel()).append("\n");
            }
        }

        // 아크패시브 포인트
        if (ap != null && ap.isArkPassive() && ap.getPoints() != null && !ap.getPoints().isEmpty()) {
            sb.append("───────────────\n");
            for (ArkPassivePoint pt : ap.getPoints()) {
                String pad = pt.getName().length() <= 2 ? "     " : "  ";
                sb.append("◆ ").append(pt.getName()).append(pad).append(pt.getValue());
                if (pt.getDescription() != null && !pt.getDescription().isEmpty())
                    sb.append("  (").append(pt.getDescription()).append(")");
                sb.append("\n");
            }
        }

        return sb.toString().trim();
    }

    private String handleEngraving(String name) throws Exception {
        ArmoryEngraving en = lostarkService.getEngravings(name);
        List<?> effects = null;
        if (en.getArkPassiveEffects() != null && !en.getArkPassiveEffects().isEmpty())
            effects = en.getArkPassiveEffects();
        else if (en.getEffects() != null && !en.getEffects().isEmpty())
            effects = en.getEffects();
        if (effects == null || effects.isEmpty()) return name + "의 각인 정보가 없습니다.";

        StringBuilder sb = new StringBuilder("【 ").append(name).append(" 각인 】\n───────────────\n");
        for (Object ef : effects) {
            if (ef instanceof ArkPassiveEngraving ape) {
                // ArkPassiveEngraving: Name + Level 분리됨
                sb.append("◆ ").append(ape.getName()).append(" Lv.").append(ape.getLevel()).append("\n");
            } else if (ef instanceof EngravingEffect ee) {
                // EngravingEffect: Name에 "마나흐름 Lv.3" 형태로 포함됨
                sb.append("◆ ").append(ee.getName()).append("\n");
            }
        }
        return sb.toString().trim();
    }

    private String handleArkPassive(String name) throws Exception {
        ArmoryArkPassive d = lostarkService.getArkPassive(name);
        if (d == null || !d.isArkPassive()) return name + "의 아크패시브가 해금되지 않았습니다.";

        StringBuilder sb = new StringBuilder("【 ").append(name).append(" 아크패시브 】\n");
        if (d.getTitle() != null) sb.append("  ").append(d.getTitle()).append("\n");
        sb.append("───────────────\n");

        if (d.getPoints() != null && !d.getPoints().isEmpty()) {
            List<String> pts = new ArrayList<>();
            for (ArkPassivePoint pt : d.getPoints()) {
                String s = pt.getName() + " " + pt.getValue();
                if (pt.getDescription() != null) s += " (" + pt.getDescription() + ")";
                pts.add(s);
            }
            sb.append("✦ ").append(String.join("\n✦ ", pts)).append("\n───────────────\n");
        }

        if (d.getEffects() != null) {
            Map<String, List<String>> catMap = new LinkedHashMap<>();
            for (ArkPassiveEffect ef : d.getEffects()) {
                catMap.computeIfAbsent(ef.getName(), k -> new ArrayList<>())
                      .add(stripHtml(ef.getDescription()));
            }
            Map<String, String> icons = Map.of("깨달음","🔵","진화","🟡","도약","🟢");
            for (Map.Entry<String, List<String>> e : catMap.entrySet()) {
                sb.append(icons.getOrDefault(e.getKey(), "▸")).append(" [").append(e.getKey()).append("]\n");
                for (String desc : e.getValue()) sb.append("   · ").append(desc).append("\n");
            }
        }
        return sb.toString().trim();
    }

    private String handleArkGrid(String name) throws Exception {
        ArmoryArkGrid d = lostarkService.getArkGrid(name);
        if (d == null) return name + "의 아크그리드 정보가 없습니다.";
        List<ArkGridSlot> slots   = d.getSlots()   != null ? d.getSlots()   : List.of();
        List<ArkGridEffect> effs  = d.getEffects() != null ? d.getEffects() : List.of();
        if (slots.isEmpty() && effs.isEmpty()) return name + "의 아크그리드 정보가 없습니다.";

        StringBuilder sb = new StringBuilder("【 ").append(name).append(" 아크그리드 】\n───────────────\n");
        if (!slots.isEmpty()) {
            sb.append("【 장착 슬롯 】\n");
            for (ArkGridSlot s : slots)
                sb.append("◆ ").append(s.getName()).append("  ").append(s.getPoint()).append("pt  [").append(s.getGrade()).append("]\n");
            sb.append("───────────────\n");
        }
        if (!effs.isEmpty()) {
            sb.append("【 발동 효과 】\n");
            for (ArkGridEffect ge : effs)
                sb.append("◆ ").append(ge.getName()).append("  Lv.").append(ge.getLevel()).append("\n");
        }
        return sb.toString().trim();
    }

    private String handleGems(String name) throws Exception {
        ArmoryGem data = lostarkService.getGems(name);
        List<GemItem> gems = data.getGems() != null ? data.getGems() : List.of();
        List<GemEffect> effects = (data.getEffects() != null && data.getEffects().getSkills() != null)
                ? data.getEffects().getSkills() : List.of();
        if (gems.isEmpty()) return name + "의 보석 정보가 없습니다.";

        List<String> jak = new ArrayList<>(), geop = new ArrayList<>(), etc = new ArrayList<>();
        for (GemItem g : gems) {
            GemEffect eff = effects.stream().filter(e -> e.getGemSlot() == g.getSlot()).findFirst().orElse(null);
            String skillName = eff != null && eff.getName() != null ? eff.getName() : "";
            String desc = (eff != null && eff.getDescription() != null && !eff.getDescription().isEmpty())
                    ? eff.getDescription().get(0) : "";

            String gemName = g.getName();
            int bonIdx = gemName.indexOf("의 보석");
            if (bonIdx >= 0) gemName = gemName.substring(0, bonIdx);

            if (gemName.contains("광휘")) {
                if (desc.contains("재사용 대기시간")) gemName = gemName.replace("광휘", "작열");
                else if (desc.contains("피해") || desc.contains("지원 효과")) gemName = gemName.replace("광휘", "겁화");
            }

            String line = (skillName.isEmpty() ? "" : "[" + skillName + "]") + gemName;
            if (gemName.contains("작열")) jak.add(line);
            else if (gemName.contains("겁화")) geop.add(line);
            else etc.add(line);
        }

        StringBuilder sb = new StringBuilder("【 ").append(name).append(" 보석 】");
        appendGemGroup(sb, "겁화", geop);
        appendGemGroup(sb, "작열", jak);
        appendGemGroup(sb, "기타", etc);
        return sb.toString().trim();
    }

    private void appendGemGroup(StringBuilder sb, String label, List<String> items) {
        if (!items.isEmpty()) {
            sb.append("\n───────────────\n[ ").append(label).append(" ]\n");
            items.forEach(i -> sb.append(i).append("\n"));
        }
    }

    private String handleSkills(String name) throws Exception {
        List<SkillItem> skills = lostarkService.getSkills(name);
        List<SkillItem> active = skills.stream().filter(s -> s.getLevel() >= 4).toList();
        if (active.isEmpty()) return name + "의 스킬 정보가 없습니다.";

        StringBuilder sb = new StringBuilder("【 ").append(name).append(" 스킬 】\n───────────────\n");
        for (SkillItem s : active) {
            String runeStr = (s.getRune() != null && s.getRune().getName() != null)
                    ? "  [" + s.getRune().getName() + "]" : "";
            sb.append("▸ ").append(s.getName()).append("  Lv.").append(s.getLevel()).append(runeStr).append("\n");
            if (s.getTripods() != null) {
                Map<Integer, Integer> tierMap = new HashMap<>();
                for (SkillTripod t : s.getTripods()) {
                    if (t.isSelected()) tierMap.put(t.getTier(), t.getSlot());
                }
                StringBuilder tripodStr = new StringBuilder();
                for (int tier = 0; tier <= 2; tier++) {
                    if (tierMap.containsKey(tier)) tripodStr.append(tierMap.get(tier));
                }
                if (!tripodStr.isEmpty()) sb.append("   ").append(tripodStr).append("\n");
            }
        }
        return sb.toString().trim();
    }

    private String handleAccessory(String name) throws Exception {
        List<EquipmentItem> items = lostarkService.getEquipment(name);
        List<EquipmentItem> acc = items.stream()
                .filter(i -> i.getType() != null && ACC_TYPES.stream().anyMatch(t -> i.getType().contains(t)))
                .toList();
        if (acc.isEmpty()) return name + "의 악세 정보가 없습니다.";

        StringBuilder sb = new StringBuilder("【 ").append(name).append(" 악세 】\n───────────────\n");
        for (EquipmentItem item : acc) {
            sb.append("◆ [").append(item.getType()).append("] ").append(item.getName()).append("\n");
            if (item.getTooltip() != null) {
                try { sb.append(parseTooltipEffect(item.getTooltip(), "연마 효과")); } catch (Exception ignored) {}
            }
        }
        return sb.toString().trim();
    }

    private String handleBracelet(String name) throws Exception {
        List<EquipmentItem> items = lostarkService.getEquipment(name);
        EquipmentItem bracelet = items.stream()
                .filter(i -> i.getType() != null && i.getType().contains("팔찌"))
                .findFirst().orElse(null);
        if (bracelet == null) return name + "의 팔찌 정보가 없습니다.";

        StringBuilder sb = new StringBuilder("【 ").append(name).append(" 팔찌 】\n───────────────\n");
        sb.append("◆ ").append(bracelet.getName()).append("\n");
        if (bracelet.getTooltip() != null) {
            try { sb.append(parseBraceletEffect(bracelet.getTooltip())); } catch (Exception ignored) {}
        }
        return sb.toString().trim();
    }

    private String handleEquipment(String name) throws Exception {
        List<EquipmentItem> items = lostarkService.getEquipment(name);
        List<EquipmentItem> equip = items.stream()
                .filter(i -> i.getType() != null && NON_EQUIP_TYPES.stream().noneMatch(t -> i.getType().contains(t)))
                .toList();
        if (equip.isEmpty()) return name + "의 장비 정보가 없습니다.";

        StringBuilder sb = new StringBuilder("【 ").append(name).append(" 장비 】\n───────────────\n");
        for (EquipmentItem item : equip)
            sb.append("◆ [").append(item.getType()).append("] ").append(item.getName())
              .append("  [").append(item.getGrade()).append("]\n");
        return sb.toString().trim();
    }

    private String handleCollectibles(String name) throws Exception {
        List<CollectibleItem> items = lostarkService.getCollectibles(name);
        if (items.isEmpty()) return name + "의 내실 정보가 없습니다.";

        int totalPoint = 0, totalMax = 0;
        StringBuilder sb = new StringBuilder("【 ").append(name).append(" 내실 】\n───────────────\n");
        for (CollectibleItem c : items) {
            int pct = (int) ((double) c.getPoint() / c.getMaxPoint() * 100);
            sb.append("[").append(pct).append("%] ").append(c.getType())
              .append("  ").append(c.getPoint()).append("/").append(c.getMaxPoint()).append("\n");
            totalPoint += c.getPoint();
            totalMax   += c.getMaxPoint();
        }
        int totalPct = totalMax > 0 ? (int) ((double) totalPoint / totalMax * 100) : 0;
        sb.append("───────────────\n전체  ").append(totalPct).append("%  (").append(totalPoint).append("/").append(totalMax).append(")");
        return sb.toString().trim();
    }

    private String handleDistribution(String amountStr) {
        long price;
        try { price = Long.parseLong(amountStr.replace(",", "")); }
        catch (NumberFormatException e) { return "올바른 금액을 입력해주세요.\n예) /분배금 20000"; }
        if (price <= 0) return "올바른 금액을 입력해주세요.\n예) /분배금 20000";

        long fair4 = price * 3 / 4;
        long sel4  = (long)(price * 0.95 * 3 / 4 * 10 / 11);
        long fair8 = price * 7 / 8;
        long sel8  = (long)(price * 0.95 * 7 / 8 * 54 / 55);

        return "【 분배금 】\n───────────────\n" +
               "경매가  " + comma(price) + "G\n\n" +
               "4인 공동분배  " + comma(fair4) + "G\n" +
               "4인 선점가     " + comma(sel4)  + "G\n\n" +
               "8인 공동분배  " + comma(fair8) + "G\n" +
               "8인 선점가     " + comma(sel8)  + "G";
    }

    private String handleLopec(String name) throws Exception {
        String score = fetchLopecScore(name);
        if (score == null) return name + "의 로펙 정보를 찾을 수 없습니다.";
        return "【 " + name + " 로펙 】\n───────────────\n달성 최고 점수  " + score;
    }

    private String handleSiblings(String args) throws Exception {
        String[] tokens = args.split(" ");
        int minLevel = 1700;
        String name = args;
        String last = tokens[tokens.length - 1];
        if (last.matches("\\d+")) {
            minLevel = Integer.parseInt(last);
            name = args.substring(0, args.lastIndexOf(" ")).trim();
        }

        List<SiblingCharacter> chars = lostarkService.getSiblings(name);
        if (chars.isEmpty()) return name + "의 원정대 정보가 없습니다.";

        chars.sort((a, b) -> {
            double la = parseLevel(a.getItemAvgLevel()), lb = parseLevel(b.getItemAvgLevel());
            return Double.compare(lb, la);
        });

        List<SiblingCharacter> filtered = new ArrayList<>();
        int hidden = 0;
        for (SiblingCharacter c : chars) {
            if (parseLevel(c.getItemAvgLevel()) >= minLevel) filtered.add(c);
            else hidden++;
        }

        StringBuilder sb = new StringBuilder("【 ").append(name).append(" 원정대 】\n───────────────\n");
        if (filtered.isEmpty()) {
            sb.append(minLevel).append(" 이상 캐릭터가 없습니다.");
        } else {
            for (SiblingCharacter c : filtered)
                sb.append(c.getItemAvgLevel()).append("  ").append(c.getCharacterName())
                  .append("[").append(c.getCharacterClassName()).append("]\n");
            if (hidden > 0) sb.append("───────────────\n").append(minLevel).append(" 미만 ").append(hidden).append("명 생략");
        }
        return sb.toString().trim();
    }

    private String handleSchedule(String name) throws Exception {
        List<CharacterScheduleItem> schedules = googleSheetsService.getCharacterSchedule(name);
        if (schedules == null || schedules.isEmpty()) return name + "의 이번 주 레이드 일정이 없습니다.";

        StringBuilder sb = new StringBuilder("【 ").append(name).append(" 이번주 일정 】\n");
        for (CharacterScheduleItem item : schedules) {
            sb.append("───────────────\n");
            sb.append("◆ ").append(item.getRaidName()).append("  ").append(item.getSchedule()).append("\n");
            sb.append("   · ").append(item.getSelfDisplay()).append("\n");
            if (item.getParticipants() != null)
                item.getParticipants().forEach(p -> sb.append("   · ").append(p).append("\n"));
        }
        return sb.toString().trim();
    }

    private String handleScheduleAll(String name) throws Exception {
        ExpeditionScheduleResponse data = googleSheetsService.getExpeditionSchedule(name);
        if (data == null) return name + "의 원정대를 찾을 수 없습니다.";

        List<ExpeditionScheduleResponse.MemberSchedule> active = data.getMembers().stream()
                .filter(m -> m.getSchedules() != null && !m.getSchedules().isEmpty()).toList();
        if (active.isEmpty()) return "【 " + data.getExpeditionName() + " 】\n이번 주 레이드 일정이 없습니다.";

        StringBuilder sb = new StringBuilder("【 ").append(data.getExpeditionName()).append(" 원정대 일정 】\n");
        for (ExpeditionScheduleResponse.MemberSchedule member : active) {
            sb.append("━━━━━━━━━━━━\n▶ ").append(member.getCharacterName()).append("\n");
            appendScheduleItems(sb, member.getSchedules());
        }
        return sb.toString().trim();
    }

    private String handleTodaySchedule(String name) throws Exception {
        ExpeditionScheduleResponse data = googleSheetsService.getExpeditionSchedule(name);
        if (data == null) return name + "의 원정대를 찾을 수 없습니다.";

        int dow = LocalDate.now(java.time.ZoneId.of("Asia/Seoul")).getDayOfWeek().getValue() % 7; // 0=일, 1=월, ..., 6=토
        String todayChar = DAY_CHARS[dow];
        String todayFull = DAY_FULL[dow];

        List<ExpeditionScheduleResponse.MemberSchedule> filtered = new ArrayList<>();
        for (ExpeditionScheduleResponse.MemberSchedule member : data.getMembers()) {
            if (member.getSchedules() == null) continue;
            List<CharacterScheduleItem> today = member.getSchedules().stream()
                    .filter(s -> s.getSchedule() != null && s.getSchedule().startsWith(todayChar)).toList();
            if (!today.isEmpty()) filtered.add(new ExpeditionScheduleResponse.MemberSchedule(member.getCharacterName(), today));
        }

        if (filtered.isEmpty()) return "【 " + data.getExpeditionName() + " 】\n" + todayFull + " 레이드 일정이 없습니다.";

        StringBuilder sb = new StringBuilder("【 ").append(data.getExpeditionName()).append(" ").append(todayFull).append(" 】\n");
        for (ExpeditionScheduleResponse.MemberSchedule member : filtered) {
            sb.append("━━━━━━━━━━━━\n▶ ").append(member.getCharacterName()).append("\n");
            appendScheduleItems(sb, member.getSchedules());
        }
        return sb.toString().trim();
    }

    private void appendScheduleItems(StringBuilder sb, List<CharacterScheduleItem> items) {
        for (int j = 0; j < items.size(); j++) {
            if (j > 0) sb.append("────────────\n");
            CharacterScheduleItem item = items.get(j);
            sb.append("◆ ").append(item.getRaidName()).append("  ").append(item.getSchedule()).append("\n");
            sb.append("   · ").append(item.getSelfDisplay()).append("\n");
            if (item.getParticipants() != null)
                item.getParticipants().forEach(p -> sb.append("   · ").append(p).append("\n"));
        }
    }

    private String handleScheduleRefresh() {
        googleSheetsService.clearCache();
        return "일정 캐시가 초기화되었습니다.\n다음 /일정 조회 시 최신 데이터를 불러옵니다.";
    }

    private String handleTodayPartyTest() throws Exception {
        var parties = googleSheetsService.getTodayParties();
        if (parties == null || parties.isEmpty()) return "오늘 등록된 레이드 파티가 없습니다.";
        int dow = LocalDate.now(java.time.ZoneId.of("Asia/Seoul")).getDayOfWeek().getValue() % 7;
        StringBuilder sb = new StringBuilder("【 오늘의 레이드 파티 】 ").append(DAY_FULL[dow]).append("\n");
        for (var party : parties) {
            sb.append("───────────────\n◆ ").append(party.getRaidName());
            if (party.getTime() != null) sb.append("  ").append(party.getTime());
            sb.append("\n");
            if (party.getMembers() != null) party.getMembers().forEach(m -> sb.append(m).append("\n"));
        }
        return sb.toString().trim();
    }

    private String buildHelp(String room) {
        StringBuilder sb = new StringBuilder("""
                【 기빵봇 도움말 】
                ───────────────
                ◆ 기본 정보
                  /정보 캐릭명
                  /각인 캐릭명
                  /원정대 캐릭명
                  /스킬 캐릭명
                  /내실 캐릭명
                  /로펙 캐릭명
                ───────────────
                ◆ 장비
                  /장비 캐릭명
                  /악세 캐릭명
                  /팔찌 캐릭명
                  /보석 캐릭명
                ───────────────
                ◆ 아크
                  /아크패시브 캐릭명
                  /아크그리드 캐릭명
                """);
        if (GUILD_ROOM.equals(room)) {
            sb.append("""
                    ───────────────
                    ◆ 길드
                      /일정 캐릭명
                      /일정전체 캐릭명
                      /오늘일정 캐릭명
                      /일정새로고침
                    """);
        }
        sb.append("───────────────\n◆ 경매\n  /분배금 금액");
        return sb.toString().trim();
    }

    // ── 유틸리티 ────────────────────────────────────────────────────

    private boolean isSupportClass(String className, ArmoryArkPassive ap) {
        if (className == null) return false;
        String title = (ap != null && ap.getTitle() != null) ? ap.getTitle() : "";
        return switch (className) {
            case "바드"      -> title.contains("절실한 구원");   // 진실된 용맹 = 딜러
            case "도화가"    -> title.contains("만개");           // 회귀 = 딜러
            case "홀리나이트"-> title.contains("축복의 오라");    // 심판자 = 딜러
            case "발키리"    -> title.contains("해방자");         // 빛의기사 = 딜러
            default          -> false;
        };
    }

    private RestTemplate lopecRestTemplate() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(3_000);
        factory.setReadTimeout(5_000);
        return new RestTemplate(factory);
    }

    private String fetchLopecScore(String name) {
        try {
            String encoded = java.net.URLEncoder.encode(name, java.nio.charset.StandardCharsets.UTF_8);
            java.net.URL url = new java.net.URL("https://m.lopec.kr/character/specPoint/" + encoded);
            java.net.HttpURLConnection conn = (java.net.HttpURLConnection) url.openConnection();
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36");
            conn.setRequestProperty("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
            conn.setRequestProperty("Accept-Encoding", "gzip, deflate");
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(8000);
            conn.connect();

            java.io.InputStream is = conn.getContentEncoding() != null && conn.getContentEncoding().contains("gzip")
                    ? new java.util.zip.GZIPInputStream(conn.getInputStream())
                    : conn.getInputStream();
            String html = new String(is.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
            is.close();

            Matcher m = Pattern.compile("달성 최고 점수</[^>]+><[^>]+>([\\d,.]+)").matcher(html);
            return m.find() ? m.group(1).trim() : null;
        } catch (Exception e) {
            log.debug("fetchLopecScore 오류 [{}]: {}", name, e.getMessage());
            return null;
        }
    }

    private Map<String, Integer> parseStoneEngravings(String tooltip) throws Exception {
        Map<String, Integer> result = new HashMap<>();
        JsonNode root = objectMapper.readTree(tooltip);
        for (JsonNode el : root) {
            if (!"IndentStringGroup".equals(getStr(el, "type"))) continue;
            JsonNode value = el.path("value");
            for (JsonNode sub : value) {
                String topStr = stripHtml(getStr(sub, "topStr"));
                if (!topStr.contains("각인 효과")) continue;
                JsonNode content = sub.path("contentStr");
                for (JsonNode c : content) {
                    String text = stripHtml(getStr(c, "contentStr")).trim();
                    int b1 = text.indexOf("["), b2 = text.indexOf("]");
                    int lvi = text.indexOf("Lv.");
                    if (b1 >= 0 && b2 > b1 && lvi >= 0) {
                        String engName = text.substring(b1 + 1, b2);
                        int lv = Integer.parseInt(text.substring(lvi + 3).trim().split("\\s")[0]);
                        if (lv > 0) result.put(engName, lv);
                    }
                }
            }
        }
        return result;
    }

    private String parseTooltipEffect(String tooltip, String labelKeyword) throws Exception {
        StringBuilder sb = new StringBuilder();
        JsonNode root = objectMapper.readTree(tooltip);
        for (JsonNode el : root) {
            if (!"ItemPartBox".equals(getStr(el, "type"))) continue;
            JsonNode val = el.path("value");
            String label = stripHtml(getStr(val, "Element_000"));
            if (!label.contains(labelKeyword)) continue;
            String content = getStr(val, "Element_001");
            List<String> parts = new ArrayList<>();
            for (String p1 : content.split("(?i)<br>")) {
                for (String p2 : p1.split("(?i)<BR>")) parts.add(p2);
            }
            for (String part : parts) {
                String text = stripHtml(part).trim();
                if (!text.isEmpty()) sb.append("   · ").append(accGrade(part)).append(text).append("\n");
            }
        }
        return sb.toString();
    }

    private String parseBraceletEffect(String tooltip) throws Exception {
        StringBuilder sb = new StringBuilder();
        JsonNode root = objectMapper.readTree(tooltip);
        for (JsonNode el : root) {
            if (!"ItemPartBox".equals(getStr(el, "type"))) continue;
            JsonNode val = el.path("value");
            String label = stripHtml(getStr(val, "Element_000"));
            if (!label.contains("팔찌 효과")) continue;
            String content = getStr(val, "Element_001");
            String[] rawParts = content.split("(?i)<BR>");
            List<Map.Entry<String, String>> options = new ArrayList<>();
            String cur = "", curRaw = "";
            for (String part : rawParts) {
                if (part.trim().isEmpty()) continue;
                if (part.trim().toLowerCase().startsWith("<img")) {
                    if (!cur.isEmpty()) options.add(Map.entry(cur, curRaw));
                    cur = stripHtml(part).trim(); curRaw = part;
                } else {
                    String cont = stripHtml(part).trim();
                    if (!cont.isEmpty()) cur += (cur.isEmpty() ? "" : " ") + cont;
                    curRaw += part;
                }
            }
            if (!cur.isEmpty()) options.add(Map.entry(cur, curRaw));
            for (var opt : options)
                if (!opt.getKey().isEmpty())
                    sb.append("   · ").append(accGrade(opt.getValue())).append(opt.getKey()).append("\n");
        }
        return sb.toString();
    }

    private String getStr(JsonNode node, String field) {
        JsonNode n = node.path(field);
        return n.isMissingNode() || n.isNull() ? "" : n.asText();
    }

    private String stripHtml(String html) {
        if (html == null) return "";
        return html.replaceAll("<[^>]+>", "").replaceAll("\\s+", " ").trim();
    }

    private String accGrade(String html) {
        if (html == null) return "";
        String u = html.toUpperCase();
        if (u.contains("FE9600")) return "[상]";
        if (u.contains("CE43FC")) return "[중]";
        if (u.contains("00B5FF") || u.contains("91FE02") || u.contains("99FF99")) return "[하]";
        return "";
    }

    private String comma(long n) {
        return String.format("%,d", n);
    }

    private double parseLevel(String lvl) {
        if (lvl == null) return 0;
        try { return Double.parseDouble(lvl.replace(",", "")); }
        catch (NumberFormatException e) { return 0; }
    }
}
