// var SERVER_URL = "https://api.gitaey-dev.com";
var SERVER_URL = "http://sisnet2.iptime.org:48080";

var roomRepliers = {}; // 방별 replier 저장
var timerStarted = false;
var lastSentDate = ""; // 오늘 자동전송 완료 여부 추적

function response(room, msg, sender, isGroupChat, replier, imageDB, packageName) {
  // 모든 방의 replier 저장
  roomRepliers[room] = replier;

  // 첫 메시지 수신 시 타이머 시작
  if (!timerStarted) {
    timerStarted = true;
    startDailyTimer();
  }

  // '/' 로 시작하는 명령어만 처리
  var text = msg.trim();
  if (!text.startsWith("/")) return;

  // 백엔드로 전달
  try {
    var body = JSON.stringify({ room: room, message: text, sender: sender });
    var res = org.jsoup.Jsoup.connect(SERVER_URL + "/api/bot/message")
      .ignoreContentType(true)
      .requestBody(body)
      .header("Content-Type", "application/json")
      .timeout(25000)
      .post()
      .body()
      .text();
    var json = JSON.parse(res);
    if (json.success && json.data) {
      if (json.data.imageUrl) replier.reply(json.data.imageUrl);
      if (json.data.reply) replier.reply(json.data.reply);
    }
  } catch (e) {
    var errMsg = e.message || String(e);
    Log.d("bot/message 오류: " + errMsg);
    replier.reply("[봇오류] " + errMsg);
  }
}

// ── 자동 전송 스케줄 설정 조회 ─────────────────────────────────────
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
      if (json.data[i].active) return json.data[i];
    }
    return null;
  } catch (e) {
    Log.d("fetchActiveSchedule 오류: " + (e.message || e));
    return null;
  }
}

// ── 오늘의 파티 자동 전송 ─────────────────────────────────────────
function sendTodayParty(targetRoom) {
  var replier = targetRoom ? roomRepliers[targetRoom] : null;
  if (!replier) {
    Log.d("자동전송 대상 방(" + targetRoom + ")의 replier 없음");
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
      replier.reply("오늘 등록된 레이드 파티가 없습니다.");
      sendLog("AUTO_SEND", targetRoom, "", "오늘파티자동전송", "파티 없음", true);
      return;
    }
    var dayNames = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
    var today = dayNames[new Date().getDay()];
    var msg = "【 오늘의 레이드 파티 】 " + today + "\n";
    for (var i = 0; i < json.data.length; i++) {
      var party = json.data[i];
      msg += "───────────────\n◆ " + party.raidName;
      if (party.time) msg += "  " + party.time;
      msg += "\n";
      for (var m = 0; m < party.members.length; m++) msg += party.members[m] + "\n";
    }
    replier.reply(msg.trim());
    sendLog("AUTO_SEND", targetRoom, "", "오늘파티자동전송", "파티 " + json.data.length + "개 전송", true);
  } catch (e) {
    replier.reply("오류: " + (e.message || "알 수 없는 오류"));
    sendLog("AUTO_SEND", targetRoom, "", "오늘파티자동전송", e.message || "오류", false);
  }
}

// ── 봇 로그 전송 ─────────────────────────────────────────────────
function sendLog(type, room, sender, command, detail, success) {
  try {
    var body = JSON.stringify({
      type: type, room: room || "", sender: sender || "",
      command: command || "", detail: detail || "", success: success
    });
    org.jsoup.Jsoup.connect(SERVER_URL + "/api/bot-log")
      .ignoreContentType(true)
      .requestBody(body)
      .header("Content-Type", "application/json")
      .timeout(3000)
      .post();
  } catch (e) {}
}

// ── markScheduleSent ─────────────────────────────────────────────
function markScheduleSent(scheduleId) {
  try {
    org.jsoup.Jsoup.connect(SERVER_URL + "/api/bot/schedules/" + scheduleId + "/sent")
      .ignoreContentType(true)
      .method(org.jsoup.Connection.Method.PATCH)
      .timeout(3000)
      .execute();
  } catch (e) {}
}

// ── 1분 주기 타이머 (자동 전송) ──────────────────────────────────
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
        var hh = now.getHours(), mm = now.getMinutes();
        var todayStr = now.getFullYear() + "-" + (now.getMonth() + 1) + "-" + now.getDate();

        var parts = schedule.sendTime.split(":");
        var targetHH = parseInt(parts[0], 10);
        var targetMM = parseInt(parts[1], 10);

        if (hh === targetHH && mm === targetMM && lastSentDate !== todayStr) {
          lastSentDate = todayStr;
          Log.d("자동전송 실행: " + schedule.sendTime);
          sendTodayParty(schedule.targetRoom);
          markScheduleSent(schedule.id);
        }
      } catch (e) {
        Log.d("스케줄 체크 오류: " + (e.message || e));
      }
    }
  }), 0, MINUTE_MS);
}
