// ========== 레이드 카테고리 설정 ==========
const RAID_CATEGORIES = [
  { category: '익스',     raids: ['익스트림'] },
  { category: '어비스',   raids: ['성당'] },
  { category: '그림자',   raids: ['세르카'] },
  { category: '카제로스', raids: ['종막', '4막', '3막', '2막'] },
  { category: '에픽',     raids: ['베히모스'] }
];

// ========== 상수 ==========
const CHAR_COL_COUNT  = 6;  // 길드원, 닉네임, 클래스, 아이템레벨, 전투력, 로벡
const RAID_COL_SPAN   = 1;  // 레이드당 컬럼 수
const HEADER_ROWS     = 3;  // 헤더 행 수
const DATA_START_ROW  = 4;  // 데이터 시작 행
const SCHED_MAX_COLS  = 100; // 레이드일정 시트 최대 열 수

// 레이드일정 시트 구조 상수
const ROW_DAY         = 4;
const ROW_TIME        = 5;
const ROW_SKILL       = 6;
const ROW_RAID        = 7;
const ROW_DIFFICULTY  = 8;
const NICK_START_ROW  = 9;
const ROWS_PER_SLOT   = 4;
const TOTAL_SLOTS     = 8;
const ROW_COMPLETE    = 49;

// 완료 색상
const COLOR_DONE_BG   = '#1a4a2a';
const COLOR_DONE_TEXT = '#2ecc71';
const GROUP_COLORS    = ['#333333', '#3d3d3d'];

// 레이드일정 시트에서 안전하게 읽을 실제 열 수 반환
function getSchedCols(sheet) {
  return Math.min(SCHED_MAX_COLS, sheet.getMaxColumns());
}

// 열 번호(1~) → 알파벳 변환 (1→A, 28→AB 등)
function colToLetter(col) {
  let letter = '';
  while (col > 0) {
    const mod = (col - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    col = Math.floor((col - 1) / 26);
  }
  return letter;
}

function getAllRaids() {
  return RAID_CATEGORIES.flatMap(c => c.raids);
}

function getRaidBaseCol(raidIndex) {
  return CHAR_COL_COUNT + 1 + raidIndex * RAID_COL_SPAN;
}


// ============================================================
// 레이드현황판 구조 생성
// ============================================================
function setupRaidBoard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const charSheet = ss.getSheetByName('캐릭터');

  // 기존 시트 재사용 (없으면 새로 생성)
  let boardSheet = ss.getSheetByName('레이드현황판');
  if (!boardSheet) {
    boardSheet = ss.insertSheet('레이드현황판');
  } else {
    boardSheet.clearContents();
    boardSheet.clearFormats();
    // 기존 병합 해제
    boardSheet.getRange(1, 1, boardSheet.getMaxRows(), boardSheet.getMaxColumns()).breakApart();
  }
  ss.setActiveSheet(boardSheet);
  ss.moveActiveSheet(1);

  const allRaids  = getAllRaids();
  const totalCols = CHAR_COL_COUNT + allRaids.length * RAID_COL_SPAN;

  // ── Row 1: 주차 헤더 ──
  boardSheet.getRange(1, 1, 1, totalCols).merge();
  boardSheet.getRange(1, 1).setValue('6월 1주차');

  // ── Row 2: 캐릭터 정보 + 카테고리 헤더 ──
  boardSheet.getRange(2, 1, 1, CHAR_COL_COUNT).merge();
  boardSheet.getRange(2, 1).setValue('캐릭터 정보');

  let catCol = CHAR_COL_COUNT + 1;
  RAID_CATEGORIES.forEach(cat => {
    const span = cat.raids.length * RAID_COL_SPAN;
    if (span > 1) boardSheet.getRange(2, catCol, 1, span).merge();
    boardSheet.getRange(2, catCol).setValue(cat.category);
    catCol += span;
  });

  // ── Row 3: 컬럼명 헤더 ──
  ['길드원', '닉네임', '클래스', '아이템레벨', '전투력', '로벡'].forEach((h, i) => {
    boardSheet.getRange(3, i + 1).setValue(h);
  });
  allRaids.forEach((raid, i) => {
    boardSheet.getRange(3, CHAR_COL_COUNT + i + 1).setValue(raid);
  });

  // ── Row 4~: 캐릭터 데이터 ──
  const charData = charSheet.getDataRange().getValues();
  charData.shift();

  let row = DATA_START_ROW;
  let currentGuild  = '';
  let guildStartRow = DATA_START_ROW;
  const groupRanges = [];

  charData.forEach(char => {
    const guild  = char[0];
    const nick   = char[1];
    const cls    = char[2];
    const itemLv = char[3];
    const power  = char[4];
    const robic  = char[5];

    if (!nick) return;

    if (guild && guild !== currentGuild) {
      if (currentGuild) {
        groupRanges.push({ start: guildStartRow, end: row - 1 });
        if (row - guildStartRow > 1) {
          boardSheet.getRange(guildStartRow, 1, row - guildStartRow, 1).mergeVertically();
        }
      }
      currentGuild  = guild;
      guildStartRow = row;
      boardSheet.getRange(row, 1).setValue(guild);
    }

    boardSheet.getRange(row, 2).setValue(nick);
    boardSheet.getRange(row, 3).setValue(cls);
    boardSheet.getRange(row, 4).setValue(itemLv);
    boardSheet.getRange(row, 5).setValue(power);
    boardSheet.getRange(row, 6).setValue(robic);
    row++;
  });

  // 마지막 그룹 처리
  if (currentGuild) {
    groupRanges.push({ start: guildStartRow, end: row - 1 });
    if (row - guildStartRow > 1) {
      boardSheet.getRange(guildStartRow, 1, row - guildStartRow, 1).mergeVertically();
    }
  }

  const lastDataRow = row - 1;

  applyBoardStyling(boardSheet, totalCols, lastDataRow, groupRanges);

  SpreadsheetApp.getUi().alert('✅ 레이드현황판 구조 생성 완료!');
}


