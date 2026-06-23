var SERVER_URL = "https://api.gitaey-dev";
var GUILD_ROOM = "이쁜말";
var savedGuildReplier = null;
var timerStarted = false;

// HTML 태그 제거 헬퍼 (각인/아크패시브 Description에 포함된 FONT 태그 등 제거)
function stripHtml(str) {
  if (!str) return "";
  return str
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// 연마 효과 등급 (FONT COLOR 기준 - # 유무 모두 처리)
function getAccGrade(htmlStr) {
  var u = htmlStr.toUpperCase();
  if (u.indexOf("FE9600") >= 0) return "[상]";
  if (u.indexOf("CE43FC") >= 0) return "[중]";
  if (u.indexOf("00B5FF") >= 0) return "[하]";
  if (u.indexOf("91FE02") >= 0) return "[하]";
  if (u.indexOf("99FF99") >= 0) return "[하]";
  return "";
}

function response(
  room,
  msg,
  sender,
  isGroupChat,
  replier,
  imageDB,
  packageName
) {
  var text = msg.trim();
  if (room === GUILD_ROOM) {
    savedGuildReplier = replier;
    if (!timerStarted) {
      timerStarted = true;
      startDailyTimer();
    }
  }

  // /정보 캐릭명
  if (text.startsWith("/정보 ")) {
    var name = text.substring(4).trim();
    try {
      // 단일 API 호출로 프로필 + 아크패시브 + 각인 + 아크그리드 통합 조회
      var res = org.jsoup.Jsoup.connect(
        SERVER_URL +
          "/api/lostark/character/" +
          java.net.URLEncoder.encode(name, "UTF-8") +
          "/info",
      )
        .ignoreContentType(true)
        .timeout(20000)
        .get()
        .body()
        .text();
      var json = JSON.parse(res);
      if (!json.success || !json.data.profile) {
        replier.reply("캐릭터를 찾을 수 없습니다.");
        return;
      }

      var d = json.data.profile;
      var ap = json.data.arkPassive;
      var en = json.data.engraving;
      var ag = json.data.arkGrid;

      // 치명 / 특화 / 신속만 추출
      var stats = d.Stats || [];
      var statTargets = ["치명", "특화", "신속"];
      var statParts = [];
      for (var i = 0; i < stats.length; i++) {
        if (statTargets.indexOf(stats[i].Type) >= 0) {
          statParts.push(stats[i].Type.substring(0, 1) + "" + stats[i].Value);
        }
      }

      // 아크패시브 Title
      var arkTitle = ap && ap.IsArkPassive && ap.Title ? ap.Title : "";

      // 로펙 점수 조회
      var lopecScore = null;
      try {
        var lopecHtml = org.jsoup.Jsoup.connect(
          "https://m.lopec.kr/character/specPoint/" +
            java.net.URLEncoder.encode(name, "UTF-8"),
        )
          .ignoreContentType(true)
          .userAgent("Mozilla/5.0")
          .timeout(3000)
          .execute()
          .body();
        lopecHtml = lopecHtml.replace(/[\n\r]/g, " ");
        var lopecMatch = lopecHtml.match(
          /달성 최고 점수<\/span>\s*<span[^>]*>([\d.]+)<\/span>/,
        );
        if (lopecMatch) lopecScore = lopecMatch[1].trim();
      } catch (le) {}

      // 캐릭터 이미지 미리보기 카드
      replier.reply(
        SERVER_URL +
          "/preview/character/" +
          java.net.URLEncoder.encode(name, "UTF-8"),
      );

      var msg = "";
      if (d.Title) msg += "❖ " + d.Title + "\n";
      msg += "【 " + d.CharacterName + " 】\n";
      msg +=
        d.ServerName +
        "/" +
        d.CharacterClassName +
        (arkTitle ? "/" + arkTitle : "") +
        "\n";
      msg += "───────────────\n";
      msg += "◆ 레벨  템" + d.ItemAvgLevel + "/원" + d.ExpeditionLevel + "\n";
      msg += "◆ 투력  " + d.CombatPower + "\n";
      if (lopecScore) msg += "◆ 로펙  " + lopecScore + "\n";
      msg +=
        "◆ 길드  " +
        (d.GuildName
          ? d.GuildName +
            (d.GuildMemberGrade ? " (" + d.GuildMemberGrade + ")" : "")
          : "없음") +
        "\n";
      if (statParts.length > 0) msg += "◆ 특성  " + statParts.join("/") + "\n";

      // 어빌리티 스톤 각인 파싱 (장비 API 별도 호출)
      var stoneEngravings = {};
      try {
        var eqRes = org.jsoup.Jsoup.connect(
          SERVER_URL +
            "/api/lostark/character/" +
            java.net.URLEncoder.encode(name, "UTF-8") +
            "/equipment",
        )
          .ignoreContentType(true)
          .timeout(5000)
          .execute()
          .body();
        var eqJson = JSON.parse(eqRes);
        if (eqJson.success && eqJson.data) {
          for (var eqi = 0; eqi < eqJson.data.length; eqi++) {
            var eqItem = eqJson.data[eqi];
            if (eqItem.Type === "어빌리티 스톤" && eqItem.Tooltip) {
              var stoneTip = JSON.parse(eqItem.Tooltip);
              for (var sk in stoneTip) {
                var sel = stoneTip[sk];
                if (sel && sel.type === "IndentStringGroup" && sel.value) {
                  for (var sek in sel.value) {
                    var ssub = sel.value[sek];
                    if (
                      stripHtml(ssub.topStr || "").indexOf("각인 효과") >= 0 &&
                      ssub.contentStr
                    ) {
                      for (var sck in ssub.contentStr) {
                        var sc = ssub.contentStr[sck];
                        if (sc && sc.contentStr) {
                          var scText = stripHtml(sc.contentStr).trim();
                          var b1 = scText.indexOf("[");
                          var b2 = scText.indexOf("]");
                          var lvi = scText.indexOf("Lv.");
                          if (b1 >= 0 && b2 > b1 && lvi >= 0) {
                            var sName = scText.substring(b1 + 1, b2);
                            var sLv = parseInt(scText.substring(lvi + 3));
                            if (sLv > 0) stoneEngravings[sName] = sLv;
                          }
                        }
                      }
                    }
                  }
                }
              }
              break;
            }
          }
        }
      } catch (se) {}

      // 각인 (아크패시브 → ArkPassiveEffects, 구형 → Effects)
      var engEffects = [];
      if (en) {
        if (en.ArkPassiveEffects && en.ArkPassiveEffects.length > 0)
          engEffects = en.ArkPassiveEffects;
        else if (en.Effects && en.Effects.length > 0) engEffects = en.Effects;
      }
      if (engEffects.length > 0) {
        var engParts = [];
        for (var ei = 0; ei < engEffects.length; ei++) {
          var ef = engEffects[ei];
          var engName = ef.Name || "";
          var level = "";
          if (ef.Level !== undefined && ef.Level !== null) {
            level = ef.Level;
          } else {
            var lvIdx = engName.indexOf(" Lv.");
            if (lvIdx >= 0) {
              level = engName.substring(lvIdx + 4);
              engName = engName.substring(0, lvIdx);
            }
          }
          var stoneLv = stoneEngravings[engName];
          var engStr =
            engName.charAt(0) +
            "(" +
            level +
            (stoneLv !== undefined ? "," + stoneLv : "") +
            ")";
          engParts.push(engStr);
        }
        msg += "◆ 각인  " + engParts.join("") + "\n";
      }

      // 아크그리드
      if (ag && ag.Effects && ag.Effects.length > 0) {
        msg += "───────────────\n";
        msg += "【 아크그리드 】\n";
        for (var ci = 0; ci < ag.Effects.length; ci++) {
          msg +=
            "◆ " + ag.Effects[ci].Name + "  Lv." + ag.Effects[ci].Level + "\n";
        }
      }

      // 아크패시브 포인트
      if (ap && ap.IsArkPassive && ap.Points && ap.Points.length > 0) {
        msg += "───────────────\n";
        for (var pi = 0; pi < ap.Points.length; pi++) {
          var pt = ap.Points[pi];
          var ptPad = pt.Name.length <= 2 ? "     " : "  ";
          msg += "◆ " + pt.Name + ptPad + pt.Value;
          if (pt.Description) msg += "  (" + pt.Description + ")";
          msg += "\n";
        }
      }

      replier.reply(msg.trim());
      sendBotLog("COMMAND", room, sender, "/정보", name, true);
    } catch (e) {
      sendBotLog("COMMAND", room, sender, "/정보", e.message || "오류", false);
      replier.reply("오류: " + e.message);
    }

    // /각인 캐릭명
  } else if (text.startsWith("/각인 ")) {
    var name = text.substring(4).trim();
    try {
      var res = org.jsoup.Jsoup.connect(
        SERVER_URL +
          "/api/lostark/character/" +
          java.net.URLEncoder.encode(name, "UTF-8") +
          "/engravings",
      )
        .ignoreContentType(true)
        .get()
        .body()
        .text();
      var json = JSON.parse(res);
      if (!json.success) {
        replier.reply("각인 정보를 찾을 수 없습니다.");
        return;
      }
      // 아크패시브 캐릭터 → ArkPassiveEffects, 구형 → Effects
      var effects = [];
      if (
        json.data &&
        json.data.ArkPassiveEffects &&
        json.data.ArkPassiveEffects.length > 0
      ) {
        effects = json.data.ArkPassiveEffects;
      } else if (
        json.data &&
        json.data.Effects &&
        json.data.Effects.length > 0
      ) {
        effects = json.data.Effects;
      }
      if (effects.length === 0) {
        replier.reply(name + "의 각인 정보가 없습니다.");
        return;
      }
      var msg = "【 " + name + " 각인 】\n";
      msg += "───────────────\n";
      for (var i = 0; i < effects.length; i++) {
        var e = effects[i];
        msg += "◆ " + e.Name;
        if (e.Level !== undefined && e.Level !== null) msg += " Lv." + e.Level;
        msg += "\n";
        // if (e.Description) msg += "   " + stripHtml(e.Description) + "\n";
      }
      replier.reply(msg.trim());
      sendBotLog("COMMAND", room, sender, "/각인", name, true);
    } catch (e) {
      sendBotLog("COMMAND", room, sender, "/각인", e.message || "오류", false);
      replier.reply("오류: " + e.message);
    }

    // /아크패시브 캐릭명
  } else if (text.startsWith("/아크패시브 ")) {
    var name = text.substring(7).trim();
    try {
      var res = org.jsoup.Jsoup.connect(
        SERVER_URL +
          "/api/lostark/character/" +
          java.net.URLEncoder.encode(name, "UTF-8") +
          "/arkpassive",
      )
        .ignoreContentType(true)
        .get()
        .body()
        .text();
      var json = JSON.parse(res);
      if (!json.success) {
        replier.reply("아크패시브 정보를 찾을 수 없습니다.");
        return;
      }
      var d = json.data;
      if (!d || !d.IsArkPassive) {
        replier.reply(name + "의 아크패시브가 해금되지 않았습니다.");
        return;
      }

      var msg = "【 " + name + " 아크패시브 】\n";
      if (d.Title) msg += "  " + d.Title + "\n";
      msg += "───────────────\n";

      // 진화 / 깨달음 / 도약 포인트 (Description에 랭크 정보 포함)
      var points = d.Points || [];
      if (points.length > 0) {
        var ptList = [];
        for (var i = 0; i < points.length; i++) {
          var pt = points[i];
          var ptStr = pt.Name + " " + pt.Value;
          if (pt.Description) ptStr += " (" + pt.Description + ")";
          ptList.push(ptStr);
        }
        msg += "✦ " + ptList.join("\n✦ ") + "\n";
        msg += "───────────────\n";
      }

      // Effects를 카테고리(Name)별로 그룹화 (깨달음 / 진화 / 도약)
      var effects = d.Effects || [];
      var categoryMap = {};
      var categoryOrder = [];
      for (var i = 0; i < effects.length; i++) {
        var ef = effects[i];
        var cat = ef.Name || "기타";
        if (!categoryMap[cat]) {
          categoryMap[cat] = [];
          categoryOrder.push(cat);
        }
        categoryMap[cat].push(stripHtml(ef.Description));
      }
      var catIcons = { 깨달음: "🔵", 진화: "🟡", 도약: "🟢" };
      for (var ci = 0; ci < categoryOrder.length; ci++) {
        var cat = categoryOrder[ci];
        msg += (catIcons[cat] || "▸") + " [" + cat + "]\n";
        var catItems = categoryMap[cat];
        for (var ni = 0; ni < catItems.length; ni++) {
          msg += "   · " + catItems[ni] + "\n";
        }
      }

      replier.reply(msg.trim());
      sendBotLog("COMMAND", room, sender, "/아크패시브", name, true);
    } catch (e) {
      sendBotLog("COMMAND", room, sender, "/아크패시브", e.message || "오류", false);
      replier.reply("오류: " + e.message);
    }

    // /아크그리드 캐릭명
  } else if (text.startsWith("/아크그리드 ")) {
    var name = text.substring(7).trim();
    try {
      var res = org.jsoup.Jsoup.connect(
        SERVER_URL +
          "/api/lostark/character/" +
          java.net.URLEncoder.encode(name, "UTF-8") +
          "/arkgrid",
      )
        .ignoreContentType(true)
        .get()
        .body()
        .text();
      var json = JSON.parse(res);
      if (!json.success) {
        replier.reply("아크그리드 정보를 찾을 수 없습니다.");
        return;
      }
      var d = json.data;
      if (!d) {
        replier.reply(name + "의 아크그리드 정보가 없습니다.");
        return;
      }

      var slots = d.Slots || [];
      var gridEffects = d.Effects || [];
      if (slots.length === 0 && gridEffects.length === 0) {
        replier.reply(name + "의 아크그리드 정보가 없습니다.");
        return;
      }

      var msg = "【 " + name + " 아크그리드 】\n";
      msg += "───────────────\n";

      // 장착 슬롯 (아이템명 + 포인트 + 등급)
      if (slots.length > 0) {
        msg += "【 장착 슬롯 】\n";
        for (var i = 0; i < slots.length; i++) {
          var s = slots[i];
          msg += "◆ " + s.Name + "  " + s.Point + "pt  [" + s.Grade + "]\n";
        }
        msg += "───────────────\n";
      }

      // 발동 효과
      if (gridEffects.length > 0) {
        msg += "【 발동 효과 】\n";
        for (var i = 0; i < gridEffects.length; i++) {
          var ge = gridEffects[i];
          msg += "◆ " + ge.Name + "  Lv." + ge.Level + "\n";
        }
      }

      replier.reply(msg.trim());
      sendBotLog("COMMAND", room, sender, "/아크그리드", name, true);
    } catch (e) {
      sendBotLog("COMMAND", room, sender, "/아크그리드", e.message || "오류", false);
      replier.reply("오류: " + e.message);
    }

    // /보석 캐릭명
  } else if (text.startsWith("/보석 ")) {
    var name = text.substring(4).trim();
    try {
      var res = org.jsoup.Jsoup.connect(
        SERVER_URL +
          "/api/lostark/character/" +
          java.net.URLEncoder.encode(name, "UTF-8") +
          "/gems",
      )
        .ignoreContentType(true)
        .get()
        .body()
        .text();
      var json = JSON.parse(res);
      if (!json.success) {
        replier.reply("보석 정보를 찾을 수 없습니다.");
        return;
      }
      var gems = json.data.Gems || [];
      var effects =
        json.data.Effects && json.data.Effects.Skills
          ? json.data.Effects.Skills
          : [];
      if (gems.length === 0) {
        replier.reply(name + "의 보석 정보가 없습니다.");
        return;
      }
      var groupJak = []; // 작열
      var groupGeop = []; // 겁화
      var groupEtc = []; // 기타

      for (var i = 0; i < gems.length; i++) {
        var g = gems[i];
        var eff = null;
        for (var j = 0; j < effects.length; j++) {
          if (effects[j].GemSlot === g.Slot) {
            eff = effects[j];
            break;
          }
        }
        var gemName = g.Name;
        var skillName = eff ? eff.Name || "" : "";
        var desc =
          eff && eff.Description && eff.Description.length > 0
            ? eff.Description[0]
            : "";

        // "의 보석" 이후 제거 (귀속 등 포함)
        var bonIdx = gemName.indexOf("의 보석");
        if (bonIdx >= 0) gemName = gemName.substring(0, bonIdx);

        // 광휘 → 효과에 따라 작열/겁화로 치환
        if (gemName.indexOf("광휘") >= 0) {
          if (desc.indexOf("재사용 대기시간") >= 0) {
            gemName = gemName.replace("광휘", "작열");
          } else if (
            desc.indexOf("피해") >= 0 ||
            desc.indexOf("지원 효과") >= 0
          ) {
            gemName = gemName.replace("광휘", "겁화");
          }
        }

        var line = (skillName ? "[" + skillName + "]" : "") + gemName;
        if (gemName.indexOf("작열") >= 0) groupJak.push(line);
        else if (gemName.indexOf("겁화") >= 0) groupGeop.push(line);
        else groupEtc.push(line);
      }

      var msg = "【 " + name + " 보석 】\n";
      if (groupGeop.length > 0) {
        msg += "───────────────\n";
        msg += "[ 겁화 ]\n";
        for (var i = 0; i < groupGeop.length; i++) msg += groupGeop[i] + "\n";
      }
      if (groupJak.length > 0) {
        msg += "───────────────\n";
        msg += "[ 작열 ]\n";
        for (var i = 0; i < groupJak.length; i++) msg += groupJak[i] + "\n";
      }
      if (groupEtc.length > 0) {
        msg += "───────────────\n";
        msg += "[ 기타 ]\n";
        for (var i = 0; i < groupEtc.length; i++) msg += groupEtc[i] + "\n";
      }
      replier.reply(msg.trim());
      sendBotLog("COMMAND", room, sender, "/보석", name, true);
    } catch (e) {
      sendBotLog("COMMAND", room, sender, "/보석", e.message || "오류", false);
      replier.reply("오류: " + e.message);
    }

    // /스킬 캐릭명
  } else if (text.startsWith("/스킬 ")) {
    var name = text.substring(4).trim();
    try {
      var res = org.jsoup.Jsoup.connect(
        SERVER_URL +
          "/api/lostark/character/" +
          java.net.URLEncoder.encode(name, "UTF-8") +
          "/skills",
      )
        .ignoreContentType(true)
        .get()
        .body()
        .text();
      var json = JSON.parse(res);
      if (!json.success) {
        replier.reply("스킬 정보를 찾을 수 없습니다.");
        return;
      }
      var skills = json.data || [];
      var active = [];
      for (var i = 0; i < skills.length; i++) {
        if (skills[i].Level >= 4) active.push(skills[i]);
      }
      if (active.length === 0) {
        replier.reply(name + "의 스킬 정보가 없습니다.");
        return;
      }
      var msg = "【 " + name + " 스킬 】\n";
      msg += "───────────────\n";
      for (var i = 0; i < active.length; i++) {
        var s = active[i];
        var runeStr = s.Rune && s.Rune.Name ? "  [" + s.Rune.Name + "]" : "";
        msg += "▸ " + s.Name + "  Lv." + s.Level + runeStr + "\n";
        var tripods = s.Tripods || [];
        // 티어별(1~3) 선택된 슬롯 위치(0~2 → 1~3)로 코드 생성
        var tierMap = {};
        for (var j = 0; j < tripods.length; j++) {
          var t = tripods[j];
          if (t.IsSelected) tierMap[t.Tier] = t.Slot;
        }
        var tripodStr = "";
        for (var tier = 0; tier <= 2; tier++) {
          if (tierMap[tier] !== undefined) tripodStr += tierMap[tier];
        }
        if (tripodStr) msg += "   " + tripodStr + "\n";
      }
      replier.reply(msg.trim());
      sendBotLog("COMMAND", room, sender, "/스킬", name, true);
    } catch (e) {
      sendBotLog("COMMAND", room, sender, "/스킬", e.message || "오류", false);
      replier.reply("오류: " + e.message);
    }

    // /악세 캐릭명 (목걸이/귀걸이/반지만)
  } else if (text.startsWith("/악세 ")) {
    var name = text.substring(4).trim();
    try {
      var res = org.jsoup.Jsoup.connect(
        SERVER_URL +
          "/api/lostark/character/" +
          java.net.URLEncoder.encode(name, "UTF-8") +
          "/equipment",
      )
        .ignoreContentType(true)
        .execute()
        .body();
      var json = JSON.parse(res);
      if (!json.success) {
        replier.reply("장비 정보를 찾을 수 없습니다.");
        return;
      }
      var items = json.data || [];
      var accTypes = ["목걸이", "귀걸이", "반지"];
      var acc = [];
      for (var i = 0; i < items.length; i++) {
        for (var j = 0; j < accTypes.length; j++) {
          if (items[i].Type && items[i].Type.indexOf(accTypes[j]) >= 0) {
            acc.push(items[i]);
            break;
          }
        }
      }
      if (acc.length === 0) {
        replier.reply(name + "의 악세 정보가 없습니다.");
        return;
      }
      var msg = "【 " + name + " 악세 】\n";
      msg += "───────────────\n";
      for (var i = 0; i < acc.length; i++) {
        var item = acc[i];
        msg += "◆ [" + item.Type + "] " + item.Name + "\n";
        // 연마 효과 파싱
        if (item.Tooltip) {
          try {
            var tip = JSON.parse(item.Tooltip);
            for (var k in tip) {
              var el = tip[k];
              if (!el) continue;
              if (el.type === "ItemPartBox" && el.value) {
                var label = stripHtml(el.value.Element_000 || "");
                if (label.indexOf("연마 효과") >= 0) {
                  var content = el.value.Element_001 || "";
                  var rawParts = content.split("<br>");
                  var parts = [];
                  for (var pi = 0; pi < rawParts.length; pi++) {
                    var sub = rawParts[pi].split("<BR>");
                    for (var si = 0; si < sub.length; si++) parts.push(sub[si]);
                  }
                  for (var li = 0; li < parts.length; li++) {
                    var lt = stripHtml(parts[li]).trim();
                    if (lt) msg += "   · " + getAccGrade(parts[li]) + lt + "\n";
                  }
                }
              }
            }
          } catch (te) {}
        }
      }
      replier.reply(msg.trim());
      sendBotLog("COMMAND", room, sender, "/악세", name, true);
    } catch (e) {
      sendBotLog("COMMAND", room, sender, "/악세", e.message || "오류", false);
      replier.reply("오류: " + e.message);
    }

    // /팔찌 캐릭명
  } else if (text.startsWith("/팔찌 ")) {
    var name = text.substring(4).trim();
    try {
      var res = org.jsoup.Jsoup.connect(
        SERVER_URL +
          "/api/lostark/character/" +
          java.net.URLEncoder.encode(name, "UTF-8") +
          "/equipment",
      )
        .ignoreContentType(true)
        .execute()
        .body();
      var json = JSON.parse(res);
      if (!json.success) {
        replier.reply("팔찌 정보를 찾을 수 없습니다.");
        return;
      }
      var items = json.data || [];
      var bracelet = null;
      for (var i = 0; i < items.length; i++) {
        if (items[i].Type && items[i].Type.indexOf("팔찌") >= 0) {
          bracelet = items[i];
          break;
        }
      }
      if (!bracelet) {
        replier.reply(name + "의 팔찌 정보가 없습니다.");
        return;
      }
      var msg = "【 " + name + " 팔찌 】\n";
      msg += "───────────────\n";
      msg += "◆ " + bracelet.Name + "\n";
      if (bracelet.Tooltip) {
        try {
          var tip = JSON.parse(bracelet.Tooltip);
          for (var k in tip) {
            var el = tip[k];
            if (!el) continue;
            if (el.type === "ItemPartBox" && el.value) {
              var label = stripHtml(el.value.Element_000 || "");
              if (label.indexOf("팔찌 효과") >= 0) {
                var content = el.value.Element_001 || "";
                // <BR>로 분리 후 <img>로 시작하는 부분이 새 옵션, 아니면 이전 옵션의 연속
                var rawParts = content.split("<BR>");
                var options = [];
                var cur = "";
                var curRaw = "";
                for (var pi = 0; pi < rawParts.length; pi++) {
                  var part = rawParts[pi].trim();
                  if (!part) continue;
                  if (part.toLowerCase().indexOf("<img") === 0) {
                    if (cur) options.push({ text: cur, raw: curRaw });
                    cur = stripHtml(part).trim();
                    curRaw = part;
                  } else {
                    var cont = stripHtml(part).trim();
                    if (cont) cur += (cur ? " " : "") + cont;
                    curRaw += part;
                  }
                }
                if (cur) options.push({ text: cur, raw: curRaw });
                for (var oi = 0; oi < options.length; oi++) {
                  if (options[oi].text)
                    msg +=
                      "   · " +
                      getAccGrade(options[oi].raw) +
                      options[oi].text +
                      "\n";
                }
              }
            }
          }
        } catch (te) {}
      }
      replier.reply(msg.trim());
      sendBotLog("COMMAND", room, sender, "/팔찌", name, true);
    } catch (e) {
      sendBotLog("COMMAND", room, sender, "/팔찌", e.message || "오류", false);
      replier.reply("오류: " + e.message);
    }

    // /장비 캐릭명
  } else if (text.startsWith("/장비 ")) {
    var name = text.substring(4).trim();
    try {
      var res = org.jsoup.Jsoup.connect(
        SERVER_URL +
          "/api/lostark/character/" +
          java.net.URLEncoder.encode(name, "UTF-8") +
          "/equipment",
      )
        .ignoreContentType(true)
        .execute()
        .body();
      var json = JSON.parse(res);
      if (!json.success) {
        replier.reply("장비 정보를 찾을 수 없습니다.");
        return;
      }
      var items = json.data || [];
      var accTypes = ["목걸이", "귀걸이", "반지", "팔찌", "어빌리티 스톤"];
      var equip = [];
      for (var i = 0; i < items.length; i++) {
        var isAcc = false;
        for (var j = 0; j < accTypes.length; j++) {
          if (items[i].Type && items[i].Type.indexOf(accTypes[j]) >= 0) {
            isAcc = true;
            break;
          }
        }
        if (!isAcc) equip.push(items[i]);
      }
      if (equip.length === 0) {
        replier.reply(name + "의 장비 정보가 없습니다.");
        return;
      }
      var msg = "【 " + name + " 장비 】\n";
      msg += "───────────────\n";
      for (var i = 0; i < equip.length; i++) {
        var item = equip[i];
        msg +=
          "◆ [" + item.Type + "] " + item.Name + "  [" + item.Grade + "]\n";
      }
      replier.reply(msg.trim());
      sendBotLog("COMMAND", room, sender, "/장비", name, true);
    } catch (e) {
      sendBotLog("COMMAND", room, sender, "/장비", e.message || "오류", false);
      replier.reply("오류: " + e.message);
    }

    // /내실 캐릭명
  } else if (text.startsWith("/내실 ")) {
    var name = text.substring(4).trim();
    try {
      var res = org.jsoup.Jsoup.connect(
        SERVER_URL +
          "/api/lostark/character/" +
          java.net.URLEncoder.encode(name, "UTF-8") +
          "/collectibles",
      )
        .ignoreContentType(true)
        .get()
        .body()
        .text();
      var json = JSON.parse(res);
      if (!json.success) {
        replier.reply("내실 정보를 찾을 수 없습니다.");
        return;
      }
      var items = json.data || [];
      if (items.length === 0) {
        replier.reply(name + "의 내실 정보가 없습니다.");
        return;
      }
      var totalPoint = 0,
        totalMax = 0;
      var msg = "【 " + name + " 내실 】\n";
      msg += "───────────────\n";
      for (var i = 0; i < items.length; i++) {
        var c = items[i];
        var pct = Math.floor((c.Point / c.MaxPoint) * 100);
        msg +=
          "[" + pct + "%] " + c.Type + "  " + c.Point + "/" + c.MaxPoint + "\n";
        totalPoint += c.Point;
        totalMax += c.MaxPoint;
      }
      var totalPct =
        totalMax > 0 ? Math.floor((totalPoint / totalMax) * 100) : 0;
      msg += "───────────────\n";
      msg += "전체  " + totalPct + "%  (" + totalPoint + "/" + totalMax + ")";
      replier.reply(msg.trim());
      sendBotLog("COMMAND", room, sender, "/내실", name, true);
    } catch (e) {
      sendBotLog("COMMAND", room, sender, "/내실", e.message || "오류", false);
      replier.reply("오류: " + e.message);
    }

    // /분배금 금액 (공정 입찰가 계산)
  } else if (text.startsWith("/분배금 ")) {
    var amountStr = text.substring(5).trim().split(",").join("");
    var price = parseInt(amountStr);
    if (isNaN(price) || price <= 0) {
      replier.reply("올바른 금액을 입력해주세요.\n예) /분배금 20000");
    } else {
      function toComma(n) {
        var s = "" + n;
        var result = "";
        for (var i = 0; i < s.length; i++) {
          if (i > 0 && (s.length - i) % 3 === 0) result += ",";
          result += s[i];
        }
        return result;
      }
      // 공동분배: 아이템가 × (N-1)/N
      // 선점가: 아이템가 × 0.95 × (N-1)/N × (N(N-1)-2)/(N(N-1)-1)
      //   N=4: × 0.95 × 3/4 × 10/11
      //   N=8: × 0.95 × 7/8 × 54/55
      var fair4 = Math.floor((price * 3) / 4);
      var sel4 = Math.floor((((price * 0.95 * 3) / 4) * 10) / 11);
      var fair8 = Math.floor((price * 7) / 8);
      var sel8 = Math.floor((((price * 0.95 * 7) / 8) * 54) / 55);
      var msg = "【 분배금 】\n";
      msg += "───────────────\n";
      msg += "경매가  " + toComma(price) + "G\n";
      msg += "\n";
      msg += "4인 공동분배  " + toComma(fair4) + "G\n";
      msg += "4인 선점가     " + toComma(sel4) + "G\n";
      msg += "\n";
      msg += "8인 공동분배  " + toComma(fair8) + "G\n";
      msg += "8인 선점가     " + toComma(sel8) + "G";
      replier.reply(msg);
      sendBotLog("COMMAND", room, sender, "/분배금", amountStr, true);
    }

    // /로펙 캐릭명
  } else if (text.startsWith("/로펙 ")) {
    var name = text.substring(4).trim();
    try {
      var lopecHtml = org.jsoup.Jsoup.connect(
        "https://m.lopec.kr/character/specPoint/" +
          java.net.URLEncoder.encode(name, "UTF-8"),
      )
        .ignoreContentType(true)
        .userAgent("Mozilla/5.0")
        .timeout(8000)
        .execute()
        .body();
      lopecHtml = lopecHtml.replace(/[\n\r]/g, " ");
      var lopecMatch = lopecHtml.match(
        /달성 최고 점수<\/span>\s*<span[^>]*>([\d.]+)<\/span>/,
      );
      if (!lopecMatch) {
        replier.reply(name + "의 로펙 정보를 찾을 수 없습니다.");
        return;
      }
      var score = lopecMatch[1].trim();
      var msg = "【 " + name + " 로펙 】\n";
      msg += "───────────────\n";
      msg += "달성 최고 점수  " + score;
      replier.reply(msg);
      sendBotLog("COMMAND", room, sender, "/로펙", name, true);
    } catch (e) {
      sendBotLog("COMMAND", room, sender, "/로펙", e.message || "오류", false);
      replier.reply("오류: " + e.message);
    }

    // 구글시트 관련 명령어 (이쁜말 채팅방 전용)
  } else if (
    (text.startsWith("/일정 ") ||
      text.startsWith("/일정전체 ") ||
      text.startsWith("/오늘일정 ") ||
      text === "/파티편성" ||
      text === "/일정새로고침") &&
    room !== GUILD_ROOM
  ) {
    // 다른 채팅방에서는 무응답
    // /일정 캐릭명
  } else if (text.startsWith("/일정 ")) {
    var name = text.substring(4).trim();
    try {
      var res = org.jsoup.Jsoup.connect(
        SERVER_URL +
          "/api/schedule/character/" +
          java.net.URLEncoder.encode(name, "UTF-8"),
      )
        .ignoreContentType(true)
        .timeout(30000)
        .get()
        .body()
        .text();
      var json = JSON.parse(res);
      if (!json.success || !json.data || json.data.length === 0) {
        replier.reply(name + "의 이번 주 레이드 일정이 없습니다.");
        return;
      }
      var msg = "【 " + name + " 이번주 일정 】\n";
      for (var i = 0; i < json.data.length; i++) {
        msg += "───────────────\n";
        var item = json.data[i];
        msg += "◆ " + item.raidName + "  " + item.schedule + "\n";
        msg += "   · " + item.selfDisplay + "\n";
        var members = item.participants || [];
        for (var p = 0; p < members.length; p++) {
          msg += "   · " + members[p] + "\n";
        }
      }
      replier.reply(msg.trim());
      sendBotLog("COMMAND", room, sender, "/일정", name, true);
    } catch (e) {
      sendBotLog("COMMAND", room, sender, "/일정", e.message || "오류", false);
      replier.reply("오류: " + e.message);
    }

    // /일정전체 캐릭명
  } else if (text.startsWith("/일정전체 ")) {
    var name = text.substring(6).trim();
    try {
      var res = org.jsoup.Jsoup.connect(
        SERVER_URL +
          "/api/schedule/expedition/" +
          java.net.URLEncoder.encode(name, "UTF-8"),
      )
        .ignoreContentType(true)
        .timeout(30000)
        .get()
        .body()
        .text();
      var json = JSON.parse(res);
      if (!json.success || !json.data) {
        replier.reply(name + "의 원정대를 찾을 수 없습니다.");
        return;
      }
      var data = json.data;
      var members = data.members || [];

      // 일정이 있는 멤버만 필터
      var activeMembers = [];
      for (var i = 0; i < members.length; i++) {
        if (members[i].schedules && members[i].schedules.length > 0) {
          activeMembers.push(members[i]);
        }
      }

      if (activeMembers.length === 0) {
        replier.reply(
          "【 " + data.expeditionName + " 】\n이번 주 레이드 일정이 없습니다.",
        );
        return;
      }

      var msg = "【 " + data.expeditionName + " 원정대 일정 】\n";
      for (var i = 0; i < activeMembers.length; i++) {
        var member = activeMembers[i];
        msg += "━━━━━━━━━━━━\n";
        msg += "▶ " + member.characterName + "\n";
        var schedules = member.schedules;
        for (var j = 0; j < schedules.length; j++) {
          if (j > 0) msg += "────────────\n";
          var item = schedules[j];
          msg += "◆ " + item.raidName + "  " + item.schedule + "\n";
          msg += "   · " + item.selfDisplay + "\n";
          var parts = item.participants || [];
          for (var p = 0; p < parts.length; p++) {
            msg += "   · " + parts[p] + "\n";
          }
        }
      }
      replier.reply(msg.trim());
      sendBotLog("COMMAND", room, sender, "/일정전체", name, true);
    } catch (e) {
      sendBotLog("COMMAND", room, sender, "/일정전체", e.message || "오류", false);
      replier.reply("오류: " + e.message);
    }

    // /오늘일정 캐릭명
  } else if (text.startsWith("/오늘일정 ")) {
    var name = text.substring(6).trim();
    try {
      var res = org.jsoup.Jsoup.connect(
        SERVER_URL +
          "/api/schedule/expedition/" +
          java.net.URLEncoder.encode(name, "UTF-8"),
      )
        .ignoreContentType(true)
        .timeout(30000)
        .get()
        .body()
        .text();
      var json = JSON.parse(res);
      if (!json.success || !json.data) {
        replier.reply(name + "의 원정대를 찾을 수 없습니다.");
        return;
      }
      var data = json.data;

      // 오늘 요일 첫 글자 (일/월/화/수/목/금/토)
      var cal = java.util.Calendar.getInstance();
      var dow = cal.get(java.util.Calendar.DAY_OF_WEEK); // 1=일, 2=월, ..., 7=토
      var dayChars = ["일", "월", "화", "수", "목", "금", "토"];
      var dayFulls = [
        "일요일",
        "월요일",
        "화요일",
        "수요일",
        "목요일",
        "금요일",
        "토요일",
      ];
      var todayChar = dayChars[dow - 1];
      var todayFull = dayFulls[dow - 1];

      // 오늘 일정만 필터
      var todayMembers = [];
      var members = data.members || [];
      for (var i = 0; i < members.length; i++) {
        var todaySchedules = [];
        var schedules = members[i].schedules || [];
        for (var j = 0; j < schedules.length; j++) {
          if (schedules[j].schedule.indexOf(todayChar) === 0) {
            todaySchedules.push(schedules[j]);
          }
        }
        if (todaySchedules.length > 0) {
          todayMembers.push({
            characterName: members[i].characterName,
            schedules: todaySchedules,
          });
        }
      }

      if (todayMembers.length === 0) {
        replier.reply(
          "【 " +
            data.expeditionName +
            " 】\n" +
            todayFull +
            " 레이드 일정이 없습니다.",
        );
        return;
      }

      var msg = "【 " + data.expeditionName + " " + todayFull + " 】\n";
      for (var i = 0; i < todayMembers.length; i++) {
        var member = todayMembers[i];
        msg += "━━━━━━━━━━━━\n";
        msg += "▶ " + member.characterName + "\n";
        var scheds = member.schedules;
        for (var j = 0; j < scheds.length; j++) {
          if (j > 0) msg += "────────────\n";
          var item = scheds[j];
          msg += "◆ " + item.raidName + "  " + item.schedule + "\n";
          msg += "   · " + item.selfDisplay + "\n";
          var parts = item.participants || [];
          for (var p = 0; p < parts.length; p++) {
            msg += "   · " + parts[p] + "\n";
          }
        }
      }
      replier.reply(msg.trim());
      sendBotLog("COMMAND", room, sender, "/오늘일정", name, true);
    } catch (e) {
      sendBotLog("COMMAND", room, sender, "/오늘일정", e.message || "오류", false);
      replier.reply("오류: " + e.message);
    }

    // /파티편성
  } else if (text === "/파티편성") {
    // try {
    //     replier.reply("파티 편성 중... 잠시만 기다려주세요.");
    //     var res = org.jsoup.Jsoup.connect(SERVER_URL + "/api/schedule/compose")
    //         .ignoreContentType(true)
    //         .method(org.jsoup.Connection.Method.POST)
    //         .timeout(30000).execute().body();
    //     var json = JSON.parse(res);
    //     if (!json.success || !json.data) {
    //         replier.reply("파티 편성 실패. 서버 로그를 확인해주세요.");
    //         return;
    //     }
    //     var data = json.data;
    //     var parties = data.parties || [];
    //     var partyAverages = data.partyAverages || [];
    //     var msg = "【 파티편성 완료 】\n";
    //     msg += "총 " + data.partyCount + "파티 / " + data.totalMembers + "명\n";
    //     for (var i = 0; i < parties.length; i++) {
    //         msg += "━━━━━━━━━━━━\n";
    //         // 서버에서 계산된 평균 사용 (시트 H8과 동일한 값)
    //         var avgStr = partyAverages[i] ? "  " + partyAverages[i] : "";
    //         msg += (i + 1) + "파티 (" + parties[i].length + "인)" + avgStr + "\n";
    //         for (var j = 0; j < parties[i].length; j++) {
    //             var m = parties[i][j];
    //             var tag = m.support ? "[S]" : "[D]";
    //             var raw = (m.power || "").trim();
    //             var lopec = raw ? (raw.indexOf("L") === 0 ? raw : "L" + raw) : "";
    //             msg += " · " + tag + " " + m.nickname;
    //             if (lopec) msg += " | " + lopec;
    //             msg += "\n";
    //         }
    //     }
    //     msg += "━━━━━━━━━━━━\n";
    //     msg += "다음주레이드 시트 확인!";
    //     replier.reply(msg.trim());
    // } catch(e) { replier.reply("오류: " + e.message); }
    // /일정새로고침
  } else if (text === "/일정새로고침") {
    try {
      org.jsoup.Jsoup.connect(SERVER_URL + "/api/schedule/refresh")
        .ignoreContentType(true)
        .method(org.jsoup.Connection.Method.POST)
        .timeout(5000)
        .execute();
      replier.reply(
        "일정 캐시가 초기화되었습니다.\n다음 /일정 조회 시 최신 데이터를 불러옵니다.",
      );
      sendBotLog("COMMAND", room, sender, "/일정새로고침", "", true);
    } catch (e) {
      sendBotLog("COMMAND", room, sender, "/일정새로고침", e.message || "오류", false);
      replier.reply("오류: " + e.message);
    }

    // /오늘파티테스트
  } else if (text === "/오늘파티테스트") {
    savedGuildReplier = replier;
    sendTodayParty();
    // /기빵봇
  } else if (text === "/기빵봇") {
    var help = "";
    help += "【 기빵봇 도움말 】\n";
    help += "───────────────\n";
    help += "◆ 기본 정보\n";
    help += "  /정보 캐릭명\n";
    help += "  /각인 캐릭명\n";
    help += "  /원정대 캐릭명\n";
    help += "  /스킬 캐릭명\n";
    help += "  /내실 캐릭명\n";
    help += "  /로펙 캐릭명\n";
    help += "───────────────\n";
    help += "◆ 장비\n";
    help += "  /장비 캐릭명\n";
    help += "  /악세 캐릭명\n";
    help += "  /팔찌 캐릭명\n";
    help += "  /보석 캐릭명\n";
    help += "───────────────\n";
    help += "◆ 아크\n";
    help += "  /아크패시브 캐릭명\n";
    help += "  /아크그리드 캐릭명\n";
    help += "───────────────\n";
    if (room === GUILD_ROOM) {
      help += "◆ 길드\n";
      help += "  /일정 캐릭명\n";
      help += "  /일정전체 캐릭명\n";
      help += "  /오늘일정 캐릭명\n";
      help += "  /파티편성\n";
      help += "  /일정새로고침\n";
      help += "───────────────\n";
    }
    help += "◆ 경매\n";
    help += "  /분배금 금액";
    replier.reply(help);

    // /원정대 캐릭명 [최소레벨]
  } else if (text.startsWith("/원정대 ")) {
    var args = text.substring(5).trim();
    var tokens = args.split(" ");
    var minLevel = 1700;
    var name = args;
    // 마지막 토큰이 숫자면 최소 레벨로 사용
    var lastToken = tokens[tokens.length - 1];
    if (/^\d+$/.test(lastToken)) {
      minLevel = parseInt(lastToken);
      name = tokens
        .slice(0, tokens.length - 1)
        .join(" ")
        .trim();
    }
    try {
      var res = org.jsoup.Jsoup.connect(
        SERVER_URL +
          "/api/lostark/character/" +
          java.net.URLEncoder.encode(name, "UTF-8") +
          "/siblings",
      )
        .ignoreContentType(true)
        .get()
        .body()
        .text();
      var json = JSON.parse(res);
      if (!json.success) {
        replier.reply("원정대 정보를 찾을 수 없습니다.");
        return;
      }
      var chars = json.data || [];
      if (chars.length === 0) {
        replier.reply(name + "의 원정대 정보가 없습니다.");
        return;
      }
      chars.sort(function (a, b) {
        var la = parseFloat((a.ItemAvgLevel || "0").replace(",", ""));
        var lb = parseFloat((b.ItemAvgLevel || "0").replace(",", ""));
        return lb - la;
      });
      var filtered = [];
      var hiddenCount = 0;
      for (var i = 0; i < chars.length; i++) {
        var lv = parseFloat((chars[i].ItemAvgLevel || "0").replace(",", ""));
        if (lv >= minLevel) filtered.push(chars[i]);
        else hiddenCount++;
      }
      var msg = "【 " + name + " 원정대 】\n";
      msg += "───────────────\n";
      if (filtered.length === 0) {
        msg += minLevel + " 이상 캐릭터가 없습니다.";
      } else {
        for (var i = 0; i < filtered.length; i++) {
          var c = filtered[i];
          msg +=
            c.ItemAvgLevel +
            "  " +
            c.CharacterName +
            "[" +
            c.CharacterClassName +
            "]\n";
        }
        if (hiddenCount > 0)
          msg +=
            "───────────────\n" + minLevel + " 미만 " + hiddenCount + "명 생략";
      }
      replier.reply(msg.trim());
      sendBotLog("COMMAND", room, sender, "/원정대", name, true);
    } catch (e) {
      sendBotLog("COMMAND", room, sender, "/원정대", e.message || "오류", false);
      replier.reply("오류: " + e.message);
    }
  }
}

// ── 봇 로그 전송 ─────────────────────────────────────────────────
function sendBotLog(type, room, sender, command, detail, success) {
  try {
    var body = JSON.stringify({
      type: type,
      room: room || "",
      sender: sender || "",
      command: command || "",
      detail: detail || "",
      success: success
    });
    org.jsoup.Jsoup.connect(SERVER_URL + "/api/bot-log")
      .ignoreContentType(true)
      .requestBody(body)
      .header("Content-Type", "application/json")
      .timeout(5000)
      .post();
  } catch (e) {}
}

// ── 자동 전송 스케줄 설정 조회 ─────────────────────────────────────
// 백엔드에서 활성화된 첫 번째 스케줄을 가져온다.
// 반환값: { id, sendTime, targetRoom } 또는 null
function fetchActiveSchedule() {
  try {
    var res = org.jsoup.Jsoup.connect(SERVER_URL + "/api/bot/schedules")
      .ignoreContentType(true)
      .timeout(5000)
      .get()
      .body()
      .text();
    var json = JSON.parse(res);
    if (!json.success || !json.data || json.data.length === 0) return null;
    for (var i = 0; i < json.data.length; i++) {
      var s = json.data[i];
      if (s.active) return s;
    }
    return null;
  } catch (e) {
    Log.d("fetchActiveSchedule 오류: " + (e.message || e));
    return null;
  }
}

// ── 오늘의 파티 자동 전송 ─────────────────────────────────────────
function sendTodayParty() {
  if (!savedGuildReplier) return;

  // 전송 직전 active 여부 재확인
  var schedule = fetchActiveSchedule();
  if (!schedule) {
    Log.d("자동전송 비활성 상태 - 스킵");
    return;
  }

  try {
    var res = org.jsoup.Jsoup.connect(SERVER_URL + "/api/schedule/today")
      .ignoreContentType(true)
      .timeout(15000)
      .get()
      .body()
      .text();
    var json = JSON.parse(res);
    if (!json.success || !json.data || json.data.length === 0) {
      sendBotLog("AUTO_SEND", GUILD_ROOM, "", "오늘파티자동전송", "파티 없음", true);
      markScheduleSent(schedule.id);
      return;
    }

    var dayNames = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
    var today = dayNames[new Date().getDay()];
    var msg = "【 오늘의 레이드 파티 】 " + today + "\n";
    for (var i = 0; i < json.data.length; i++) {
      var party = json.data[i];
      msg += "───────────────\n";
      msg += "◆ " + party.raidName;
      if (party.time) msg += "  " + party.time;
      msg += "\n";
      for (var m = 0; m < party.members.length; m++) {
        msg += party.members[m] + "\n";
      }
    }
    savedGuildReplier.reply(msg.trim());
    sendBotLog("AUTO_SEND", GUILD_ROOM, "", "오늘파티자동전송", "파티 " + json.data.length + "개 전송", true);
    markScheduleSent(schedule.id);
  } catch (e) {
    sendBotLog("AUTO_SEND", GUILD_ROOM, "", "오늘파티자동전송", e.message || "오류", false);
  }
}

// 전송 완료 후 lastSentAt 업데이트
function markScheduleSent(scheduleId) {
  try {
    org.jsoup.Jsoup.connect(SERVER_URL + "/api/bot/schedules/" + scheduleId + "/sent")
      .ignoreContentType(true)
      .method(org.jsoup.Connection.Method.PATCH)
      .timeout(3000)
      .execute();
  } catch (e) {}
}

// 오늘 이미 전송했는지 추적 (날짜 문자열 "YYYY-MM-DD")
var lastSentDate = "";

function startDailyTimer() {
  var MINUTE_MS = 60 * 1000;

  Log.d("startDailyTimer: 1분 간격 스케줄 체크 시작");

  var timer = new java.util.Timer(true);
  timer.scheduleAtFixedRate(new java.util.TimerTask({
    run: function() {
      try {
        var schedule = fetchActiveSchedule();
        if (!schedule || !schedule.sendTime) return;

        var now = new Date();
        var hh = now.getHours();
        var mm = now.getMinutes();
        var todayStr = now.getFullYear() + "-" +
                       (now.getMonth() + 1) + "-" +
                       now.getDate();

        var parts = schedule.sendTime.split(":");
        var targetHH = parseInt(parts[0], 10);
        var targetMM = parseInt(parts[1], 10);

        // 오늘 아직 안 보냈고, 현재 시:분이 설정 시간과 일치하면 전송
        if (hh === targetHH && mm === targetMM && lastSentDate !== todayStr) {
          lastSentDate = todayStr;
          Log.d("자동전송 실행: " + schedule.sendTime);
          sendTodayParty();
        }
      } catch (e) {
        Log.d("스케줄 체크 오류: " + (e.message || e));
      }
    }
  }), 0, MINUTE_MS);
}
