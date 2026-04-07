/**
 * StoreOps Bot v17 - 基於 v16 格式 + 實際 Google Sheet 結構
 * 
 * Google Sheets 資料表:
 *   員工管理         - UserID, 暱稱, 入職日, 離職日, 時薪, 備註, 證件照片, current_step, temp_data, Language
 *   員工工時紀錄     - 日期, 員工姓名, 店名, 上班時間, 下班時間, 工時, 打卡紀錄, 業績紀錄, 備註, row_number
 *   每日業績紀錄     - 日期, 店名, 開攤時間, 操作記錄, 最終結算, 差異, 備註, row_number
 *   分店清單         - 分店清單 (column A, rows 2+)
 * 
 * Google Drive Folder: 1k4rfsjHYYXO8He7MUbTZoNJivDJkcn2a (機器人存圖區)
 *
 * 照片檔名規則: [員工名][店名][動作][YYYY-MM-DD_HH-MM-SS].jpg (同 v16 格式)
 *   例如: [R碰碰][蘆洲][上班][2026-03-06_13-14-25].jpg
 *         [R碰碰][證件照][2026-03-06_13-14-25].jpg (id_card 無店名)
 * 
 * 打卡紀錄格式: [上班][2026/02/05 19:30:37][https://drive.google.com/file/d/.../view]
 * 操作記錄格式: [員工名][開攤][金額][timestamp]
 * 證件照片格式: [證件照片]YYYY-MM-DD照片.jpeg (存在員工管理表的證件照片欄)
 */

const fs = require('fs');
const v16 = JSON.parse(fs.readFileSync('line-clock-in-bot-v16-refactored.json', 'utf8'));

// ============= 常數 =============
const SHEET_ID = '1ILgphAVTKI5KIpCJKrT5anlF4GQK8YoHf8JAtAnMN7o';
const DRIVE_FOLDER_ID = '1k4rfsjHYYXO8He7MUbTZoNJivDJkcn2a';

// ============= 工具 =============
function findV16(name) { return v16.nodes.find(n => n.name === name); }

const nodes = [];
const connections = {};
let seq = 1;

function mkId(name) { return 'v17-' + name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 20) + '-' + (seq++); }

function clone(srcName, newName, posX, posY) {
  const src = findV16(srcName);
  if (!src) throw new Error('Missing v16 node: ' + srcName);
  const n = JSON.parse(JSON.stringify(src));
  n.name = newName; n.id = mkId(newName); n.position = [posX, posY];
  return n;
}

function codeN(name, jsCode, posX, posY) {
  const n = JSON.parse(JSON.stringify(findV16('前置處理')));
  n.name = name; n.id = mkId(name); n.position = [posX, posY]; n.parameters.jsCode = jsCode;
  return n;
}

function switchN(name, field, vals, posX, posY) {
  const n = JSON.parse(JSON.stringify(findV16('狀態路由')));
  n.name = name; n.id = mkId(name); n.position = [posX, posY];
  n.parameters.rules.values = vals.map(v => ({
    conditions: {
      options: { caseSensitive: true, typeValidation: 'strict' },
      conditions: [{ leftValue: '={{ $json.' + field + ' }}', rightValue: v.value, operator: { type: 'string', operation: 'equals' } }],
      combinator: 'and'
    }, renameOutput: true, outputKey: v.key
  }));
  return n;
}

function ifN(name, leftValue, operation, rightValue, posX, posY) {
  const n = JSON.parse(JSON.stringify(findV16('員工是否存在')));
  n.name = name; n.id = mkId(name); n.position = [posX, posY];
  n.parameters.conditions.conditions = [{ id: mkId('cond'), leftValue, rightValue, operator: { type: 'string', operation } }];
  return n;
}

function sheetsLookup(name, sheetName, filters, posX, posY) {
  const n = JSON.parse(JSON.stringify(findV16('查詢員工表')));
  n.name = name; n.id = mkId(name); n.position = [posX, posY];
  n.parameters.sheetName = { __rl: true, value: sheetName, mode: 'name' };
  n.parameters.filtersUI = { values: filters };
  return n;
}

function sheetsAppend(name, sheetName, posX, posY) {
  const n = JSON.parse(JSON.stringify(findV16('建立新員工')));
  n.name = name; n.id = mkId(name); n.position = [posX, posY];
  n.parameters.sheetName = { __rl: true, value: sheetName, mode: 'name' };
  n.parameters.columns = { mappingMode: 'autoMapInputData', value: {} };
  return n;
}

function sheetsUpdate(name, sheetName, posX, posY) {
  const n = JSON.parse(JSON.stringify(findV16('重置(取消)')));
  n.name = name; n.id = mkId(name); n.position = [posX, posY];
  n.parameters.sheetName = { __rl: true, value: sheetName, mode: 'name' };
  // appendOrUpdate: 依 matchingColumns 找行再更新，不需要 range（update 需要 range）
  n.parameters.operation = 'appendOrUpdate';
  n.parameters.columns = { mappingMode: 'autoMapInputData', value: {}, matchingColumns: ['UserID'] };
  return n;
}

function sheetsGetAll(name, sheetName, posX, posY) {
  const ref = findV16('讀取分店清單');
  const n = JSON.parse(JSON.stringify(ref));
  n.name = name; n.id = mkId(name); n.position = [posX, posY];
  n.parameters.sheetName = { __rl: true, value: sheetName, mode: 'name' };
  return n;
}

function add(n) { nodes.push(n); return n.name; }
function conn(from, to, fromIdx = 0) {
  if (!connections[from]) connections[from] = { main: [] };
  while (connections[from].main.length <= fromIdx) connections[from].main.push([]);
  connections[from].main[fromIdx].push({ node: to, type: 'main', index: 0 });
}