// ============================================================
// 레이드현황판 스타일 적용
// ============================================================
function applyBoardStyling(boardSheet, totalCols, lastDataRow, groupRanges) {
  const allRaids = getAllRaids();

  const C = {
    black:    '#111111',
    darkGray: '#1e1e1e',
    midGray:  '#2d2d2d',
    rowDark:  '#333333',
    rowLight: '#3d3d3d',
    guildCol: '#1a1a1a',
    white:    '#ffffff',
    border:   '#555555',
    cat: {
      '익스':     '#4a235a',
      '어비스':   '#1a3a5c',
      '그림자':   '#1b4332',
      '카제로스': '#4a3000',
      '에픽':     '#4a1a1a',
    }
  };

  // Row 1: 주차 헤더
  boardSheet.setRowHeight(1, 38);
  boardSheet.getRange(1, 1, 1, totalCols)
    .setBackground(C.black)
    .setFontColor(C.white)
    .setFontSize(13)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  // Row 2: 카테고리
  boardSheet.setRowHeight(2, 26);
  boardSheet.getRange(2, 1, 1, totalCols)
    .setBackground(C.midGray)
    .setFontColor(C.white)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  // 카테고리별 색상
  let catCol = CHAR_COL_COUNT + 1;
  RAID_CATEGORIES.forEach(cat => {
    const span  = cat.raids.length * RAID_COL_SPAN;
    const color = C.cat[cat.category] || C.midGray;
    boardSheet.getRange(2, catCol, 1, span).setBackground(color);
    boardSheet.getRange(3, catCol, 1, span).setBackground(color);
    catCol += span;
  });

  // Row 3: 컬럼명
  boardSheet.setRowHeight(3, 26);
  boardSheet.getRange(3, 1, 1, CHAR_COL_COUNT)
    .setBackground(C.midGray)
    .setFontColor(C.white)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  boardSheet.getRange(3, CHAR_COL_COUNT + 1, 1, allRaids.length * RAID_COL_SPAN)
    .setFontColor(C.white)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  // 데이터 행
  if (lastDataRow >= DATA_START_ROW) {
    groupRanges.forEach((group, idx) => {
      const bg       = idx % 2 === 0 ? C.rowDark : C.rowLight;
      const rowCount = group.end - group.start + 1;

      boardSheet.getRange(group.start, 1, rowCount, 1)
        .setBackground(C.guildCol)
        .setFontColor(C.white)
        .setFontWeight('bold')
        .setHorizontalAlignment('center')
        .setVerticalAlignment('middle');

      boardSheet.getRange(group.start, 2, rowCount, CHAR_COL_COUNT - 1)
        .setBackground(bg)
        .setFontColor(C.white)
        .setHorizontalAlignment('center')
        .setVerticalAlignment('middle');

      boardSheet.getRange(group.start, CHAR_COL_COUNT + 1, rowCount, allRaids.length * RAID_COL_SPAN)
        .setBackground(bg)
        .setFontColor(C.white)
        .setHorizontalAlignment('center')
        .setVerticalAlignment('middle')
        .setWrap(true);
    });
  }

  // 열 너비
  boardSheet.setColumnWidth(1, 70);
  boardSheet.setColumnWidth(2, 130);
  boardSheet.setColumnWidth(3, 90);
  boardSheet.setColumnWidth(4, 80);
  boardSheet.setColumnWidth(5, 80);
  boardSheet.setColumnWidth(6, 80);
  for (let c = CHAR_COL_COUNT + 1; c <= totalCols; c++) {
    boardSheet.setColumnWidth(c, 75);
  }

  // 전체 기본 테두리
  boardSheet.getRange(1, 1, lastDataRow, totalCols)
    .setBorder(true, true, true, true, true, true,
      C.border, SpreadsheetApp.BorderStyle.SOLID);

  // 헤더 굵은 테두리
  boardSheet.getRange(1, 1, HEADER_ROWS, totalCols)
    .setBorder(true, true, true, true, null, null,
      '#888888', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  // 길드 그룹 간 구분 굵은 테두리 (그룹 시작행 위, 끝행 아래)
  groupRanges.forEach(group => {
    // 그룹 전체 행에 굵은 외곽 테두리
    boardSheet.getRange(group.start, 1, group.end - group.start + 1, totalCols)
      .setBorder(true, true, true, true, null, null,
        '#aaaaaa', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  });
}


// ============================================================
// 현황판 단일 열만 업데이트 (체크박스 전용 - 빠른 처리)
// ============================================================
function updateRaidColumn(ss, col) {
  const scheduleSheet = ss.getSheetByName('레이드일정');
  const boardSheet    = ss.getSheetByName('레이드현황판');
  const charSheet     = ss.getSheetByName('캐릭터');
  const allRaids      = getAllRaids();

  const schedData = scheduleSheet.getRange(1, col, ROW_COMPLETE, 1).getValues();
  const raidName  = schedData[ROW_RAID - 1][0];
  if (!raidName) return;

  const raidIndex = allRaids.indexOf(raidName);
  if (raidIndex === -1) return;
  const baseCol = getRaidBaseCol(raidIndex);

  const isComplete = schedData[ROW_COMPLETE - 1][0] === true;
  const day        = schedData[ROW_DAY  - 1][0] || '';
  const difficulty = schedData[ROW_DIFFICULTY - 1][0] || '';
  let   time       = schedData[ROW_TIME - 1][0] || '';
  if (time instanceof Date) {
    time = Utilities.formatDate(time, Session.getScriptTimeZone(), 'HH:mm');
  }

  // 닉네임 → 현황판 행 매핑
  const boardData = boardSheet.getDataRange().getValues();
  const nickRowMap = {};
  boardData.forEach((row, i) => {
    if (i >= HEADER_ROWS && row[1]) nickRowMap[row[1]] = i + 1;
  });

  // 캐릭터 그룹 색상 매핑
  const charData = charSheet.getDataRange().getValues();
  charData.shift();
  const nickColorMap = {};
  let groupIdx = -1, currentGuild = '';
  charData.forEach(char => {
    if (char[0] && char[0] !== currentGuild) { currentGuild = char[0]; groupIdx++; }
    if (char[1]) nickColorMap[char[1]] = GROUP_COLORS[groupIdx % 2];
  });

  for (let slot = 0; slot < TOTAL_SLOTS; slot++) {
    const nick = schedData[(NICK_START_ROW - 1) + slot * ROWS_PER_SLOT][0];
    if (!nick) continue;
    const boardRow = nickRowMap[nick];
    if (!boardRow) continue;

    const cell = boardSheet.getRange(boardRow, baseCol);
    if (isComplete) {
      cell.setValue('✓ 완료').setBackground(COLOR_DONE_BG).setFontColor(COLOR_DONE_TEXT).setFontWeight('bold');
    } else {
      const text = [difficulty, day, time].filter(v => v).join('\n');
      cell.setValue(text).setBackground(nickColorMap[nick] || GROUP_COLORS[0]).setFontColor('#ffffff').setFontWeight('normal');
    }
  }
}


// ============================================================
// 레이드일정 → 현황판 자동 반영
// ============================================================
function updateRaidBoard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const scheduleSheet = ss.getSheetByName('레이드일정');
  const boardSheet    = ss.getSheetByName('레이드현황판');
  const charSheet     = ss.getSheetByName('캐릭터');

  const schedData = scheduleSheet.getRange(1, 1, scheduleSheet.getLastRow() || ROW_COMPLETE, getSchedCols(scheduleSheet)).getValues();
  const boardData = boardSheet.getDataRange().getValues();
  const allRaids  = getAllRaids();

  // 닉네임 → {boardRow, groupColor} 매핑
  const nickInfoMap = {};
  const charData = charSheet.getDataRange().getValues();
  charData.shift();
  let groupIdx = -1;
  let currentGuild = '';
  charData.forEach(char => {
    const guild = char[0];
    const nick  = char[1];
    if (!nick) return;
    if (guild && guild !== currentGuild) {
      currentGuild = guild;
      groupIdx++;
    }
    nickInfoMap[nick] = { groupColor: GROUP_COLORS[groupIdx % 2] };
  });

  boardData.forEach((row, i) => {
    if (i < HEADER_ROWS) return;
    if (row[1] && nickInfoMap[row[1]]) {
      nickInfoMap[row[1]].boardRow = i + 1;
    }
  });

  // 레이드명 → 기준 열 번호 매핑
  const raidBaseColMap = {};
  allRaids.forEach((raid, i) => {
    raidBaseColMap[raid] = getRaidBaseCol(i);
  });

  // 현황판 레이드 셀 초기화
  const lastRow = boardSheet.getLastRow();
  const lastCol = boardSheet.getLastColumn();
  if (lastRow >= DATA_START_ROW && lastCol > CHAR_COL_COUNT) {
    const raidRange = boardSheet.getRange(
      DATA_START_ROW, CHAR_COL_COUNT + 1,
      lastRow - HEADER_ROWS, allRaids.length * RAID_COL_SPAN
    );
    raidRange.clearContent();
    raidRange.setBackground('#333333');
    raidRange.setFontColor('#ffffff');
    raidRange.setFontWeight('normal');
  }

  // 오늘 요일 계산
  const DAY_NAMES  = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  const todayDay   = DAY_NAMES[new Date().getDay()];
  const schedSheetId = scheduleSheet.getSheetId();

  const COLOR_RAID_DEFAULT = '#1a3a5c'; // 일반 레이드 배경색
  const COLOR_RAID_TODAY   = '#b8860b'; // 오늘 레이드 강조색

  // 레이드일정 열 순회
  const totalCols = schedData[0].length;

  for (let col = 0; col < totalCols; col++) {
    if (col + 1 < 8) continue;
    const raidName = schedData[ROW_RAID - 1][col];
    if (!raidName) continue;

    const day        = schedData[ROW_DAY      - 1][col] || '';
    const isComplete = schedData[ROW_COMPLETE - 1][col] === true;
    let   time       = schedData[ROW_TIME     - 1][col] || '';

    if (time instanceof Date) {
      time = Utilities.formatDate(time, Session.getScriptTimeZone(), 'HH:mm');
    }

    const baseCol = raidBaseColMap[raidName];
    if (!baseCol) continue;

    const isToday = !isComplete && day === todayDay;

    for (let slot = 0; slot < TOTAL_SLOTS; slot++) {
      const nickRowIdx = (NICK_START_ROW - 1) + (slot * ROWS_PER_SLOT);
      if (nickRowIdx >= schedData.length) break;

      const nick = schedData[nickRowIdx][col];
      if (!nick) continue;

      const info = nickInfoMap[nick];
      if (!info || !info.boardRow) continue;

      const cell = boardSheet.getRange(info.boardRow, baseCol);

      const colLetter = colToLetter(col + 1);
      const link      = '#gid=' + schedSheetId + '&range=' + colLetter + ROW_DAY + ':' + colLetter + ROW_COMPLETE;

      if (isComplete) {
        cell.setFormula('=HYPERLINK("' + link + '","✓ 완료")');
        cell.setBackground(COLOR_DONE_BG);
        cell.setFontColor(COLOR_DONE_TEXT);
        cell.setFontWeight('bold');
      } else {
        const text = day && time ? day + '(' + time + ')' : day || time || '';
        cell.setFormula('=HYPERLINK("' + link + '","' + text + '")');
        if (isToday) {
          cell.setBackground(COLOR_RAID_TODAY);
          cell.setFontWeight('bold');
        } else {
          cell.setBackground(COLOR_RAID_DEFAULT);
          cell.setFontWeight('normal');
        }
      }
    }
  }
}


// ============================================================
// onEdit 트리거
// ============================================================
function onEdit(e) {
  if (!e) return;
  if (e.source.getActiveSheet().getName() === '레이드일정') {
    updateRaidBoard();
  }
}


// ============================================================
// 레이드일정 H열 기준으로 전체 열 형식 동기화
// H열 4~8행의 드롭다운/형식을 I열 이후 모든 열에 복사
// ============================================================
function syncColumnFormat(silent) {
  const ss            = SpreadsheetApp.getActiveSpreadsheet();
  const scheduleSheet = ss.getSheetByName('레이드일정');
  const TEMPLATE_COL  = 8;  // H열
  const HEADER_START  = 4;  // 4행 (요일)
  const HEADER_END    = 8;  // 8행 (단계)
  const lastCol       = getSchedCols(scheduleSheet);

  if (lastCol <= TEMPLATE_COL) {
    SpreadsheetApp.getUi().alert('⚠️ H열 이후 열이 없습니다.');
    return;
  }

  // H열 4~8행을 템플릿으로 각 열에 복사
  for (let row = HEADER_START; row <= HEADER_END; row++) {
    const templateCell       = scheduleSheet.getRange(row, TEMPLATE_COL);
    const templateValidation = templateCell.getDataValidation();
    const templateFormat     = templateCell.getNumberFormat();
    const templateBg         = templateCell.getBackground();
    const templateFontColor  = templateCell.getFontColor();
    const templateAlign      = templateCell.getHorizontalAlignment();

    for (let col = TEMPLATE_COL + 1; col <= lastCol; col++) {
      const cell = scheduleSheet.getRange(row, col);
      if (templateValidation) cell.setDataValidation(templateValidation);
      else                     cell.setDataValidation(null);
      cell.setNumberFormat(templateFormat);
      cell.setBackground(templateBg);
      cell.setFontColor(templateFontColor);
      cell.setHorizontalAlignment(templateAlign);
    }
  }

  if (!silent) SpreadsheetApp.getUi().alert('✅ 열 형식 동기화 완료! (H열 기준 → ' + (lastCol - TEMPLATE_COL) + '개 열 적용)');
}


// ============================================================
// 레이드일정 F열 라벨 세팅
// 닉네임 / 클래스 / 아이템레벨 / 전투력 반복 고정
// ============================================================
function setupScheduleLabels(silent) {
  const ss            = SpreadsheetApp.getActiveSpreadsheet();
  const scheduleSheet = ss.getSheetByName('레이드일정');
  const LABEL_COL     = 6; // F열
  const rowLabels     = ['닉네임', '클래스', '아이템레벨', '전투력'];
  const lastRow       = scheduleSheet.getLastRow();

  // F열 전체 유효성 검사 제거 (드롭다운 완전 차단)
  if (lastRow > 0) {
    scheduleSheet.getRange(1, LABEL_COL, lastRow, 1).setDataValidation(null);
  }

  // F열 라벨 작성
  for (let slot = 0; slot < TOTAL_SLOTS; slot++) {
    const startRow = NICK_START_ROW + slot * ROWS_PER_SLOT;
    rowLabels.forEach((label, i) => {
      scheduleSheet.getRange(startRow + i, LABEL_COL).setValue(label);
    });
  }

  if (!silent) SpreadsheetApp.getUi().alert('✅ 레이드일정 라벨 세팅 완료!');
}


// ============================================================
// 완료 체크박스 삽입
// ============================================================
function insertCompletionCheckboxes(silent) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const scheduleSheet = ss.getSheetByName('레이드일정');
  const schedCols = getSchedCols(scheduleSheet);
  const schedData = scheduleSheet.getRange(1, 1, ROW_COMPLETE, schedCols).getValues();

  for (let col = 0; col < schedCols; col++) {
    if (col + 1 < 8) continue;
    if (!schedData[ROW_RAID - 1][col]) continue;
    scheduleSheet.getRange(ROW_COMPLETE, col + 1).insertCheckboxes();
  }
  if (!silent) SpreadsheetApp.getUi().alert('✅ 완료 체크박스 삽입 완료!');
}


