// ========== 로스트아크 Open API 설정 ==========
// API 키는 PropertiesService에 저장 (최초 1회 saveApiKey() 실행 필요)
// 메뉴 → [🗝️ API 키 설정]으로 저장

// ========== 레이드 카테고리 설정 ==========
const RAID_CATEGORIES = [
  { category: '익스',     raids: ['익스트림'] },
  { category: '어비스',   raids: ['성당'] },
  { category: '그림자',   raids: ['세르카'] },
  { category: '카제로스', raids: ['종막', '4막', '3막', '2막'] },
  { category: '에픽',     raids: ['베히모스'] }
];

// ========== 상수 ==========
const CHAR_COL_COUNT  = 7;  // 길드원, 닉네임, 클래스, 아크패시브, 아이템레벨, 전투력, 로펙
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
const COLOR_DEFAULT_TEXT   = '#ffffff';
const COLOR_DONE_BG   = '#1a4a2a';
const COLOR_DONE_TEXT = '#2ecc71';

// 캐릭터 시트 컬럼 (1-based)
const CHAR_GUILD_COL = 1;   // A열: 길드원
const CHAR_NICK_COL  = 2;   // B열: 닉네임
const CHAR_CLS_COL   = 3;   // C열: 클래스
const CHAR_ARC_COL   = 4;   // D열: 아크패시브
const CHAR_LV_COL    = 5;   // E열: 아이템레벨
const CHAR_POW_COL   = 6;   // F열: 전투력
const CHAR_ROB_COL   = 7;   // G열: 로펙

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
  const savedDark = [];
  if (!boardSheet) {
    boardSheet = ss.insertSheet('레이드현황판');
  } else {
    // #333333 채우기 셀 위치 저장 (스타일 재적용 후 맨 끝에서 복원)
    const maxRow = boardSheet.getLastRow();
    const maxCol = boardSheet.getLastColumn();
    if (maxRow > 0 && maxCol > 0) {
      const bgs = boardSheet.getRange(1, 1, maxRow, maxCol).getBackgrounds();
      bgs.forEach((rowArr, r) => rowArr.forEach((bg, c) => {
        if (bg.toLowerCase() === '#333333') savedDark.push([r + 1, c + 1]);
      }));
    }
    boardSheet.clearContents();
    boardSheet.clearFormats();
    boardSheet.getRange(1, 1, boardSheet.getMaxRows(), boardSheet.getMaxColumns()).breakApart();
  }
  ss.setActiveSheet(boardSheet);
  ss.moveActiveSheet(1);

  const allRaids  = getAllRaids();
  const totalCols = CHAR_COL_COUNT + allRaids.length * RAID_COL_SPAN;

  // ── Row 1: 주차 헤더 ──
  boardSheet.getRange(1, 1, 1, totalCols).merge();
  boardSheet.getRange(1, 1).setFormula('=MONTH(today())&"월 "&(WEEKNUM(today())-WEEKNUM(today()-DAY(today())+1)+1)&"주차"');

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
  ['길드원', '닉네임', '클래스', '아크패시브', '아이템레벨', '전투력', '로펙'].forEach((h, i) => {
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
    const guild  = char[CHAR_GUILD_COL - 1];
    const nick   = char[CHAR_NICK_COL  - 1];

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

    const nickCol = colToLetter(CHAR_NICK_COL);
    const clsCol  = colToLetter(CHAR_CLS_COL);
    const arcCol  = colToLetter(CHAR_ARC_COL);
    const lvCol   = colToLetter(CHAR_LV_COL);
    const powCol  = colToLetter(CHAR_POW_COL);
    const robCol  = colToLetter(CHAR_ROB_COL);

    boardSheet.getRange(row, 2).setValue(nick);
    boardSheet.getRange(row, 3).setFormula(`=IFERROR(INDEX('캐릭터'!$${clsCol}:$${clsCol},  MATCH(B${row}, '캐릭터'!$${nickCol}:$${nickCol}, 0)), "")`);
    boardSheet.getRange(row, 4).setFormula(`=IFERROR(INDEX('캐릭터'!$${arcCol}:$${arcCol},  MATCH(B${row}, '캐릭터'!$${nickCol}:$${nickCol}, 0)), "")`);
    boardSheet.getRange(row, 5).setFormula(`=IFERROR(INDEX('캐릭터'!$${lvCol}:$${lvCol},   MATCH(B${row}, '캐릭터'!$${nickCol}:$${nickCol}, 0)), "")`);
    boardSheet.getRange(row, 6).setFormula(`=IFERROR(INDEX('캐릭터'!$${powCol}:$${powCol}, MATCH(B${row}, '캐릭터'!$${nickCol}:$${nickCol}, 0)), "")`);
    boardSheet.getRange(row, 7).setFormula(`=IFERROR(INDEX('캐릭터'!$${robCol}:$${robCol}, MATCH(B${row}, '캐릭터'!$${nickCol}:$${nickCol}, 0)), "")`);
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

  // ── 스타일 적용 ──
  const allRaidsForStyle = getAllRaids();
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
  let catStyleCol = CHAR_COL_COUNT + 1;
  RAID_CATEGORIES.forEach(cat => {
    const span  = cat.raids.length * RAID_COL_SPAN;
    const color = C.cat[cat.category] || C.midGray;
    boardSheet.getRange(2, catStyleCol, 1, span).setBackground(color);
    boardSheet.getRange(3, catStyleCol, 1, span).setBackground(color);
    catStyleCol += span;
  });

  // Row 3: 컬럼명
  boardSheet.setRowHeight(3, 26);
  boardSheet.getRange(3, 1, 1, CHAR_COL_COUNT)
    .setBackground(C.midGray)
    .setFontColor(C.white)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  boardSheet.getRange(3, CHAR_COL_COUNT + 1, 1, allRaidsForStyle.length * RAID_COL_SPAN)
    .setFontColor(C.white)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  // 데이터 행
  if (lastDataRow >= DATA_START_ROW) {
    const styleRowCount = lastDataRow - DATA_START_ROW + 1;

    boardSheet.getRange(DATA_START_ROW, 1, styleRowCount, CHAR_COL_COUNT)
      .setBackground(C.rowDark)
      .setFontColor(C.white)
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle');

    groupRanges.forEach(group => {
      boardSheet.getRange(group.start, 1, group.end - group.start + 1, 1)
        .setFontWeight('bold');
    });

    boardSheet.getRange(DATA_START_ROW, CHAR_COL_COUNT + 1, styleRowCount, allRaidsForStyle.length * RAID_COL_SPAN)
      .setBackground(C.white)
      .setFontColor(C.white)
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle')
      .setWrap(true);
  }

  // 열 너비
  boardSheet.setColumnWidth(1, 70);
  boardSheet.setColumnWidth(2, 130);
  boardSheet.setColumnWidth(3, 90);
  boardSheet.setColumnWidth(4, 90);
  boardSheet.setColumnWidth(5, 80);
  boardSheet.setColumnWidth(6, 80);
  boardSheet.setColumnWidth(7, 80);
  for (let c = CHAR_COL_COUNT + 1; c <= totalCols; c++) {
    boardSheet.setColumnWidth(c, 112);
  }
  boardSheet.setColumnWidth(16, 112); // P열
  boardSheet.setColumnWidth(17, 112); // Q열

  // D열(아크패시브) 숨김
  boardSheet.hideColumns(CHAR_ARC_COL);

  // 전체 기본 테두리
  boardSheet.getRange(1, 1, lastDataRow, totalCols)
    .setBorder(true, true, true, true, true, true,
      C.border, SpreadsheetApp.BorderStyle.SOLID);

  // 헤더 굵은 테두리
  boardSheet.getRange(1, 1, HEADER_ROWS, totalCols)
    .setBorder(true, true, true, true, null, null,
      '#888888', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  // 길드 그룹 간 구분선
  groupRanges.forEach(group => {
    const grpCount = group.end - group.start + 1;
    boardSheet.getRange(group.start, 1, grpCount, totalCols)
      .setBorder(true, null, true, null, null, null,
        '#aaaaaa', SpreadsheetApp.BorderStyle.SOLID_THICK);
  });

  // 3행~4행 사이 테두리 제거
  boardSheet.getRange(HEADER_ROWS, 1, 1, totalCols)
    .setBorder(null, null, false, null, null, null);
  boardSheet.getRange(DATA_START_ROW, 1, 1, totalCols)
    .setBorder(false, null, null, null, null, null);

  applyRaidCellValidation(boardSheet, lastDataRow);
  boardSheet.setFrozenRows(HEADER_ROWS);

  // ── 범례 생성 ──
  const COL_S = 17; // P열
  const COL_D = 18; // Q열
  const LEG_START = 4;

  const legends = [
    { symbol: '✓',  bg: '#1a4a2a', text: '#2ecc71', desc: '완료' },
    { symbol: '✗',  bg: '#4a1a1a', text: '#e74c3c', desc: '미진행/유기' },
    { symbol: '►',  bg: '#1a2a4a', text: '#3498db', desc: '진행중' },
    { symbol: '❚❚', bg: '#2a1a4a', text: '#9b59b6', desc: '일정 대기중' },
    { symbol: '★',  bg: '#4a3800', text: '#f1c40f', desc: '오늘 할 예정' },
  ];

  boardSheet.getRange(LEG_START, COL_S, 2 + legends.length, 2).setDataValidation(null);
  boardSheet.getRange(3, COL_S, 1, 2).setBorder(null, null, false, null, null, null);
  boardSheet.getRange(LEG_START, COL_S, 1, 2).setBorder(false, null, null, null, null, null);

  boardSheet.getRange(LEG_START, COL_S, 1, 2).merge()
    .setValue('더블 클릭하여 상태 변경 하시면 됩니다.')
    .setBackground(null)
    .setFontColor('#333333')
    .setFontWeight('bold')
    .setFontSize(9)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setBorder(null, true, true, true, null, null, '#aaaaaa', SpreadsheetApp.BorderStyle.SOLID);

  boardSheet.getRange(LEG_START + 1, COL_S)
    .setValue('상태')
    .setBackground('#dddddd')
    .setFontColor('#333333')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setBorder(true, true, true, true, null, null, '#aaaaaa', SpreadsheetApp.BorderStyle.SOLID);
  boardSheet.getRange(LEG_START + 1, COL_D)
    .setValue('설명')
    .setBackground('#dddddd')
    .setFontColor('#333333')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setBorder(true, true, true, true, null, null, '#aaaaaa', SpreadsheetApp.BorderStyle.SOLID);

  legends.forEach((legend, i) => {
    const legRow = LEG_START + 2 + i;
    boardSheet.getRange(legRow, COL_S)
      .setValue(legend.symbol)
      .setBackground(legend.bg)
      .setFontColor(legend.text)
      .setFontWeight('bold')
      .setFontSize(11)
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle')
      .setBorder(true, true, true, true, null, null, '#aaaaaa', SpreadsheetApp.BorderStyle.SOLID);
    boardSheet.getRange(legRow, COL_D)
      .setValue(legend.desc)
      .setBackground('#ffffff')
      .setFontColor('#333333')
      .setHorizontalAlignment('left')
      .setVerticalAlignment('middle')
      .setBorder(true, true, true, true, null, null, '#aaaaaa', SpreadsheetApp.BorderStyle.SOLID);
  });

  boardSheet.setColumnWidth(COL_S, 112);
  boardSheet.setColumnWidth(COL_D, 112);
  boardSheet.setColumnWidth(16, 45);

  // 모든 스타일 적용 후 #333333 셀 복원
  savedDark.forEach(([r, c]) => boardSheet.getRange(r, c).setBackground('#333333'));
}


// ============================================================
// 레이드일정 → 현황판 갱신
// 수동 입력값(✓ ✗ ► ❚❚ ★) 유지, 일정 데이터만 덮어씀
// ============================================================
function updateRaidBoard() {
  const ss            = SpreadsheetApp.getActiveSpreadsheet();
  const scheduleSheet = ss.getSheetByName('레이드일정');
  const boardSheet    = ss.getSheetByName('레이드현황판');
  const allRaids      = getAllRaids();

  const schedData = scheduleSheet.getRange(1, 1, scheduleSheet.getLastRow() || ROW_COMPLETE, getSchedCols(scheduleSheet)).getValues();

  // 현황판 닉네임 → 행 번호 맵
  const nickRowMap = {};
  boardSheet.getDataRange().getValues().forEach((row, i) => {
    if (i >= HEADER_ROWS && row[1]) nickRowMap[row[1]] = i + 1;
  });

  // 레이드명 → 기준 열 번호 맵
  const raidBaseColMap = {};
  allRaids.forEach((raid, i) => { raidBaseColMap[raid] = getRaidBaseCol(i); });

  // HYPERLINK 수식 셀 초기화 (수동 입력값 유지)
  const lastRow = boardSheet.getLastRow();
  if (lastRow >= DATA_START_ROW) {
    const raidRange = boardSheet.getRange(DATA_START_ROW, CHAR_COL_COUNT + 1, lastRow - HEADER_ROWS, allRaids.length * RAID_COL_SPAN);
    const formulas  = raidRange.getFormulas();
    const outValues = raidRange.getValues();
    const outBgs    = raidRange.getBackgrounds();

    for (let r = 0; r < formulas.length; r++) {
      for (let c = 0; c < formulas[r].length; c++) {
        if (formulas[r][c].toUpperCase().startsWith('=HYPERLINK')) {
          outValues[r][c] = '';
          outBgs[r][c]    = '#ffffff';
        }
      }
    }
    raidRange.setValues(outValues);
    raidRange.setBackgrounds(outBgs);

    // 드롭다운 validation 복구
    raidRange.setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(['✓', '✗', '►', '❚❚', '★'], false)
        .setAllowInvalid(true)
        .build()
    );
  }

  const DAY_NAMES    = ['일요일','월요일','화요일','수요일','목요일','금요일','토요일'];
  const todayDay     = DAY_NAMES[new Date().getDay()];
  const schedSheetId = scheduleSheet.getSheetId();
  const COLOR_RAID_DEFAULT = '#1a3a5c';
  const COLOR_RAID_TODAY   = '#b8860b';
  const totalCols    = schedData[0].length;

  for (let col = 0; col < totalCols; col++) {
    if (col + 1 < 7) continue;
    const raidCell = schedData[ROW_RAID - 1][col];
    if (!raidCell) continue;

    const raidNames  = String(raidCell).split(',').map(r => r.trim()).filter(r => r);
    const day        = schedData[ROW_DAY      - 1][col] || '';
    const isComplete = schedData[ROW_COMPLETE - 1][col] === true;
    let   time       = schedData[ROW_TIME     - 1][col] || '';
    if (time instanceof Date) time = Utilities.formatDate(time, Session.getScriptTimeZone(), 'HH:mm');
    const isToday    = !isComplete && day === todayDay;

    const colLetter = colToLetter(col + 1);
    const link      = '#gid=' + schedSheetId + '&range=' + colLetter + ROW_DAY + ':' + colLetter + ROW_COMPLETE;

    for (const raidName of raidNames) {
      const baseCol = raidBaseColMap[raidName];
      if (!baseCol) continue;

      for (let slot = 0; slot < TOTAL_SLOTS; slot++) {
        const nickRowIdx = (NICK_START_ROW - 1) + slot * ROWS_PER_SLOT;
        if (nickRowIdx >= schedData.length) break;

        const nick     = schedData[nickRowIdx][col];
        const boardRow = nick ? nickRowMap[nick] : null;
        if (!boardRow) continue;

        const cell = boardSheet.getRange(boardRow, baseCol);
        cell.setDataValidation(null);

        if (isComplete) {
          cell.setFormula('=HYPERLINK("' + link + '","✓ 완료")');
          cell.setBackground(COLOR_DONE_BG);
          cell.setFontColor(COLOR_DONE_TEXT);
          cell.setFontWeight('bold');
        } else {
          const text = day && time ? day + '(' + time + ')' : day || time || '';
          cell.setFormula('=HYPERLINK("' + link + '","' + text + '")');
          cell.setBackground(isToday ? COLOR_RAID_TODAY : COLOR_RAID_DEFAULT);
          cell.setFontColor(COLOR_DEFAULT_TEXT);
          cell.setFontWeight(isToday ? 'bold' : 'normal');
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
  if (e.source.getActiveSheet().getName() !== '레이드일정') return;
  updateRaidBoard();
}

// ============================================================
// 주차 리셋 (수동 버튼 + 트리거 공용)
// ============================================================
function resetWeek() {
  const ss       = SpreadsheetApp.getActiveSpreadsheet();
  const allRaids = getAllRaids();

  // 현황판 레이드 셀 초기화
  const boardSheet = ss.getSheetByName('레이드현황판');
  const lastRow    = boardSheet.getLastRow();
  if (lastRow >= DATA_START_ROW) {
    const raidRange = boardSheet.getRange(DATA_START_ROW, CHAR_COL_COUNT + 1, lastRow - HEADER_ROWS, allRaids.length * RAID_COL_SPAN);

    // 초기화 전 배경색 저장 (칠해둔 셀 보존용)
    const savedBgs = raidRange.getBackgrounds();

    raidRange.clearContent();
    raidRange.setBackground('#ffffff');
    raidRange.setFontColor('#ffffff');
    raidRange.setFontWeight('normal');
    raidRange.setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(['✓', '✗', '►', '❚❚', '★'], false)
        .setAllowInvalid(true)
        .build()
    );
    applyRaidCellValidation(boardSheet, lastRow);

    // #333333 셀만 배경색 복원
    raidRange.setBackgrounds(savedBgs.map(row => row.map(bg => bg === '#333333' ? '#333333' : '#ffffff')));
  }

  // 레이드일정 H열 이후 초기화
  const scheduleSheet = ss.getSheetByName('레이드일정');
  const lastCol       = scheduleSheet.getLastColumn();
  if (lastCol >= 7) {
    const colCount = lastCol - 6;
    scheduleSheet.getRange(ROW_DAY,        7, 1, colCount).clearContent();
    scheduleSheet.getRange(ROW_TIME,       7, 1, colCount).clearContent();
    scheduleSheet.getRange(ROW_SKILL,      7, 1, colCount).clearContent();
    scheduleSheet.getRange(ROW_RAID,       7, 1, colCount).clearContent();
    scheduleSheet.getRange(ROW_DIFFICULTY, 7, 1, colCount).clearContent();

    for (let slot = 0; slot < TOTAL_SLOTS; slot++) {
      scheduleSheet.getRange(NICK_START_ROW + slot * ROWS_PER_SLOT, 7, 1, colCount).clearContent();
    }
    scheduleSheet.getRange(ROW_COMPLETE, 7, 1, colCount).setValue(false);
  }
}


// ============================================================
// 레이드 셀 드롭다운 + 조건부 서식 적용
// ============================================================
function applyRaidCellValidation(boardSheet, lastDataRow) {
  if (lastDataRow < DATA_START_ROW) return;

  const allRaids     = getAllRaids();
  const raidStartCol = CHAR_COL_COUNT + 1;
  const raidColCount = allRaids.length * RAID_COL_SPAN;
  const rowCount     = lastDataRow - DATA_START_ROW + 1;

  const raidRange = boardSheet.getRange(DATA_START_ROW, raidStartCol, rowCount, raidColCount);

  // ── 드롭다운 유효성 검사 ──
  const statuses = ['✓', '✗', '►', '❚❚', '★'];
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(statuses, false) // false = 드롭다운 화살표 숨김
    .setAllowInvalid(true)
    .build();
  raidRange.setDataValidation(rule);

  // ── 조건부 서식 (값에 따라 셀 색상 변경) ──
  const conditions = [
    { value: '✓',  bg: '#1a4a2a', text: '#2ecc71' }, // 완료        - 진한 초록
    { value: '✗',  bg: '#4a1a1a', text: '#e74c3c' }, // 미진행/유기  - 진한 빨강
    { value: '►',  bg: '#1a2a4a', text: '#3498db' }, // 진행중       - 진한 파랑
    { value: '❚❚', bg: '#2a1a4a', text: '#9b59b6' }, // 일정 대기중  - 진한 보라
    { value: '★',  bg: '#4a3800', text: '#f1c40f' }, // 오늘 할 예정 - 진한 노랑
  ];

  const existingRules = boardSheet.getConditionalFormatRules();

  const newRules = conditions.map(c =>
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(c.value)
      .setBackground(c.bg)
      .setFontColor(c.text)
      .setBold(true)
      .setRanges([raidRange])
      .build()
  );

  boardSheet.setConditionalFormatRules([...existingRules, ...newRules]);
}

// ============================================================
// 캐릭터 정보 갱신 (수동 버튼 + 트리거 공용)
// ============================================================
function updateCharacterStats() {
  const now  = new Date();
  const day  = now.getDay();  // 0=일, 3=수
  const hour = now.getHours();
  if (day === 3 && hour >= 5 && hour < 10) return; // 수요일 05~10시 스킵

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('캐릭터');
  const data  = sheet.getDataRange().getValues();

  const targets = [];
  for (let i = 1; i < data.length; i++) {
    const nick = data[i][CHAR_NICK_COL - 1];
    if (!nick) continue;
    targets.push({ rowIndex: i + 1, nick }); // 1-indexed 실제 시트 행
  }
  if (targets.length === 0) return;

  const apiKey = PropertiesService.getScriptProperties().getProperty('LOSTARK_API_KEY');
  if (!apiKey) {
    SpreadsheetApp.getUi().alert('API 키가 설정되지 않았습니다.\n메뉴 → [🗝️ API 키 설정]을 먼저 실행해주세요.');
    return;
  }

  fetchAndWriteCharacterStats(sheet, targets, apiKey);

  const updatedAt = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  sheet.getRange(1, 9).setValue('마지막 갱신: ' + updatedAt).setFontColor('#ffffff').setFontSize(10);
}

// 50개씩 배치로 나눠 API 요청 후 시트에 기록
function fetchAndWriteCharacterStats(sheet, targets, apiKey) {
  const BATCH = 50;
  for (let start = 0; start < targets.length; start += BATCH) {
    const batch = targets.slice(start, start + BATCH);

    const lostarkRes = UrlFetchApp.fetchAll(batch.map(t => ({
      url    : 'https://developer-lostark.game.onstove.com/armories/characters/'
               + encodeURIComponent(t.nick) + '?filters=profiles%2Barkpassive',
      headers: { 'Authorization': apiKey },
      muteHttpExceptions: true
    })));

    const lopecRes = UrlFetchApp.fetchAll(batch.map(t => ({
      url    : 'https://m.lopec.kr/character/specPoint/' + encodeURIComponent(t.nick),
      headers: { 'User-Agent': 'Mozilla/5.0' },
      muteHttpExceptions: true
    })));

    batch.forEach((t, idx) => {
      const row = t.rowIndex; // rowIndex가 이미 1-indexed 실제 시트 행
      if (lostarkRes[idx].getResponseCode() === 200) {
        try {
          const json = JSON.parse(lostarkRes[idx].getContentText());
          sheet.getRange(row, CHAR_CLS_COL).setValue(json.ArmoryProfile.CharacterClassName || '');
          sheet.getRange(row, CHAR_LV_COL).setValue(json.ArmoryProfile.ItemAvgLevel        || '');
          sheet.getRange(row, CHAR_POW_COL).setValue(json.ArmoryProfile.CombatPower        || '');
          sheet.getRange(row, CHAR_ARC_COL).setValue(json.ArkPassive?.Title                || '');
        } catch(e) {
          Logger.log('로스트아크 API 오류: ' + t.nick + ' / ' + e.message);
        }
      }
      try {
        const html  = lopecRes[idx].getContentText('UTF-8').replace(/\n|\r/g, ' ');
        const match = html.match(/달성 최고 점수<\/span>\s*<span[^>]*>([\d.]+)<\/span>/);
        sheet.getRange(row, CHAR_ROB_COL).setValue(match ? match[1].trim() : '');
      } catch(e) {
        Logger.log('로펙 오류: ' + t.nick + ' / ' + e.message);
      }
    });
  }
}

function updateCharacterStatsPartial() {
  const ui       = SpreadsheetApp.getUi();
  const response = ui.prompt('부분 갱신', '갱신할 행 범위를 입력하세요 (예: 5 또는 5-10)', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;

  const input = response.getResponseText().trim();
  let startRow, endRow;
  if (input.includes('-')) {
    const parts = input.split('-');
    startRow = parseInt(parts[0]);
    endRow   = parseInt(parts[1]);
  } else {
    startRow = endRow = parseInt(input);
  }
  if (isNaN(startRow) || isNaN(endRow) || startRow < 2 || endRow < startRow) {
    ui.alert('올바른 행 번호를 입력해주세요. (2행 이상)');
    return;
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('캐릭터');
  const data  = sheet.getRange(startRow, 1, endRow - startRow + 1, CHAR_COL_COUNT).getValues();

  const targets = [];
  data.forEach((row, i) => {
    const nick = row[CHAR_NICK_COL - 1];
    if (!nick) return;
    targets.push({ rowIndex: startRow + i, nick });
  });
  if (targets.length === 0) { ui.alert('해당 범위에 닉네임이 없습니다.'); return; }

  const apiKey = PropertiesService.getScriptProperties().getProperty('LOSTARK_API_KEY');
  if (!apiKey) {
    ui.alert('API 키가 설정되지 않았습니다.\n메뉴 → [🗝️ API 키 설정]을 먼저 실행해주세요.');
    return;
  }

  fetchAndWriteCharacterStats(sheet, targets, apiKey);

  const updatedAt = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  sheet.getRange(1, 9).setValue('마지막 갱신: ' + updatedAt).setFontColor('#ffffff').setFontSize(10);
}

function composeParties() {
  try {
    const BACKEND_URL = "http://sisnet2.iptime.org:48080/api/schedule/compose";

    const response = UrlFetchApp.fetch(BACKEND_URL, {
      method: "post",
      muteHttpExceptions: true,
      connectTimeout: 30000,
      readTimeout: 90000,
    });

    const code = response.getResponseCode();
    const body = response.getContentText();
    Logger.log("HTTP %s | %s", code, body.substring(0, 200));

    if (code !== 200) {
      SpreadsheetApp.getUi().alert("❌ 백엔드 오류 (HTTP " + code + ")\n\n" + body.substring(0, 300));
      return;
    }

    const json = JSON.parse(body);
    const d = json.data;
    SpreadsheetApp.getUi().alert(
      "✅ 파티 편성 완료!\n" + d.partyCount + "파티 / 총 " + d.totalMembers + "명\n\n다음주레이드 시트를 확인하세요."
    );

  } catch (e) {
    Logger.log("composeParties 오류: " + e.message + "\n" + e.stack);
    SpreadsheetApp.getUi().alert("❌ 오류 발생\n\n" + e.message + "\n\nApps Script 실행 로그를 확인하세요.");
  }
}

// ============================================================
// 상단 메뉴
// ============================================================
function onOpen() {
  if (Session.getActiveUser().getEmail() !== 'work.gitaey@gmail.com') return;
  if (Session.getActiveUser().getEmail() !== 'dev.jsh88@gmail.com') return;

  SpreadsheetApp.getUi()
    .createMenu('길드 레이드')
    .addItem('현황판 구조 생성 / 재생성', 'setupRaidBoard')
    .addItem('현황판 수동 갱신', 'updateRaidBoard')
    .addSeparator()
    .addItem('캐릭터 정보 수동 갱신', 'updateCharacterStats')
    .addItem('캐릭터 정보 부분 갱신', 'updateCharacterStatsPartial')
    .addSeparator()
    .addItem('주차 리셋', 'resetWeek')
    .addItem('다음주 레이드', 'composeParties')
    .addSeparator()
    .addItem('닉네임 드롭다운 설정', 'setupNicknameDropdown')
    .addToUi();
}

// 레이드일정 시트 닉네임 칸에 캐릭터 시트 B열 닉네임 드롭다운 설정
function setupNicknameDropdown() {
  const ss           = SpreadsheetApp.getActiveSpreadsheet();
  const charSheet    = ss.getSheetByName('캐릭터');
  const schedSheet   = ss.getSheetByName('레이드일정');

  // 캐릭터 시트 B열에서 닉네임 수집 (빈 셀 제외)
  const nickValues = charSheet.getRange('B2:B' + charSheet.getLastRow()).getValues();
  const nicknames  = nickValues.map(r => r[0]).filter(v => v !== '');
  if (nicknames.length === 0) return;

  const sheetId = schedSheet.getSheetId();
  const lastCol = Math.max(schedSheet.getLastColumn(), 7);

  // 닉네임 행 목록 (9, 13, 17 ... TOTAL_SLOTS개 + 추가 행 41, 45)
  const nickRows = [];
  for (let slot = 0; slot < TOTAL_SLOTS; slot++) {
    nickRows.push(NICK_START_ROW + slot * ROWS_PER_SLOT);
  }
  nickRows.push(41, 45);

  const rule = {
    condition: {
      type  : 'ONE_OF_LIST',
      values: nicknames.map(n => ({ userEnteredValue: String(n) }))
    },
    showCustomUi: false,
    strict: false
  };

  const requests = nickRows.map(row => ({
    setDataValidation: {
      range: {
        sheetId,
        startRowIndex   : row - 1,
        endRowIndex     : row,
        startColumnIndex: 6,
        endColumnIndex  : lastCol
      },
      rule
    }
  }));
  Sheets.Spreadsheets.batchUpdate({ requests }, ss.getId());
}