// ======================================================================
// 1-5. 前置處理管線 (直接複製 v16)
// ======================================================================
add(clone('LINE Webhook', 'LINE Webhook', -2000, 300));
add(clone('擷取訊息資訊', '擷取訊息資訊', -1760, 300));
conn('LINE Webhook', '擷取訊息資訊');
// Fix: n8n expressions don't support optional chaining (?.) — use ternary operators
{
  const n = nodes.find(x => x.name === '擷取訊息資訊');
  if (n && n.parameters && n.parameters.assignments) {
    const fix = {
      msgType:    "={{ $json.body.events[0].message ? $json.body.events[0].message.type : 'postback' }}",
      msgText:    "={{ $json.body.events[0].message ? $json.body.events[0].message.text : '' }}",
      postbackData: "={{ $json.body.events[0].postback ? $json.body.events[0].postback.data : '' }}",
      msgId:      "={{ $json.body.events[0].message ? $json.body.events[0].message.id : '' }}"
    };
    n.parameters.assignments.assignments = n.parameters.assignments.assignments.map(a =>
      fix[a.name] ? { ...a, value: fix[a.name] } : a
    );
  }
}

add(clone('前置處理', '前置處理', -1520, 300));
conn('擷取訊息資訊', '前置處理');

// 查詢員工表 (sheet: 員工管理)
add(sheetsLookup('查詢員工表', '員工管理', [{ lookupColumn: 'UserID', lookupValue: '={{ $json.userId }}' }], -1280, 300));
{
  const n = nodes.find(x => x.name === '查詢員工表');
  if (n) n.alwaysOutputData = true;
}
conn('前置處理', '查詢員工表');

add(clone('員工是否存在', '員工是否存在', -1040, 300));
conn('查詢員工表', '員工是否存在');

// ======================================================================
// 新員工路徑 (False)
// ======================================================================
add(clone('取得LINE個資', '取得LINE個資', -800, 550));
conn('員工是否存在', '取得LINE個資', 1);

// 建立新員工 → 員工管理表
add(codeN('準備新員工資料', `
const userId = $('擷取訊息資訊').item.json.userId;
const displayName = $('取得LINE個資').item.json.displayName || '新朋友';
const today = $('前置處理').item.json.today || '';
return { json: { UserID: userId, '暱稱': displayName, '入職日': today, '離職日': '', '時薪': '', '備註': '', '證件照片': '', current_step: 'WAIT_LANG', temp_data: '', Language: '' } };
`, -560, 550));
conn('取得LINE個資', '準備新員工資料');

add(sheetsAppend('建立新員工', '員工管理', -320, 550));
conn('準備新員工資料', '建立新員工');

add(codeN('回覆語言選單', `
const userId = $('擷取訊息資訊').item.json.userId;
const displayName = $('取得LINE個資').item.json.displayName || '新朋友';
return { json: {
  replyToken: $('擷取訊息資訊').item.json.replyToken, userId,
  updateEmp: null,
  replyMessages: [{ type: 'text', text: '👋 歡迎 ' + displayName + '！\\n請選擇您的語言 / Vui lòng chọn ngôn ngữ:', quickReply: { items: [
    { type: 'action', action: { type: 'postback', label: '🇹🇼 中文', data: 'action=lang&value=zh-TW' } },
    { type: 'action', action: { type: 'postback', label: '🇻🇳 Tiếng Việt', data: 'action=lang&value=vi-VN' } }
  ] } }]
} };
`, -80, 550));
conn('建立新員工', '回覆語言選單');

// ======================================================================
// 既有員工路徑 (True) → 讀取狀態 → 狀態路由
// ======================================================================
add(codeN('讀取狀態與翻譯', `
const prev = $('前置處理').item.json;
const emp = $('查詢員工表').item.json;
let step = emp.current_step || 'IDLE';
let tempData = {};
try { tempData = JSON.parse(emp.temp_data || '{}'); } catch(e) { tempData = {}; }
const lang = emp.Language || 'zh-TW';
// 解析 postbackData
let postbackAction = '';
let postbackValue = '';
if (prev.postbackData) {
  const pairs = prev.postbackData.split('&');
  pairs.forEach(p => { const [k,v] = p.split('='); if (k === 'action') postbackAction = decodeURIComponent(v||''); if (k === 'value') postbackValue = decodeURIComponent(v||''); });
}
const T = {
  'zh-TW': {
    selectStore: '📍 請選擇門市：',
    askRevenueIn: '💰 請輸入開攤時收銀機現有金額（純數字）：\\n若為小幫手請輸入 0',
    askRevenueOut: '💰 辛苦了！請輸入目前收銀機業績金額（純數字）：',
    photoId: '📸 請上傳您的【證件照】以完成註冊：',
    photoIn: '📸 請上傳【上班/開攤照片】：',
    photoOut: '📸 請上傳【下班/收攤照片】：',
    cancel: '❌ 已取消操作，狀態已重置。',
    clockInDone: '✅ 上班打卡成功！目前為「上班中」狀態。',
    clockOutDone: '✅ 下班打卡成功！辛苦了 🎉',
    invalidNum: '❌ 請輸入有效的數字（純數字）',
    regDone: '✅ 註冊完成！\\n📋 使用說明：\\n• 輸入「打卡」開始上班\\n• 上班中再輸入「打卡」即可下班\\n祝工作順利！💪',
    alreadyWorking: '⚠️ 您目前已在上班中，再次輸入「打卡」即可下班。',
    unknownCmd: '🤔 我不太理解您的訊息。\\n上班/下班請輸入「打卡」。'
  },
  'vi-VN': {
    selectStore: '📍 Vui lòng chọn cửa hàng：',
    askRevenueIn: '💰 Nhập số tiền hiện tại trong máy (chỉ số)：\\nNhập 0 nếu là phụ việc',
    askRevenueOut: '💰 Nhập doanh thu hiện tại trong máy (chỉ số)：',
    photoId: '📸 Tải lên ảnh giấy tờ để hoàn tất đăng ký：',
    photoIn: '📸 Tải ảnh chấm công vào：',
    photoOut: '📸 Tải ảnh chấm công ra：',
    cancel: '❌ Đã hủy thao tác.',
    clockInDone: '✅ Chấm công vào thành công! Đang làm việc.',
    clockOutDone: '✅ Chấm công ra thành công! 🎉',
    invalidNum: '❌ Vui lòng nhập số hợp lệ',
    regDone: '✅ Đăng ký hoàn tất!\\n📋 Hướng dẫn：\\n• Nhập "打卡" để chấm công\\nChúc làm việc vui！',
    alreadyWorking: '⚠️ Bạn đang làm việc. Nhập "打卡" để chấm công ra.',
    unknownCmd: '🤔 Không hiểu tin nhắn. Nhập "打卡" để chấm công.'
  }
};
if (postbackAction === 'cancel') { step = '__CANCEL__'; }
return { json: { ...prev, emp, step, tempData, lang, postbackAction, postbackValue, t: T[lang] || T['zh-TW'] } };
`, -800, 100));
conn('員工是否存在', '讀取狀態與翻譯', 0);