// ============================================================
// 주차 리셋
// ============================================================
function resetWeek() {
  const ui = SpreadsheetApp.getUi();
  const answer = ui.alert(
    '⚠️ 주차 리셋',
    '레이드일정과 현황판의 일정을 모두 초기화합니다.\n계속하시겠습니까?',
    ui.ButtonSet.YES_NO
  );
  if (answer !== ui.Button.YES) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const allRaids = getAllRaids();

  // 현황판 레이드 셀 초기화
  const boardSheet = ss.getSheetByName('레이드현황판');
  const lastRow = boardSheet.getLastRow();
  if (lastRow >= DATA_START_ROW) {
    boardSheet.getRange(
      DATA_START_ROW, CHAR_COL_COUNT + 1,
      lastRow - HEADER_ROWS, allRaids.length * RAID_COL_SPAN
    ).clearContent();
  }

  // 레이드일정 H열 이후 초기화 (클래스/아이템레벨/전투력 제외)
  const scheduleSheet = ss.getSheetByName('레이드일정');
  const lastCol       = scheduleSheet.getLastColumn();
  if (lastCol >= 8) {
    const colCount = lastCol - 7;

    // 헤더 행 (요일/시간/숙련도/레이드/단계)
    scheduleSheet.getRange(ROW_DAY,        8, 1, colCount).clearContent();
    scheduleSheet.getRange(ROW_TIME,       8, 1, colCount).clearContent();
    scheduleSheet.getRange(ROW_SKILL,      8, 1, colCount).clearContent();
    scheduleSheet.getRange(ROW_RAID,       8, 1, colCount).clearContent();
    scheduleSheet.getRange(ROW_DIFFICULTY, 8, 1, colCount).clearContent();

    // 닉네임 행만 (클래스/아이템레벨/전투력은 유지)
    for (let slot = 0; slot < TOTAL_SLOTS; slot++) {
      const nickRow = NICK_START_ROW + slot * ROWS_PER_SLOT;
      scheduleSheet.getRange(nickRow, 8, 1, colCount).clearContent();
    }

    // 완료 체크박스 리셋
    scheduleSheet.getRange(ROW_COMPLETE, 8, 1, colCount).setValue(false);
  }

  ui.alert('✅ 주차 리셋 완료!');
}



