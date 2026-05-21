var SERVER_URL = "http://sisnet2.iptime.org:48080";

// HTML 태그 제거 헬퍼 (각인/아크패시브 Description에 포함된 FONT 태그 등 제거)
function stripHtml(str) {
    if (!str) return "";
    return str.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function response(room, msg, sender, isGroupChat, replier, imageDB, packageName) {
    var text = msg.trim();

    // /정보 캐릭명
    if (text.startsWith("/정보 ")) {
        var name = text.substring(4).trim();
        try {
            var res = org.jsoup.Jsoup.connect(SERVER_URL + "/api/lostark/character/" + java.net.URLEncoder.encode(name, "UTF-8"))
                .ignoreContentType(true).get().body().text();
            var json = JSON.parse(res);
            if (!json.success) { replier.reply("캐릭터를 찾을 수 없습니다."); return; }
            var d = json.data;

            // 치명 / 특화 / 신속만 추출
            var stats = d.Stats || [];
            var statTargets = ["치명", "특화", "신속"];
            var statParts = [];
            for (var i = 0; i < stats.length; i++) {
                if (statTargets.indexOf(stats[i].Type) >= 0) {
                    statParts.push(stats[i].Type + " " + stats[i].Value);
                }
            }

            var msg = "";
            if (d.Title) msg += "❖ " + d.Title + "\n";
            msg += "【 " + d.CharacterName + " 】\n";
            msg += d.ServerName + " · " + d.CharacterClassName + "\n";
            msg += "─────────────────\n";
            msg += "⚔  아이템  " + d.ItemAvgLevel + "\n";
            msg += "💥 전투력  " + d.CombatPower + "\n";
            msg += "🏰 길드     " + (d.GuildName ? d.GuildName + (d.GuildMemberGrade ? " (" + d.GuildMemberGrade + ")" : "") : "없음") + "\n";
            msg += "📖 원정대  Lv." + d.ExpeditionLevel + "  |  스킬포인트 " + d.UsingSkillPoint + "/" + d.TotalSkillPoint + "\n";
            if (statParts.length > 0) msg += "📊 " + statParts.join(" · ") + "\n";

            // 각인 정보 (아크패시브 캐릭터 → ArkPassiveEffects, 구형 → Effects)
            try {
                var engRes = org.jsoup.Jsoup.connect(SERVER_URL + "/api/lostark/character/" + java.net.URLEncoder.encode(name, "UTF-8") + "/engravings")
                    .ignoreContentType(true).get().body().text();
                var engJson = JSON.parse(engRes);
                if (engJson.success && engJson.data) {
                    var engEffects = [];
                    if (engJson.data.ArkPassiveEffects && engJson.data.ArkPassiveEffects.length > 0) {
                        engEffects = engJson.data.ArkPassiveEffects;
                    } else if (engJson.data.Effects && engJson.data.Effects.length > 0) {
                        engEffects = engJson.data.Effects;
                    }
                    if (engEffects.length > 0) {
                        msg += "─────────────────\n";
                        msg += "【 각인 】\n";
                        for (var ei = 0; ei < engEffects.length; ei++) {
                            var ef = engEffects[ei];
                            msg += "◆ " + ef.Name;
                            if (ef.Level !== undefined && ef.Level !== null) msg += " Lv." + ef.Level;
                            msg += "\n";
                        }
                    }
                }
            } catch(engErr) {}

            // 아크그리드 정보 (Slots + Effects 구조)
            try {
                var gridRes = org.jsoup.Jsoup.connect(SERVER_URL + "/api/lostark/character/" + java.net.URLEncoder.encode(name, "UTF-8") + "/arkgrid")
                    .ignoreContentType(true).get().body().text();
                var gridJson = JSON.parse(gridRes);
                if (gridJson.success && gridJson.data) {
                    var gridEffects = gridJson.data.Effects || [];
                    if (gridEffects.length > 0) {
                        msg += "─────────────────\n";
                        msg += "【 아크그리드 】\n";
                        for (var ci = 0; ci < gridEffects.length; ci++) {
                            var ge = gridEffects[ci];
                            msg += "◆ " + ge.Name + "  Lv." + ge.Level + "\n";
                        }
                    }
                }
            } catch(gridErr) {}

            // 보석 정보
            try {
                var gemRes = org.jsoup.Jsoup.connect(SERVER_URL + "/api/lostark/character/" + java.net.URLEncoder.encode(name, "UTF-8") + "/gems")
                    .ignoreContentType(true).get().body().text();
                var gemJson = JSON.parse(gemRes);
                if (gemJson.success) {
                    var gemList = gemJson.data.Gems || [];
                    var gemEffects = (gemJson.data.Effects && gemJson.data.Effects.Skills) ? gemJson.data.Effects.Skills : [];
                    if (gemList.length > 0) {
                        msg += "─────────────────\n";
                        msg += "【 보석 】\n";
                        for (var gi = 0; gi < gemList.length; gi++) {
                            var gm = gemList[gi];
                            var geff = null;
                            for (var gj = 0; gj < gemEffects.length; gj++) {
                                if (gemEffects[gj].GemSlot === gm.Slot) { geff = gemEffects[gj]; break; }
                            }
                            msg += gm.Name;
                            if (geff && geff.Description && geff.Description.length > 0) {
                                msg += "\n   └ " + geff.Description[0];
                            }
                            msg += "\n";
                        }
                    }
                }
            } catch(gemErr) {}

            replier.reply(msg.trim());

        } catch(e) { replier.reply("오류: " + e.message); }

    // /각인 캐릭명
    } else if (text.startsWith("/각인 ")) {
        var name = text.substring(4).trim();
        try {
            var res = org.jsoup.Jsoup.connect(SERVER_URL + "/api/lostark/character/" + java.net.URLEncoder.encode(name, "UTF-8") + "/engravings")
                .ignoreContentType(true).get().body().text();
            var json = JSON.parse(res);
            if (!json.success) { replier.reply("각인 정보를 찾을 수 없습니다."); return; }
            // 아크패시브 캐릭터 → ArkPassiveEffects, 구형 → Effects
            var effects = [];
            if (json.data && json.data.ArkPassiveEffects && json.data.ArkPassiveEffects.length > 0) {
                effects = json.data.ArkPassiveEffects;
            } else if (json.data && json.data.Effects && json.data.Effects.length > 0) {
                effects = json.data.Effects;
            }
            if (effects.length === 0) { replier.reply(name + "의 각인 정보가 없습니다."); return; }
            var msg = "【 " + name + " 각인 】\n";
            msg += "─────────────────\n";
            for (var i = 0; i < effects.length; i++) {
                var e = effects[i];
                msg += "◆ " + e.Name;
                if (e.Level !== undefined && e.Level !== null) msg += " Lv." + e.Level;
                msg += "\n";
                if (e.Description) msg += "   " + stripHtml(e.Description) + "\n";
            }
            replier.reply(msg.trim());
        } catch(e) { replier.reply("오류: " + e.message); }

    // /아크패시브 캐릭명
    } else if (text.startsWith("/아크패시브 ")) {
        var name = text.substring(7).trim();
        try {
            var res = org.jsoup.Jsoup.connect(SERVER_URL + "/api/lostark/character/" + java.net.URLEncoder.encode(name, "UTF-8") + "/arkpassive")
                .ignoreContentType(true).get().body().text();
            var json = JSON.parse(res);
            if (!json.success) { replier.reply("아크패시브 정보를 찾을 수 없습니다."); return; }
            var d = json.data;
            if (!d || !d.IsArkPassive) { replier.reply(name + "의 아크패시브가 해금되지 않았습니다."); return; }

            var msg = "【 " + name + " 아크패시브 】\n";
            if (d.Title) msg += "  " + d.Title + "\n";
            msg += "─────────────────\n";

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
                msg += "✦ " + ptList.join("  /  ") + "\n";
                msg += "─────────────────\n";
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
            var catIcons = { "깨달음": "🔵", "진화": "🟡", "도약": "🟢" };
            for (var ci = 0; ci < categoryOrder.length; ci++) {
                var cat = categoryOrder[ci];
                msg += (catIcons[cat] || "▸") + " [" + cat + "]\n";
                var catItems = categoryMap[cat];
                for (var ni = 0; ni < catItems.length; ni++) {
                    msg += "   · " + catItems[ni] + "\n";
                }
            }

            replier.reply(msg.trim());
        } catch(e) { replier.reply("오류: " + e.message); }

    // /아크그리드 캐릭명
    } else if (text.startsWith("/아크그리드 ")) {
        var name = text.substring(7).trim();
        try {
            var res = org.jsoup.Jsoup.connect(SERVER_URL + "/api/lostark/character/" + java.net.URLEncoder.encode(name, "UTF-8") + "/arkgrid")
                .ignoreContentType(true).get().body().text();
            var json = JSON.parse(res);
            if (!json.success) { replier.reply("아크그리드 정보를 찾을 수 없습니다."); return; }
            var d = json.data;
            if (!d) { replier.reply(name + "의 아크그리드 정보가 없습니다."); return; }

            var slots = d.Slots || [];
            var gridEffects = d.Effects || [];
            if (slots.length === 0 && gridEffects.length === 0) {
                replier.reply(name + "의 아크그리드 정보가 없습니다.");
                return;
            }

            var msg = "【 " + name + " 아크그리드 】\n";
            msg += "─────────────────\n";

            // 장착 슬롯 (아이템명 + 포인트 + 등급)
            if (slots.length > 0) {
                msg += "【 장착 슬롯 】\n";
                for (var i = 0; i < slots.length; i++) {
                    var s = slots[i];
                    msg += "◆ " + s.Name + "  " + s.Point + "pt  [" + s.Grade + "]\n";
                }
                msg += "─────────────────\n";
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
        } catch(e) { replier.reply("오류: " + e.message); }

    // /보석 캐릭명
    } else if (text.startsWith("/보석 ")) {
        var name = text.substring(4).trim();
        try {
            var res = org.jsoup.Jsoup.connect(SERVER_URL + "/api/lostark/character/" + java.net.URLEncoder.encode(name, "UTF-8") + "/gems")
                .ignoreContentType(true).get().body().text();
            var json = JSON.parse(res);
            if (!json.success) { replier.reply("보석 정보를 찾을 수 없습니다."); return; }
            var gems = json.data.Gems || [];
            var effects = (json.data.Effects && json.data.Effects.Skills) ? json.data.Effects.Skills : [];
            if (gems.length === 0) { replier.reply(name + "의 보석 정보가 없습니다."); return; }
            var msg = "【 " + name + " 보석 】\n";
            msg += "─────────────────\n";
            for (var i = 0; i < gems.length; i++) {
                var g = gems[i];
                var eff = null;
                for (var j = 0; j < effects.length; j++) {
                    if (effects[j].GemSlot === g.Slot) { eff = effects[j]; break; }
                }
                msg += g.Name;
                if (eff) {
                    var desc = eff.Description && eff.Description.length > 0 ? eff.Description[0] : "";
                    msg += "\n   └ " + desc;
                }
                msg += "\n";
            }
            replier.reply(msg.trim());
        } catch(e) { replier.reply("오류: " + e.message); }

    // /스킬 캐릭명
    } else if (text.startsWith("/스킬 ")) {
        var name = text.substring(4).trim();
        try {
            var res = org.jsoup.Jsoup.connect(SERVER_URL + "/api/lostark/character/" + java.net.URLEncoder.encode(name, "UTF-8") + "/skills")
                .ignoreContentType(true).get().body().text();
            var json = JSON.parse(res);
            if (!json.success) { replier.reply("스킬 정보를 찾을 수 없습니다."); return; }
            var skills = json.data || [];
            var active = [];
            for (var i = 0; i < skills.length; i++) {
                if (skills[i].Level >= 4) active.push(skills[i]);
            }
            if (active.length === 0) { replier.reply(name + "의 스킬 정보가 없습니다."); return; }
            var msg = "【 " + name + " 스킬 】\n";
            msg += "─────────────────\n";
            for (var i = 0; i < active.length; i++) {
                var s = active[i];
                msg += "▸ " + s.Name + "  Lv." + s.Level + "\n";
                var tripods = s.Tripods || [];
                var selected = [];
                for (var j = 0; j < tripods.length; j++) {
                    if (tripods[j].IsSelected) selected.push(tripods[j].Name);
                }
                if (selected.length > 0) msg += "   " + selected.join(" · ") + "\n";
            }
            replier.reply(msg.trim());
        } catch(e) { replier.reply("오류: " + e.message); }

    // /악세 캐릭명
    } else if (text.startsWith("/악세 ")) {
        var name = text.substring(4).trim();
        try {
            var res = org.jsoup.Jsoup.connect(SERVER_URL + "/api/lostark/character/" + java.net.URLEncoder.encode(name, "UTF-8") + "/equipment")
                .ignoreContentType(true).get().body().text();
            var json = JSON.parse(res);
            if (!json.success) { replier.reply("장비 정보를 찾을 수 없습니다."); return; }
            var items = json.data || [];
            var accTypes = ["목걸이","귀걸이","반지","팔찌","어빌리티 스톤"];
            var acc = [];
            for (var i = 0; i < items.length; i++) {
                for (var j = 0; j < accTypes.length; j++) {
                    if (items[i].Type && items[i].Type.indexOf(accTypes[j]) >= 0) {
                        acc.push(items[i]); break;
                    }
                }
            }
            if (acc.length === 0) { replier.reply(name + "의 악세 정보가 없습니다."); return; }
            var msg = "【 " + name + " 악세 】\n";
            msg += "─────────────────\n";
            for (var i = 0; i < acc.length; i++) {
                var item = acc[i];
                msg += "◆ [" + item.Type + "] " + item.Name + "\n";
            }
            replier.reply(msg.trim());
        } catch(e) { replier.reply("오류: " + e.message); }

    // /내실 캐릭명
    } else if (text.startsWith("/내실 ")) {
        var name = text.substring(4).trim();
        try {
            var res = org.jsoup.Jsoup.connect(SERVER_URL + "/api/lostark/character/" + java.net.URLEncoder.encode(name, "UTF-8") + "/collectibles")
                .ignoreContentType(true).get().body().text();
            var json = JSON.parse(res);
            if (!json.success) { replier.reply("내실 정보를 찾을 수 없습니다."); return; }
            var items = json.data || [];
            if (items.length === 0) { replier.reply(name + "의 내실 정보가 없습니다."); return; }
            var msg = "【 " + name + " 내실 】\n";
            msg += "─────────────────\n";
            for (var i = 0; i < items.length; i++) {
                var c = items[i];
                var pct = Math.floor(c.Point / c.MaxPoint * 100);
                msg += c.Type + "  " + c.Point + "/" + c.MaxPoint + "  (" + pct + "%)\n";
            }
            replier.reply(msg.trim());
        } catch(e) { replier.reply("오류: " + e.message); }

    // /원정대 캐릭명
    } else if (text.startsWith("/원정대 ")) {
        var name = text.substring(5).trim();
        try {
            var res = org.jsoup.Jsoup.connect(SERVER_URL + "/api/lostark/character/" + java.net.URLEncoder.encode(name, "UTF-8") + "/siblings")
                .ignoreContentType(true).get().body().text();
            var json = JSON.parse(res);
            if (!json.success) { replier.reply("원정대 정보를 찾을 수 없습니다."); return; }
            var chars = json.data || [];
            if (chars.length === 0) { replier.reply(name + "의 원정대 정보가 없습니다."); return; }
            chars.sort(function(a, b) {
                var la = parseFloat((a.ItemMaxLevel || "0").replace(",", ""));
                var lb = parseFloat((b.ItemMaxLevel || "0").replace(",", ""));
                return lb - la;
            });
            var msg = "【 " + name + " 원정대 】\n";
            msg += "─────────────────\n";
            for (var i = 0; i < chars.length; i++) {
                var c = chars[i];
                msg += c.ItemMaxLevel + "  " + c.CharacterName + "  (" + c.CharacterClassName + ")\n";
            }
            replier.reply(msg.trim());
        } catch(e) { replier.reply("오류: " + e.message); }
    }
}