add(switchN('狀態路由', 'step', [
  { key: 'CANCEL', value: '__CANCEL__' },
  { key: 'IDLE', value: 'IDLE' },
  { key: 'WORKING', value: 'WORKING' },
  { key: 'WAIT_LANG', value: 'WAIT_LANG' },
  { key: 'WAIT_STORE', value: 'WAIT_STORE' },
  { key: 'WAIT_PHOTO', value: 'WAIT_PHOTO' },
  { key: 'WAIT_REVENUE', value: 'WAIT_REVENUE' }
], -560, 100));
conn('讀取狀態與翻譯', '狀態路由');

// === CANCEL ===
add(codeN('處理取消', `
return { json: { replyToken: $json.replyToken, userId: $json.userId, updateEmp: { current_step: 'IDLE', temp_data: '' }, replyMessages: [{ type: 'text', text: $json.t.cancel }] } };
`, 200, -300));
conn('狀態路由', '處理取消', 0);

// === IDLE → 讀取分店清單 → 組裝選單 ===
add(codeN('處理IDLE', `
const d = $json; const t = d.t;
const txt = d.msgText.trim();
if (txt === '打卡' || txt.toLowerCase() === 'chấm công') {
  return { json: { ...d, needStoreList: 'yes', updateEmp: { current_step: 'WAIT_STORE', temp_data: '{}' } } };
}
return { json: { replyToken: d.replyToken, userId: d.userId, updateEmp: null, needStoreList: 'no', replyMessages: [{ type: 'text', text: t.unknownCmd }] } };
`, 200, -150));
conn('狀態路由', '處理IDLE', 1);

// 判斷是否需要讀門市清單
add(ifN('要讀店?', '={{ $json.needStoreList }}', 'equals', 'yes', 420, -150));
conn('處理IDLE', '要讀店?');

// 讀取分店清單 (from Google Sheet)
add(sheetsGetAll('讀取分店清單', '分店清單', 640, -220));
conn('要讀店?', '讀取分店清單', 0);

add(codeN('組裝門市選單', `
const stores = $input.all().map(item => item.json['分店清單']).filter(s => s && s.trim());
const d = $('要讀店?').first().json;
const items = stores.map(s => ({ type: 'action', action: { type: 'postback', label: s, data: 'action=select_store&value=' + encodeURIComponent(s) } }));
items.push({ type: 'action', action: { type: 'postback', label: '❌ 取消', data: 'action=cancel' } });
return { json: { replyToken: d.replyToken, userId: d.userId, updateEmp: d.updateEmp, replyMessages: [{ type: 'text', text: d.t.selectStore, quickReply: { items } }] } };
`, 860, -220));
conn('讀取分店清單', '組裝門市選單');

// === WORKING ===
add(codeN('處理WORKING', `
const d = $json; const t = d.t; const txt = d.msgText.trim();
if (txt === '打卡' || txt.toLowerCase() === 'chấm công') {
  // F6B: 保留 store + clock_in_time 讓 clockout 計算工時
  return { json: { replyToken: d.replyToken, userId: d.userId,
    updateEmp: { current_step: 'WAIT_PHOTO', temp_data: JSON.stringify({ action: 'clockout', store: d.tempData.store || '', clock_in_time: d.tempData.clock_in_time || '' }) },
    replyMessages: [{ type: 'text', text: t.photoOut, quickReply: { items: [
      { type: 'action', action: { type: 'camera', label: '📷 拍照' } },
      { type: 'action', action: { type: 'cameraRoll', label: '🖼️ 相簿' } },
      { type: 'action', action: { type: 'postback', label: '❌ 取消', data: 'action=cancel' } }
    ] } }] } };
}
return { json: { replyToken: d.replyToken, userId: d.userId, updateEmp: null, replyMessages: [{ type: 'text', text: t.alreadyWorking }] } };
`, 200, 0));
conn('狀態路由', '處理WORKING', 2);