// ============================================================
// 로펙 크롤링 - 달성 최고 점수만
// ============================================================
function lopec(characterName) {
  if (!characterName) return '';

  var url = 'https://m.lopec.kr/character/specPoint/' + encodeURIComponent(characterName);

  var response = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    followRedirects: true,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });

  var html = response.getContentText('UTF-8').replace(/\n|\r/g, ' ');
  var match = html.match(/달성 최고 점수<\/span>\s*<span[^>]*>([\d.]+)<\/span>/);

  return match ? match[1].trim() : '';
}


// ============================================================
// 캐릭터 정보 통합 조회
// - 직업, 레벨, 전투력: 로스트아크 공식 사이트 (Cheerio)
// - 달성 최고 점수: 로펙 크롤링
// return: { job, level, combatPower, specPoint }
// ============================================================
function getRaidCharacterInfo(nickname) {
  if (!nickname) return null;

  var url = 'https://lostark.game.onstove.com/Profile/Character/' + encodeURIComponent(nickname);
  var response = UrlFetchApp.fetch(url, { method: 'GET', muteHttpExceptions: true, 'Content-Type': 'text/html' });
  var html = response.getContentText('UTF-8');
  var $ = Cheerio.load(html);

  var job   = $('#lostark-wrapper > div > main > div > div.profile-character-infoWrap > div.profile-character-info > span.profile-character-info__img > img').attr('alt') || '';
  var level = $('#lostark-wrapper > div > main > div > div.profile-ingame > div.profile-info > div.level-info2 > div.level-info2__expedition > span:nth-child(2)').text();
  var power = $('#lostark-wrapper > div > main > div > div.profile-ingame > div.profile-info > div.level-info2 > div.level-info2__item > span:nth-child(2)').text();

  // 레벨 숫자만 추출
  level = level.replace(/[^0-9]/g, '');
  level = level.substring(0, level.length - 2);

  return {
    job:        job,
    level:      level,
    combatPower: power,
    specPoint:  lopec(nickname)
  };
}


