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

  // 기존 시트 삭제 후 새로 생성
  const existingBoard = ss.getSheetByName('레이드현황판');
  if (existingBoard) ss.deleteSheet(existingBoard);
  const boardSheet = ss.insertSheet('레이드현황판');

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

  // 테두리
  boardSheet.getRange(1, 1, lastDataRow, totalCols)
    .setBorder(true, true, true, true, true, true,
      C.border, SpreadsheetApp.BorderStyle.SOLID);
  boardSheet.getRange(1, 1, HEADER_ROWS, totalCols)
    .setBorder(true, true, true, true, null, null,
      '#888888', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
}


// ============================================================
// 레이드일정 → 현황판 자동 반영
// ============================================================
function updateRaidBoard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const scheduleSheet = ss.getSheetByName('레이드일정');
  const boardSheet    = ss.getSheetByName('레이드현황판');
  const charSheet     = ss.getSheetByName('캐릭터');

  const schedData = scheduleSheet.getDataRange().getValues();
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

  // 레이드일정 열 순회
  const totalCols = schedData[0].length;

  for (let col = 0; col < totalCols; col++) {
    const raidName = schedData[ROW_RAID - 1][col];
    if (!raidName) continue;

    const day        = schedData[ROW_DAY        - 1][col] || '';
    const difficulty = schedData[ROW_DIFFICULTY - 1][col] || '';
    const isComplete = schedData[ROW_COMPLETE   - 1][col] === true;
    let   time       = schedData[ROW_TIME       - 1][col] || '';

    if (time instanceof Date) {
      time = Utilities.formatDate(time, Session.getScriptTimeZone(), 'HH:mm');
    }

    const baseCol = raidBaseColMap[raidName];
    if (!baseCol) continue;

    for (let slot = 0; slot < TOTAL_SLOTS; slot++) {
      const nickRowIdx = (NICK_START_ROW - 1) + (slot * ROWS_PER_SLOT);
      if (nickRowIdx >= schedData.length) break;

      const nick = schedData[nickRowIdx][col];
      if (!nick) continue;

      const info = nickInfoMap[nick];
      if (!info || !info.boardRow) continue;

      const cell = boardSheet.getRange(info.boardRow, baseCol);

      if (isComplete) {
        cell.setValue('✓ 완료');
        cell.setBackground(COLOR_DONE_BG);
        cell.setFontColor(COLOR_DONE_TEXT);
        cell.setFontWeight('bold');
      } else {
        const text = [difficulty, day, time].filter(v => v).join('\n');
        cell.setValue(text);
        cell.setBackground(info.groupColor);
        cell.setFontColor('#ffffff');
        cell.setFontWeight('normal');
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
// 완료 체크박스 삽입
// ============================================================
function insertCompletionCheckboxes() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const scheduleSheet = ss.getSheetByName('레이드일정');
  const schedData = scheduleSheet.getDataRange().getValues();
  const totalCols = schedData[0].length;

  for (let col = 0; col < totalCols; col++) {
    if (!schedData[ROW_RAID - 1][col]) continue;
    scheduleSheet.getRange(ROW_COMPLETE, col + 1).insertCheckboxes();
  }
  SpreadsheetApp.getUi().alert('✅ 완료 체크박스 삽입 완료!');
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

  // 레이드일정 초기화
  const scheduleSheet = ss.getSheetByName('레이드일정');
  const schedData = scheduleSheet.getDataRange().getValues();
  for (let col = 0; col < schedData[0].length; col++) {
    if (!schedData[ROW_RAID - 1][col]) continue;
    for (let slot = 0; slot < TOTAL_SLOTS; slot++) {
      const nickRowIdx = (NICK_START_ROW - 1) + (slot * ROWS_PER_SLOT);
      if (nickRowIdx >= schedData.length) break;
      scheduleSheet.getRange(nickRowIdx + 1, col + 1, ROWS_PER_SLOT, 1).clearContent();
    }
    scheduleSheet.getRange(ROW_COMPLETE, col + 1).setValue(false);
  }

  ui.alert('✅ 주차 리셋 완료!');
}


// ============================================================
// 주차 헤더 변경
// ============================================================
function updateWeekTitle() {
  const ui = SpreadsheetApp.getUi();
  const result = ui.prompt(
    '주차 변경',
    '주차명을 입력하세요 (예: 6월 2주차)',
    ui.ButtonSet.OK_CANCEL
  );
  if (result.getSelectedButton() !== ui.Button.OK) return;
  SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName('레이드현황판')
    .getRange(1, 1)
    .setValue(result.getResponseText());
}


// ============================================================
// 상단 메뉴
// ============================================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🗡️ 길드 레이드')
    .addItem('현황판 구조 생성 / 재생성', 'setupRaidBoard')
    .addItem('현황판 수동 갱신', 'updateRaidBoard')
    .addItem('주차 변경', 'updateWeekTitle')
    .addItem('✅ 완료 체크박스 삽입', 'insertCompletionCheckboxes')
    .addSeparator()
    .addItem('🔄 주차 리셋', 'resetWeek')
    .addToUi();
}