// === WAIT_LANG ===
add(codeN('處理WAIT_LANG', `
const d = $json;
if (d.postbackAction === 'lang') {
  const selectedLang = d.postbackValue;
  const msgs = { 'zh-TW': '✅ 語言設定為【中文】\\n📸 請上傳您的【證件照】完成註冊：', 'vi-VN': '✅ Đã chọn【Tiếng Việt】\\n📸 Tải lên ảnh giấy tờ để đăng ký：' };
  return { json: { replyToken: d.replyToken, userId: d.userId, updateEmp: { Language: selectedLang, current_step: 'WAIT_PHOTO', temp_data: JSON.stringify({ action: 'id_card' }) }, replyMessages: [{ type: 'text', text: msgs[selectedLang] || msgs['zh-TW'] }] } };
}
return { json: { replyToken: d.replyToken, userId: d.userId, updateEmp: null, replyMessages: [{ type: 'text', text: '👋 請先選擇語言 / Vui lòng chọn ngôn ngữ' }] } };
`, 200, 150));
conn('狀態路由', '處理WAIT_LANG', 3);

// === WAIT_STORE ===
add(codeN('處理WAIT_STORE', `
const d = $json; const t = d.t;
if (d.postbackAction === 'select_store') {
  const store = d.postbackValue;
  // F7: 加入相機按鈕; F8: _today/_currentTime 供 查詢今日業績(打卡) 使用
  return { json: { replyToken: d.replyToken, userId: d.userId,
    updateEmp: { current_step: 'WAIT_PHOTO', temp_data: JSON.stringify({ action: 'clockin', store }) },
    replyMessages: [{ type: 'text', text: t.photoIn, quickReply: { items: [
      { type: 'action', action: { type: 'camera', label: '📷 拍照' } },
      { type: 'action', action: { type: 'cameraRoll', label: '🖼️ 相簿' } },
      { type: 'action', action: { type: 'postback', label: '❌ 取消', data: 'action=cancel' } }
    ] } }],
    _today: d.today, _currentTime: d.currentTime } };
}
return { json: { replyToken: d.replyToken, userId: d.userId, updateEmp: null, replyMessages: [{ type: 'text', text: t.selectStore }] } };
`, 200, 300));
conn('狀態路由', '處理WAIT_STORE', 4);

// === F8: 查詢今日業績(打卡) → 判斷打卡類型 ===
// 查詢今日該門市是否已有業績紀錄（判斷開攤/小幫手/開攤中）
{
  const qn = sheetsLookup('查詢今日業績(打卡)', '每日業績紀錄', [
    { lookupColumn: '日期', lookupValue: "={{ ($json._today || '').substring(5) }}" },
    { lookupColumn: '店名', lookupValue: "={{ JSON.parse(($json.updateEmp || {}).temp_data || '{}').store || '' }}" }
  ], 420, 350);
  qn.alwaysOutputData = true;  // 無紀錄也繼續
  add(qn);
}
conn('處理WAIT_STORE', '查詢今日業績(打卡)');

add(codeN('判斷打卡類型', `
const storeRecord = $input.item.json;
const prev = $('處理WAIT_STORE').item.json;
// 若非選店動作（updateEmp 為 null 或非 WAIT_PHOTO），直接 pass through
if (!prev.updateEmp || prev.updateEmp.current_step !== 'WAIT_PHOTO') {
  return { json: prev };
}
let td = {};
try { td = JSON.parse(prev.updateEmp.temp_data || '{}'); } catch(e) {}
// 預設: 開攤 (無今日記錄)
let clock_type = 'kaitan';
if (storeRecord && storeRecord['開攤時間']) {
  // 今日已有業績紀錄 → 比較開攤時間 vs 現在時間（時區 +8，時間來自前置處理）
  const openTimeStr = String(storeRecord['開攤時間'] || '').trim(); // HH:MM
  const currentTimeStr = String(prev._currentTime || '00:00:00').trim();
  try {
    const [oh, om] = openTimeStr.split(':').map(Number);
    const [ch, cm] = currentTimeStr.split(':').map(Number);
    const openMins = oh * 60 + om;
    const currentMins = ch * 60 + cm;
    let diffMins = currentMins - openMins;
    if (diffMins < 0) diffMins += 24 * 60; // 跨午夜
    clock_type = diffMins <= 60 ? 'helper' : 'assist';
  } catch(e) { clock_type = 'helper'; }
}
const newTd = { ...td, clock_type };
if (clock_type === 'assist' && storeRecord && storeRecord.row_number) {
  newTd.business_row_number = storeRecord.row_number;
}
const updatedUpdateEmp = { ...prev.updateEmp, temp_data: JSON.stringify(newTd) };
return { json: { ...prev, updateEmp: updatedUpdateEmp } };
`, 640, 350));
conn('查詢今日業績(打卡)', '判斷打卡類型');
conn('判斷打卡類型', '準備更新狀態');