// ============================================================
// 캐릭터 시트 전체 정보 갱신
// 컬럼: A=길드원, B=닉네임, C=직업, D=레벨, E=전투력, F=달성 최고 점수(로벡)
// ============================================================
function updateLopecStats() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('캐릭터');
  const data  = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const nick = data[i][1]; // B열: 닉네임
    if (!nick) continue;

    Utilities.sleep(300); // 요청 간격

    const info = getRaidCharacterInfo(nick);
    if (!info) continue;

    if (info.job)         sheet.getRange(i + 1, 3).setValue(info.job);         // C열: 직업
    if (info.level)       sheet.getRange(i + 1, 4).setValue(info.level);       // D열: 레벨
    if (info.combatPower) sheet.getRange(i + 1, 5).setValue(info.combatPower); // E열: 전투력
    if (info.specPoint)   sheet.getRange(i + 1, 6).setValue(info.specPoint);   // F열: 달성 최고 점수
  }

  // 마지막 갱신 시간 기록 (H1셀)
  sheet.getRange(1, 8).setValue(
    '마지막 갱신: ' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'MM/dd HH:mm:ss')
  );
}


// ============================================================
// 레이드일정 요일 드롭다운 설정 (ROW_DAY 행, H열 이후)
// ============================================================
function setupDayValidation(silent) {
  const ss            = SpreadsheetApp.getActiveSpreadsheet();
  const scheduleSheet = ss.getSheetByName('레이드일정');
  const days          = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];

  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(days, false)
    .setAllowInvalid(false)
    .build();

  const schedCols = getSchedCols(scheduleSheet);
  const schedData = scheduleSheet.getRange(1, 1, ROW_RAID, schedCols).getValues();

  for (let col = 0; col < schedCols; col++) {
    if (col + 1 < 8) continue; // H열 이전 스킵
    if (!schedData[ROW_RAID - 1][col]) continue;
    scheduleSheet.getRange(ROW_DAY, col + 1).setDataValidation(rule);
  }

  if (!silent) SpreadsheetApp.getUi().alert('✅ 요일 드롭다운 설정 완료!');
}


