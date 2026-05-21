var SERVER_URL = "http://sisnet2.iptime.org:48080";

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

            replier.reply(SERVER_URL + "/preview/character/" + java.net.URLEncoder.encode(name, "UTF-8"));

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
            var effects = (json.data && json.data.Effects) ? json.data.Effects : [];
            if (effects.length === 0) { replier.reply(name + "의 각인 정보가 없습니다."); return; }
            var msg = "【 " + name + " 각인 】\n";
            msg += "─────────────────\n";
            for (var i = 0; i < effects.length; i++) {
                var e = effects[i];
                msg += "◆ " + e.Name + "\n";
                if (e.Description) msg += "   " + e.Description + "\n";
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
            if (!d || !d.IsUnlocked) { replier.reply(name + "의 아크패시브가 해금되지 않았습니다."); return; }

            var msg = "【 " + name + " 아크패시브 】\n";
            msg += "─────────────────\n";

            var points = d.Points || [];
            if (points.length > 0) {
                var ptList = [];
                for (var i = 0; i < points.length; i++) ptList.push(points[i].Name + " " + points[i].Value);
                msg += "✦ " + ptList.join("  /  ") + "\n";
                msg += "─────────────────\n";
            }

            var nodes = d.Nodes || [];
            var typeMap = {};
            for (var i = 0; i < nodes.length; i++) {
                var n = nodes[i];
                if (n.Level < 1) continue;
                var t = n.Type || "기타";
                if (!typeMap[t]) typeMap[t] = [];
                typeMap[t].push(n.Name + " Lv." + n.Level);
            }
            var typeIcons = { "점화": "🔴", "진화": "🟢", "회귀": "🔵" };
            var types = ["점화", "진화", "회귀"];
            for (var ti = 0; ti < types.length; ti++) {
                var t = types[ti];
                if (typeMap[t] && typeMap[t].length > 0) {
                    msg += (typeIcons[t] || "▸") + " [" + t + "]\n";
                    for (var ni = 0; ni < typeMap[t].length; ni++) {
                        msg += "   · " + typeMap[t][ni] + "\n";
                    }
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
            if (!d || !d.IsUnlocked) { replier.reply(name + "의 아크그리드가 해금되지 않았습니다."); return; }

            var presets = d.Presets || [];
            var activePreset = null;
            for (var i = 0; i < presets.length; i++) {
                if (presets[i].IsActive) { activePreset = presets[i]; break; }
            }
            if (!activePreset) { replier.reply(name + "의 활성화된 아크그리드 프리셋이 없습니다."); return; }

            var msg = "【 " + name + " 아크그리드 】\n";
            msg += "─────────────────\n";
            var cells = activePreset.Cells || [];
            for (var i = 0; i < cells.length; i++) {
                var c = cells[i];
                msg += "◆ " + c.Name + "  Lv." + c.Level + "/" + c.MaxLevel + "\n";
                if (c.Description) msg += "   " + c.Description + "\n";
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