// === WAIT_PHOTO ===
add(codeN('處理WAIT_PHOTO', `
const d = $json; const t = d.t; const action = d.tempData.action || '';
const cameraItems = [
  { type: 'action', action: { type: 'camera', label: '📷 拍照' } },
  { type: 'action', action: { type: 'cameraRoll', label: '🖼️ 相簿' } },
  { type: 'action', action: { type: 'postback', label: '❌ 取消', data: 'action=cancel' } }
];
if (d.msgType !== 'image') {
  const hint = action === 'id_card' ? t.photoId : (action === 'clockin' ? t.photoIn : t.photoOut);
  // F7: 非圖片時也給相機按鈕
  return { json: { replyToken: d.replyToken, userId: d.userId, updateEmp: null, replyMessages: [{ type: 'text', text: '⚠️ ' + hint, quickReply: { items: cameraItems } }], hasPhoto: 'no' } };
}
const empName = d.emp['暱稱'] || 'unknown';
const store = d.tempData.store || '';
const dateStr = (d.today || '').replace(/\\//g, '-');
const timeStr = (d.currentTime || '').replace(/:/g, '-');
const photoDownloadUrl = 'https://api-data.line.me/v2/bot/message/' + d.msgId + '/content';
// 照片檔名規則同 v16: [員工][店名][動作][日期_時間].jpg; id_card 無店名
let fileName = '';
if (action === 'id_card') {
  fileName = '[' + empName + '][證件照][' + dateStr + '_' + timeStr + '].jpg';
  return { json: { replyToken: d.replyToken, userId: d.userId, updateEmp: { current_step: 'IDLE', temp_data: '' }, replyMessages: [{ type: 'text', text: t.regDone }], hasPhoto: 'yes', photoDownloadUrl, fileName, photoAction: 'id_card' } };
}
if (action === 'clockin') {
  fileName = '[' + empName + '][' + store + '][上班][' + dateStr + '_' + timeStr + '].jpg';
  // F8: 依 clock_type 決定是否詢問業績
  const clockType = d.tempData.clock_type || 'kaitan';
  if (clockType === 'kaitan' || clockType === 'helper') {
    // 開攤/小幫手: 直接進 WORKING，不問業績
    return { json: { replyToken: d.replyToken, userId: d.userId,
      updateEmp: { current_step: 'WORKING', temp_data: JSON.stringify({ store, clock_in_time: d.currentTime, clock_type: clockType }) },
      replyMessages: [{ type: 'text', text: t.clockInDone + '\\n📍 ' + store + '\\n⏰ ' + d.currentTime }],
      hasPhoto: 'yes', photoDownloadUrl, fileName, photoAction: 'clockin',
      revenueAction: 'clockin_noop',
      clockInNoopData: { workDay: d.today, currentTime: d.currentTime, fullTimestamp: d.fullTimestamp, store, nickname: empName, clock_type: clockType }
    } };
  } else {
    // 開攤中 (assist): 詢問業績
    return { json: { replyToken: d.replyToken, userId: d.userId,
      updateEmp: { current_step: 'WAIT_REVENUE', temp_data: JSON.stringify({ action: 'clockin_rev', store, clock_type: clockType }) },
      replyMessages: [{ type: 'text', text: t.askRevenueIn, quickReply: { items: [{ type: 'action', action: { type: 'postback', label: '❌ 取消', data: 'action=cancel' } }] } }],
      hasPhoto: 'yes', photoDownloadUrl, fileName, photoAction: 'clockin'
    } };
  }
}
if (action === 'clockout') {
  fileName = '[' + empName + '][' + store + '][下班][' + dateStr + '_' + timeStr + '].jpg';
  return { json: { replyToken: d.replyToken, userId: d.userId,
    updateEmp: { current_step: 'WAIT_REVENUE', temp_data: JSON.stringify({ action: 'clockout_rev', store: d.tempData.store || '', clock_in_time: d.tempData.clock_in_time || '' }) },
    replyMessages: [{ type: 'text', text: t.askRevenueOut, quickReply: { items: [{ type: 'action', action: { type: 'postback', label: '❌ 取消', data: 'action=cancel' } }] } }],
    hasPhoto: 'yes', photoDownloadUrl, fileName, photoAction: 'clockout'
  } };
}
return { json: { replyToken: d.replyToken, userId: d.userId, updateEmp: null, replyMessages: [{ type: 'text', text: '⚠️ 未知動作' }], hasPhoto: 'no' } };
`, 200, 450));
conn('狀態路由', '處理WAIT_PHOTO', 5);

// --- 照片管線 ---
add(ifN('有照片?', '={{ $json.hasPhoto }}', 'equals', 'yes', 420, 450));
conn('處理WAIT_PHOTO', '有照片?');

// 下載照片 (from LINE)
{
  const n = clone('下載照片', '下載照片', 640, 400);
  n.parameters.url = '={{ $json.photoDownloadUrl }}';
  add(n);
}
conn('有照片?', '下載照片', 0);

// 上傳至 Drive (到指定資料夾)
{
  const n = clone('上傳至Drive', '上傳至Drive', 860, 400);
  n.parameters.operation = 'upload';
  n.parameters.name = "={{ $('處理WAIT_PHOTO').item.json.fileName }}";
  n.parameters.folderId = { __rl: true, mode: 'id', value: DRIVE_FOLDER_ID };
  add(n);
}
conn('下載照片', '上傳至Drive');

// 設定檔案權限
add(clone('設定檔案權限', '設定檔案權限', 1080, 400));
conn('上傳至Drive', '設定檔案權限');

// 記錄照片連結
add(codeN('記錄照片連結', `
const prev = $('處理WAIT_PHOTO').item.json;
const driveFileId = $('上傳至Drive').item.json.id || '';
const driveLink = driveFileId ? 'https://drive.google.com/file/d/' + driveFileId + '/view' : '';
const result = { ...prev, driveFileId, driveLink };
// F1: id_card 時把 driveLink 存入 updateEmp.證件照片
if (prev.photoAction === 'id_card') {
  result.updateEmp = { ...(prev.updateEmp || {}), '證件照片': driveLink };
}
return { json: result };
`, 1300, 400));
conn('設定檔案權限', '記錄照片連結');