// ============================================================
// 레이드일정 닉네임 셀 드롭다운 유효성 검사 설정
// 캐릭터 시트 B열의 닉네임만 입력 가능하도록 제한
// ============================================================
function setupNicknameValidation(silent) {
  const ss            = SpreadsheetApp.getActiveSpreadsheet();
  const scheduleSheet = ss.getSheetByName('레이드일정');
  const charSheet     = ss.getSheetByName('캐릭터');

  // 캐릭터 시트에서 닉네임 목록 수집 (B열, 헤더 제외)
  const charData  = charSheet.getDataRange().getValues();
  const nicknames = charData.slice(1).map(row => row[1]).filter(nick => nick !== '');

  if (nicknames.length === 0) {
    if (!silent) SpreadsheetApp.getUi().alert('⚠️ 캐릭터 시트에 닉네임이 없습니다.');
    return;
  }

  // 드롭다운 유효성 검사 규칙 생성
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(nicknames, false)
    .setAllowInvalid(false)
    .build();

  // 레이드일정 열 순회 - 레이드명이 있는 컬럼의 닉네임 행에만 적용
  const schedCols = getSchedCols(scheduleSheet);
  const schedData = scheduleSheet.getRange(1, 1, ROW_RAID, schedCols).getValues();

  for (let col = 0; col < schedCols; col++) {
    if (col + 1 < 8) continue; // H열 이전 스킵
    if (!schedData[ROW_RAID - 1][col]) continue;

    for (let slot = 0; slot < TOTAL_SLOTS; slot++) {
      const nickRow = NICK_START_ROW + slot * ROWS_PER_SLOT;
      scheduleSheet.getRange(nickRow, col + 1).setDataValidation(rule);
    }
  }

  if (!silent) SpreadsheetApp.getUi().alert('✅ 닉네임 드롭다운 설정 완료! (' + nicknames.length + '명)');
}