// === WAIT_REVENUE ===
add(codeN('處理WAIT_REVENUE', `
const d = $json; const t = d.t; const action = d.tempData.action || '';
const revenue = d.msgText.trim();
if (!/^\\d+$/.test(revenue)) {
  return { json: { replyToken: d.replyToken, userId: d.userId, updateEmp: null, replyMessages: [{ type: 'text', text: t.invalidNum }], revenueAction: 'none' } };
}
const amount = parseInt(revenue, 10);
if (action === 'clockin_rev') {
  const store = d.tempData.store || ''; const nickname = d.emp['暱稱'] || '';
  // F6A: 把 clock_in_time 存入 WORKING temp_data（時區 +8，時間來自前置處理）
  return { json: { replyToken: d.replyToken, userId: d.userId,
    updateEmp: { current_step: 'WORKING', temp_data: JSON.stringify({ store, clock_in_time: d.currentTime, clock_type: 'assist' }) },
    replyMessages: [{ type: 'text', text: t.clockInDone + '\\n📍 ' + store + '\\n⏰ ' + d.currentTime }],
    revenueAction: 'clockin_rev',
    clockInData: { workDay: d.today, shortDate: (d.today||'').substring(5), currentTime: d.currentTime, fullTimestamp: d.fullTimestamp, store, nickname, revenue: amount }
  } };
}
if (action === 'clockout_rev') {
  const nickname = d.emp['暱稱'] || ''; const store = d.tempData.store || '';
  // F6C: 顯示上班/下班時間 + 工時（15 分鐘為單位，時區 +8）
  const clockInTime = d.tempData.clock_in_time || '';
  let hoursText = '';
  if (clockInTime) {
    try {
      const inParts = clockInTime.split(':').map(Number);
      const outParts = d.currentTime.split(':').map(Number);
      let secs = (outParts[0]*3600+outParts[1]*60+(outParts[2]||0)) - (inParts[0]*3600+inParts[1]*60+(inParts[2]||0));
      if (secs < 0) secs += 86400; // 跨午夜
      const units = Math.floor(secs / 900); // 900 秒 = 15 分鐘一單位
      hoursText = '\\n⏱️ 工時：' + (units * 0.25).toFixed(2) + ' 小時';
    } catch(e) {}
  }
  const replyText = t.clockOutDone + '\\n🕐 上班：' + (clockInTime || '--') + '\\n🕕 下班：' + d.currentTime + '\\n💰 業績: ' + amount + hoursText;
  return { json: { replyToken: d.replyToken, userId: d.userId,
    updateEmp: { current_step: 'IDLE', temp_data: '' },
    replyMessages: [{ type: 'text', text: replyText }],
    revenueAction: 'clockout_rev',
    clockOutData: { workDay: d.today, currentTime: d.currentTime, fullTimestamp: d.fullTimestamp, nickname, revenue: amount, store }
  } };
}
return { json: { replyToken: d.replyToken, userId: d.userId, updateEmp: null, replyMessages: [{ type: 'text', text: '⚠️ 未知業績動作' }], revenueAction: 'none' } };
`, 200, 600));
conn('狀態路由', '處理WAIT_REVENUE', 6);

// ======================================================================
// 統一更新 + 寫入記錄 + 回覆
// ======================================================================

// 匯流點
add(codeN('準備更新狀態', `
const d = $input.item.json;
if (!d.updateEmp) { return { json: { ...d, skipUpdate: 'yes' } }; }
return { json: { ...d, skipUpdate: 'no', UserID: d.userId, ...d.updateEmp } };
`, 1500, 200));

conn('回覆語言選單', '準備更新狀態');
conn('處理取消', '準備更新狀態');
conn('組裝門市選單', '準備更新狀態');
conn('要讀店?', '準備更新狀態', 1);
conn('處理WORKING', '準備更新狀態');
conn('處理WAIT_LANG', '準備更新狀態');
conn('記錄照片連結', '準備更新狀態');
conn('有照片?', '準備更新狀態', 1);
conn('處理WAIT_REVENUE', '準備更新狀態');

// 需要更新?
add(ifN('需要更新?', '={{ $json.skipUpdate }}', 'notEquals', 'yes', 1720, 200));
conn('準備更新狀態', '需要更新?');

// 更新員工管理表 - 先清理多餘欄位
add(codeN('清理員工資料', `
const d = $json;
const clean = { UserID: d.UserID };
if (d.current_step !== undefined) clean.current_step = d.current_step;
if (d.temp_data !== undefined) clean.temp_data = d.temp_data;
if (d.Language) clean.Language = d.Language;
if (d['證件照片']) clean['證件照片'] = d['證件照片'];
if (d['暱稱']) clean['暱稱'] = d['暱稱'];
if (d['入職日']) clean['入職日'] = d['入職日'];
if (d['時薪']) clean['時薪'] = d['時薪'];
if (d['備註']) clean['備註'] = d['備註'];
return { json: clean };
`, 1940, 100));
conn('需要更新?', '清理員工資料', 0);

add(sheetsUpdate('更新員工狀態', '員工管理', 2160, 100));
conn('清理員工資料', '更新員工狀態');

// --- 打卡 & 業績寫入邏輯 ---
add(codeN('準備打卡資料', `
const d = $('準備更新狀態').item.json;
const results = [];

// F8: 開攤/小幫手 (不問業績，直接進 WORKING)
if (d.revenueAction === 'clockin_noop' && d.clockInNoopData) {
  const c = d.clockInNoopData;
  // F4: 打卡紀錄格式 [上班][timestamp]（不含 Drive 連結）
  results.push({ json: { sheetAction: 'attendance_append', '日期': c.workDay, '員工姓名': c.nickname, '店名': c.store, '上班時間': c.currentTime, '下班時間': '', '工時': '', '打卡紀錄': '[上班][' + c.fullTimestamp + ']', '備註': c.clock_type === 'helper' ? '小幫手' : '首位開攤' } });
  if (c.clock_type === 'kaitan') {
    // 開攤: 建立今日業績紀錄（無開攤業績，下班再結算）
    results.push({ json: { sheetAction: 'revenue_append', '日期': c.workDay, '店名': c.store, '開攤時間': c.currentTime.substring(0,5), '收攤時間': '', '操作記錄': '[' + c.nickname + '][開攤][' + c.fullTimestamp + ']', '最終結算': '', '差異': '', '備註': '' } });
  }
  return results;
}

// 開攤中 (assist, 有問業績): 只記工時，業績紀錄已由開攤人建立
if (d.revenueAction === 'clockin_rev' && d.clockInData) {
  const c = d.clockInData;
  results.push({ json: { sheetAction: 'attendance_append', '日期': c.workDay, '員工姓名': c.nickname, '店名': c.store, '上班時間': c.currentTime, '下班時間': '', '工時': '', '打卡紀錄': '[上班][' + c.fullTimestamp + ']', '備註': '開攤中' } });
  return results;
}

if (d.revenueAction === 'clockout_rev' && d.clockOutData) {
  const c = d.clockOutData;
  // F4: 打卡紀錄格式 [下班][timestamp]（不含 Drive 連結）
  results.push({ json: { sheetAction: 'clockout_update', '日期': c.workDay, '員工姓名': c.nickname, '下班時間': c.currentTime, '打卡紀錄': '[下班][' + c.fullTimestamp + ']' } });
  results.push({ json: { sheetAction: 'revenue_update', '日期': c.workDay, '店名': c.store || '', '收攤時間': c.currentTime.substring(0,5), '新操作': '[' + c.nickname + '][收攤][' + c.revenue + '][' + c.fullTimestamp + ']', '最終結算': String(c.revenue) } });
  return results;
}
return { json: { sheetAction: 'none' } };
`, 2160, 100));
conn('更新員工狀態', '準備打卡資料');

add(ifN('需要寫打卡?', '={{ $json.sheetAction }}', 'notEquals', 'none', 2380, 100));
conn('準備打卡資料', '需要寫打卡?');

add(switchN('寫入類型路由', 'sheetAction', [
  { key: 'attendance', value: 'attendance_append' },
  { key: 'revenue', value: 'revenue_append' },
  { key: 'clockout', value: 'clockout_update' },
  { key: 'rev_update', value: 'revenue_update' }
], 2600, 100));
conn('需要寫打卡?', '寫入類型路由', 0);

// 員工工時紀錄 (上班 append) - 清理多餘欄位
add(codeN('清理工時資料', `
const d = $json;
// 注意：輸出欄位名用「打卡記錄」（無紀）以匹配 Google Sheet 欄 G
return { json: { '日期': d['日期'], '員工姓名': d['員工姓名'], '店名': d['店名'], '上班時間': d['上班時間'], '下班時間': d['下班時間'] || '', '工時': d['工時'] || '', '打卡記錄': d['打卡紀錄'] || '', '備註': d['備註'] || '' } };
`, 2820, -20));
conn('寫入類型路由', '清理工時資料', 0);

add(sheetsAppend('新增工時記錄', '員工工時紀錄', 3040, -20));
// autoMapInputData: 清理工時資料已輸出正確欄位名（打卡記錄），自動對應 Google Sheet 欄
{
  const n = nodes.find(x => x.name === '新增工時記錄');
  if (n) {
    n.parameters.columns = {
      mappingMode: 'autoMapInputData',
      value: {},
      matchingColumns: [],
      schema: [
        { id: '日期', displayName: '日期', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true, removed: false },
        { id: '員工姓名', displayName: '員工姓名', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true, removed: false },
        { id: '店名', displayName: '店名', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true, removed: false },
        { id: '上班時間', displayName: '上班時間', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true, removed: false },
        { id: '下班時間', displayName: '下班時間', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true, removed: false },
        { id: '工時', displayName: '工時', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true, removed: false },
        { id: '打卡記錄', displayName: '打卡記錄', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true, removed: false },
        { id: '備註', displayName: '備註', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true, removed: false },
        { id: 'row_number', displayName: 'row_number', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true, removed: true }
      ],
      attemptToConvertTypes: false,
      convertFieldsToString: false
    };
  }
}
conn('清理工時資料', '新增工時記錄');

// 每日業績紀錄 (上班 append) - 清理多餘欄位
add(codeN('清理業績資料', `
const d = $json;
return { json: { '日期': d['日期'], '店名': d['店名'], '開攤時間': d['開攤時間'], '收攤時間': d['收攤時間'] || '', '操作記錄': d['操作記錄'] || '', '最終結算': d['最終結算'] || '', '差異': d['差異'] || '', '備註': d['備註'] || '' } };
`, 2820, 130));
conn('寫入類型路由', '清理業績資料', 1);

add(sheetsAppend('新增業績記錄', '每日業績紀錄', 3040, 130));
conn('清理業績資料', '新增業績記錄');

// 下班: 查詢今日工時 → 計算 → 更新
add(sheetsLookup('查詢今日工時', '員工工時紀錄', [
  { lookupColumn: '員工姓名', lookupValue: '={{ $json["員工姓名"] }}' },
  { lookupColumn: '日期', lookupValue: '={{ $json["日期"] }}' }
], 2820, 280));
conn('寫入類型路由', '查詢今日工時', 2);