// ============================================================
// 자동 갱신 트리거 (5분마다)
// ============================================================
function createAutoUpdateTrigger() {
  deleteAutoUpdateTrigger(); // 중복 방지

  ScriptApp.newTrigger('updateLopecStats')
    .timeBased()
    .everyMinutes(5)
    .create();

  SpreadsheetApp.getUi().alert('✅ 5분마다 자동 갱신이 설정되었습니다.');
}

function deleteAutoUpdateTrigger() {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === 'updateLopecStats') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  SpreadsheetApp.getUi().alert('⏹️ 자동 갱신이 중지되었습니다.');
}


// ============================================================
// 상단 메뉴
// ============================================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🗡️ 길드 레이드')
    .addItem('현황판 구조 생성 / 재생성', 'setupRaidBoard')
    .addItem('현황판 수동 갱신', 'updateRaidBoard')
    .addSeparator()
    .addItem('🔄 주차 리셋', 'resetWeek')
    .addSeparator()
    .addItem('📡 로펙 정보 수동 갱신', 'updateLopecStats')
    .addItem('⏱️ 자동 갱신 시작 (5분)', 'createAutoUpdateTrigger')
    .addItem('⏹️ 자동 갱신 중지', 'deleteAutoUpdateTrigger')
    .addToUi();
}