add(codeN('計算工時', `
const queried = $input.item.json;
const clockoutInfo = $('準備打卡資料').item.json;
let workHours = '0';
try {
  const inT = queried['上班時間'].split(':').map(Number);
  const outT = clockoutInfo['下班時間'].split(':').map(Number);
  let secs = (outT[0]*3600+outT[1]*60+(outT[2]||0)) - (inT[0]*3600+inT[1]*60+(inT[2]||0));
  if (secs < 0) secs += 86400; // 跨午夜
  // F5: 以 15 分鐘為一單位，滿 15 分鐘才計（時區 +8，時間來自前置處理）
  const units15 = Math.floor(secs / 900); // 900 秒 = 15 分鐘
  workHours = (units15 * 0.25).toFixed(2);
} catch(e) {}
// 注意：sheet 欄 G 名稱為「打卡記錄」（無紀）
const oldRecord = queried['打卡記錄'] || '';
const newRecord = clockoutInfo['打卡紀錄'];  // 來自準備打卡資料
const combined = newRecord + '\\n' + oldRecord;
return { json: { row_number: queried.row_number, '下班時間': clockoutInfo['下班時間'], '工時': workHours, '打卡記錄': combined.trim() } };
`, 3040, 280));
conn('查詢今日工時', '計算工時');

add(sheetsUpdate('更新下班記錄', '員工工時紀錄', 3260, 280));
{
  const n = nodes.find(x => x.name === '更新下班記錄');
  if (n) {
    // autoMapInputData: 計算工時輸出 { row_number, 下班時間, 工時, 打卡記錄 }
    // matchingColumns row_number 用來定位要更新的 row
    n.parameters.columns = {
      mappingMode: 'autoMapInputData',
      value: {},
      matchingColumns: ['row_number'],
      schema: [
        { id: '日期', displayName: '日期', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true, removed: false },
        { id: '員工姓名', displayName: '員工姓名', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true, removed: false },
        { id: '店名', displayName: '店名', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true, removed: false },
        { id: '上班時間', displayName: '上班時間', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true, removed: false },
        { id: '下班時間', displayName: '下班時間', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true, removed: false },
        { id: '工時', displayName: '工時', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true, removed: false },
        { id: '打卡記錄', displayName: '打卡記錄', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true, removed: false },
        { id: '備註', displayName: '備註', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true, removed: false },
        { id: 'row_number', displayName: 'row_number', required: false, defaultMatch: true, display: true, type: 'string', canBeUsedToMatch: true, removed: false }
      ],
      attemptToConvertTypes: false,
      convertFieldsToString: false
    };
  }
}
conn('計算工時', '更新下班記錄');

// === 下班業績更新：查詢當日業績 → 組裝 → 更新 ===
add(sheetsLookup('查詢當日業績', '每日業績紀錄', [
  { lookupColumn: '日期', lookupValue: '={{ $json["日期"] }}' },
  { lookupColumn: '店名', lookupValue: '={{ $json["店名"] }}' }
], 2820, 430));
conn('寫入類型路由', '查詢當日業績', 3);

add(codeN('組裝業績更新', `
const existing = $input.item.json;
const revInfo = $('寫入類型路由').item.json;
// F9: 累積操作記錄（最新在最上，換行分隔）
const oldOpRecord = existing['操作記錄'] || '';
const newEntry = revInfo['新操作'] || '';
const combinedOp = newEntry ? (oldOpRecord ? newEntry + '\\n' + oldOpRecord : newEntry) : oldOpRecord;
return { json: {
  row_number: existing.row_number,
  '收攤時間': revInfo['收攤時間'],
  '操作記錄': combinedOp,
  '最終結算': revInfo['最終結算']
} };
`, 3040, 430));
conn('查詢當日業績', '組裝業績更新');

add(sheetsUpdate('更新業績記錄', '每日業績紀錄', 3260, 430));
{
  const n = nodes.find(x => x.name === '更新業績記錄');
  if (n) n.parameters.columns.matchingColumns = ['row_number'];
}
conn('組裝業績更新', '更新業績記錄');

// ======================================================================
// 統一組裝回覆 + LINE Reply
// ======================================================================
add(codeN('組裝回覆', `
const item = $input.item.json;
const replyToken = item.replyToken;
const messages = item.replyMessages;
if (!replyToken || !messages || messages.length === 0) { return { json: { skip: true } }; }
return { json: { replyToken, messages } };
`, 1500, 500));
conn('準備更新狀態', '組裝回覆');

{
  const n = clone('LINE Reply API', 'LINE Reply', 1720, 500);
  n.parameters.url = 'https://api.line.me/v2/bot/message/reply';
  add(n);
}
conn('組裝回覆', 'LINE Reply');

// ======================================================================
// 輸出
// ======================================================================
const workflow = {
  name: 'StoreOps Bot v17 - 狀態機',
  nodes,
  connections,
  pinData: {},
  settings: { executionOrder: 'v1' },
  staticData: null,
  meta: v16.meta
};

const outPath = 'line-clock-in-bot-v17-statemachine.json';
fs.writeFileSync(outPath, JSON.stringify(workflow, null, 2), 'utf8');
console.log('✅ 成功產生 ' + outPath);
console.log('   節點數量: ' + nodes.length);
console.log('   連接數量: ' + Object.keys(connections).length);
console.log('   Sheets used: 員工管理, 員工工時紀錄, 每日業績紀錄, 分店清單');
console.log('   Drive folder: ' + DRIVE_FOLDER_ID);
