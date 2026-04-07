const fs = require('fs');

// --- Helper Functions ---
function generateNodeId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// --- Workflow Definition ---
const workflow = {
    "name": "StoreOps Bot V2",
    "nodes": [],
    "connections": {},
    "settings": {
        "executionOrder": "v1"
    }
};

// --- Nodes 1-16 (Branches A, B, C, D) are assumed present. I will re-declare them all to ensure a complete file. ---
// ... (Including all previous nodes) ...
// To save context space, I will output the *entire* file content including previous nodes.

// 1. Webhook
const webhookNode = {
    "parameters": { "httpMethod": "POST", "path": "line-hr", "responseMode": "lastNode", "options": {} },
    "name": "Line Webhook", "type": "n8n-nodes-base.webhook", "typeVersion": 1, "position": [0, 0], "id": generateNodeId()
};
workflow.nodes.push(webhookNode);

// 2. Config
const configNode = {
    "parameters": {
        "values": {
            "string": [
                { "name": "SHEET_ID", "value": "1ILgphAVTKI5KIpCJKrT5anlF4GQK8YoHf8JAtAnMN7o" },
                { "name": "SHEET_EMP", "value": "員工管理" },
                { "name": "SHEET_ATT", "value": "員工工時紀錄" },
                { "name": "SHEET_REV", "value": "每日業績紀錄" },
                { "name": "SHEET_STORE", "value": "分店清單" },
                { "name": "DRIVE_FOLDER_ID", "value": "1JM62zblO2mAmc0fO8V12c7Cih4gGqT1" },
                { "name": "LINE_ACCESS_TOKEN", "value": "YOUR_TOKEN_HERE" } // User needs to set this
            ]
        }
    },
    "name": "設定 Config", "type": "n8n-nodes-base.set", "typeVersion": 1, "position": [200, 0], "id": generateNodeId()
};
workflow.nodes.push(configNode);

// 3. Preprocessing
const preprocessingCode = `
const body = $input.first().json.body;
const events = body.events || [];
if (events.length === 0) return [{ json: { error: 'no_events' } }];
const evt = events[0];
const now = new Date();
const twOffset = 8 * 60 * 60 * 1000;
const twNow = new Date(now.getTime() + twOffset);
const workDayThreshold = 6;
let workDate = new Date(twNow);
if (twNow.getUTCHours() < workDayThreshold) workDate.setDate(workDate.getDate() - 1);
const workDay = \`\${workDate.getUTCFullYear()}/\${String(workDate.getUTCMonth()+1).padStart(2,'0')}/\${String(workDate.getUTCDate()).padStart(2,'0')}\`;
const shortDate = \`\${String(workDate.getUTCMonth()+1).padStart(2,'0')}/\${String(workDate.getUTCDate()).padStart(2,'0')}\`;
const currentTime = \`\${String(twNow.getUTCHours()).padStart(2,'0')}:\${String(twNow.getUTCMinutes()).padStart(2,'0')}:\${String(twNow.getUTCSeconds()).padStart(2,'0')}\`;
const msgType = evt.message?.type || evt.type;
const replyToken = evt.replyToken;
const userId = evt.source?.userId || '';
let msgText = ''; let msgId = ''; let postbackData = '';
if (msgType === 'message' && evt.message.type === 'text') { msgText = evt.message.text || ''; msgId = evt.message.id; }
else if (msgType === 'message' && evt.message.type === 'image') { msgId = evt.message.id; }
else if (evt.type === 'postback') { postbackData = evt.postback?.data || ''; }
const pbParams = {};
if (postbackData) { postbackData.split('&').forEach(p => { const [k, v] = p.split('='); if (k && v) pbParams[k] = decodeURIComponent(v); }); }
return [{ json: { msgType, msgText, msgId, postbackData, postbackAction: pbParams.action || '', postbackValue: pbParams.value || '', replyToken, userId, workDay, shortDate, currentTime, timestamp: now.getTime() } }];
`;
const preprocessingNode = { "parameters": { "jsCode": preprocessingCode }, "name": "統一前置處理", "type": "n8n-nodes-base.code", "typeVersion": 1, "position": [400, 0], "id": generateNodeId() };
workflow.nodes.push(preprocessingNode);

// 4. Get Employee
const getEmployeeNode = {
    "parameters": { "operation": "lookup", "documentId": "={{ $node[\"設定 Config\"].json[\"SHEET_ID\"] }}", "sheetName": "={{ $node[\"設定 Config\"].json[\"SHEET_EMP\"] }}", "lookupColumn": "UserID", "lookupValue": "={{ $json.userId }}", "options": {} },
    "name": "查詢員工管理", "type": "n8n-nodes-base.googleSheets", "typeVersion": 1, "position": [600, 0], "id": generateNodeId(), "credentials": { "googleApi": { "id": "google-sheets-cred-id", "name": "Google Sheets Account" } }
};
workflow.nodes.push(getEmployeeNode);

// 5. Parse Status
const parseStatusCode = `
const prev = $node["統一前置處理"].json;
const sheetData = $input.first()?.json || {}; 
const isNewUser = !sheetData.UserID; 
let currentStep = sheetData.current_step || 'IDLE';
let route = 'IDLE';
if (isNewUser) { route = 'new_user'; } else {
  let tempData = {};
  if (typeof sheetData.temp_data === 'string' && sheetData.temp_data.startsWith('{')) { try { tempData = JSON.parse(sheetData.temp_data); } catch (e) {} }
  if (['WAIT_LANG', 'WAIT_IDCARD'].includes(currentStep)) { route = 'new_user'; } else { route = currentStep; }
}
return [{ json: { ...prev, emp: sheetData, route, currentStep, isNewUser } }];
`;
const parseStatusNode = { "parameters": { "jsCode": parseStatusCode }, "name": "狀態解析", "type": "n8n-nodes-base.code", "typeVersion": 1, "position": [800, 0], "id": generateNodeId() };
workflow.nodes.push(parseStatusNode);

// 6. Switch
const switchNode = {
    "parameters": { "dataType": "string", "value1": "={{ $json.route }}", "rules": { "rules": [{ "value2": "new_user", "outputKey": "new_user" }, { "value2": "IDLE", "outputKey": "IDLE" }, { "value2": "WAIT_STORE", "outputKey": "WAIT_STORE" }, { "value2": "WAIT_REVENUE", "outputKey": "WAIT_REVENUE" }, { "value2": "WAIT_PHOTO", "outputKey": "WAIT_PHOTO" }] } },
    "name": "狀態路由 (Switch)", "type": "n8n-nodes-base.switch", "typeVersion": 1, "position": [1000, 0], "id": generateNodeId()
};
workflow.nodes.push(switchNode);


// --- Branch A ---
const registrationCode = `const d = $input.first().json; // ... (same as before) ...
const isNewUser = d.isNewUser; const step = d.currentStep; const postbackAction = d.postbackAction;
let reply = {}; let sheetOp = {};
if (isNewUser && step === 'IDLE') { 
    reply = { type: 'text', text: '👋 歡迎加入！請選擇您的語言：', quickReply: { items: [ { type: 'action', action: { type: 'postback', label: '🇹🇼 中文', data: 'action=lang&value=zh-TW' } }, { type: 'action', action: { type: 'postback', label: '🇻🇳 Tiếng Việt', data: 'action=lang&value=vi-VN' } } ] } };
    sheetOp = { operation: 'append', content: { 'UserID': d.userId, '暱稱': 'New Member', 'current_step': 'WAIT_LANG', 'temp_data': '{}' } };
} else if (step === 'WAIT_LANG' && postbackAction === 'lang') {
    const lang = d.postbackValue;
    reply = { type: 'text', text: (lang === 'zh-TW') ? '✅ 語言設定完成。請上傳您的證件照片：' : '✅ Đã cài đặt ngôn ngữ. Vui lòng tải lên ảnh CMND:' };
    sheetOp = { operation: 'update', key: d.userId, content: { 'Language': lang, 'current_step': 'WAIT_IDCARD' } };
} else if (step === 'WAIT_IDCARD' && d.msgType === 'image') {
    const lang = d.emp.Language || 'zh-TW';
    reply = { type: 'text', text: (lang === 'zh-TW') ? '🎉 註冊完成！您可以開始打卡了。' : '🎉 Đăng ký hoàn tất! Bạn có thể bắt đầu chấm công.' };
    sheetOp = { operation: 'update', key: d.userId, content: { 'current_step': 'IDLE', '入職日': d.workDay }, uploadDrive: true };
} else { reply = { type: 'text', text: '請依照指示操作 / Please follow instructions.' }; }
return [{ json: { ...d, reply, sheetOp } }];
`;
const registrationLogicNode = { "parameters": { "jsCode": registrationCode }, "name": "註冊邏輯", "type": "n8n-nodes-base.code", "typeVersion": 1, "position": [1200, -200], "id": generateNodeId() };
workflow.nodes.push(registrationLogicNode);
const regSwitchNode = { "parameters": { "dataType": "boolean", "value1": "={{ $json.sheetOp.uploadDrive }}", "rules": { "rules": [{ "value2": true, "outputKey": "upload" }, { "value2": false, "outputKey": "no_upload" }] } }, "name": "註冊分流", "type": "n8n-nodes-base.switch", "typeVersion": 1, "position": [1400, -200], "id": generateNodeId() };
workflow.nodes.push(regSwitchNode);
const driveUploadNode = { "parameters": { "authentication": "googleDriveOAuth2", "fileContent": "={{ $binary.data }}", "name": "={{ '[入職][' + $json.emp['暱稱'] + '] ' + $json.workDay + '.jpg' }}", "parents": ["={{ $node[\"設定 Config\"].json[\"DRIVE_FOLDER_ID\"] }}"], "options": {} }, "name": "上傳證件照", "type": "n8n-nodes-base.googleDrive", "typeVersion": 1, "position": [1600, -300], "id": generateNodeId(), "credentials": { "googleDriveOAuth2": { "id": "google-drive-cred-id", "name": "Google Drive Account" } } };
workflow.nodes.push(driveUploadNode);
const regSheetRouterNode = { "parameters": { "dataType": "string", "value1": "={{ $json.sheetOp.operation }}", "rules": { "rules": [{ "value2": "append", "outputKey": "append" }, { "value2": "update", "outputKey": "update" }] } }, "name": "註冊寫入分流", "type": "n8n-nodes-base.switch", "typeVersion": 1, "position": [1800, -200], "id": generateNodeId() };
workflow.nodes.push(regSheetRouterNode);
const appendEmpNode = { "parameters": { "operation": "append", "documentId": "={{ $node[\"設定 Config\"].json[\"SHEET_ID\"] }}", "sheetName": "={{ $node[\"設定 Config\"].json[\"SHEET_EMP\"] }}", "options": {} }, "name": "建立新員工", "type": "n8n-nodes-base.googleSheets", "typeVersion": 1, "position": [2000, -300], "id": generateNodeId(), "credentials": { "googleApi": { "id": "google-sheets-cred-id", "name": "Google Sheets Account" } } };
workflow.nodes.push(appendEmpNode);
const updateEmpNode = { "parameters": { "operation": "update", "documentId": "={{ $node[\"設定 Config\"].json[\"SHEET_ID\"] }}", "sheetName": "={{ $node[\"設定 Config\"].json[\"SHEET_EMP\"] }}", "key": "UserID", "keyValue": "={{ $json.userId }}", "options": {} }, "name": "更新員工資料", "type": "n8n-nodes-base.googleSheets", "typeVersion": 1, "position": [2000, -100], "id": generateNodeId(), "credentials": { "googleApi": { "id": "google-sheets-cred-id", "name": "Google Sheets Account" } } };
workflow.nodes.push(updateEmpNode);

// --- Branch B ---
const checkAttNode = { "parameters": { "operation": "get", "documentId": "={{ $node[\"設定 Config\"].json[\"SHEET_ID\"] }}", "sheetName": "={{ $node[\"設定 Config\"].json[\"SHEET_ATT\"] }}", "filtersUI": { "values": [{ "lookupColumn": "日期", "lookupValue": "={{ $json.workDay }}" }, { "lookupColumn": "員工姓名", "lookupValue": "={{ $json.emp['暱稱'] }}" }] }, "options": {} }, "name": "查詢今日工時", "type": "n8n-nodes-base.googleSheets", "typeVersion": 1, "position": [1200, 0], "id": generateNodeId(), "credentials": { "googleApi": { "id": "google-sheets-cred-id", "name": "Google Sheets Account" } } };
workflow.nodes.push(checkAttNode);
const idleLogicCode = `const d = $input.first().json; // ... (same as before) ...
const ctx = $node["狀態解析"].json; const msgText = ctx.msgText; const attendanceRows = $input.all().map(i => i.json).filter(r => r['日期'] === ctx.workDay);
const hasRecord = attendanceRows.length > 0; const lastRecord = hasRecord ? attendanceRows[attendanceRows.length - 1] : null;
const isClockOut = hasRecord && (!lastRecord['下班時間']);
let action = 'ignore'; let reply = {}; let temp = {};
if (msgText === '打卡' || msgText === 'Chấm công') { if (!hasRecord) { action = 'clockin'; } else if (isClockOut) { action = 'clockout'; temp = { attRow: lastRecord.row_number, action: 'clockout' }; } else { reply = { type: 'text', text: '您今日已完成打卡！' }; } }
return [{ json: { ...ctx, action, temp, reply } }];
`;
const idleLogicNode = { "parameters": { "jsCode": idleLogicCode }, "name": "IDLE 判斷", "type": "n8n-nodes-base.code", "typeVersion": 1, "position": [1400, 0], "id": generateNodeId() };
workflow.nodes.push(idleLogicNode);
const idleSwitchNode = { "parameters": { "dataType": "string", "value1": "={{ $json.action }}", "rules": { "rules": [{ "value2": "clockin", "outputKey": "clockin" }, { "value2": "clockout", "outputKey": "clockout" }, { "value2": "ignore", "outputKey": "ignore" }] } }, "name": "IDLE 分流", "type": "n8n-nodes-base.switch", "typeVersion": 1, "position": [1600, 0], "id": generateNodeId() };
workflow.nodes.push(idleSwitchNode);
const readStoreNode = { "parameters": { "operation": "get", "documentId": "={{ $node[\"設定 Config\"].json[\"SHEET_ID\"] }}", "sheetName": "={{ $node[\"設定 Config\"].json[\"SHEET_STORE\"] }}", "options": {} }, "name": "讀取分店清單", "type": "n8n-nodes-base.googleSheets", "typeVersion": 1, "position": [1800, 0], "id": generateNodeId(), "credentials": { "googleApi": { "id": "google-sheets-cred-id", "name": "Google Sheets Account" } } };
workflow.nodes.push(readStoreNode);
const idleReplyPrepCode = `const action = $node["IDLE 判斷"].json.action; // ... (same as before) ...
const ctx = $node["IDLE 判斷"].json; const lang = ctx.emp.Language || 'zh-TW'; let reply = {}; let nextStep = 'IDLE'; let nextTemp = ctx.temp || {};
if (action === 'clockin') { const stores = $input.all().map(i => i.json['分店清單']).filter(s => s); const items = stores.map(s => ({ type: 'action', action: { type: 'postback', label: s, data: 'action=select_store&value=' + s } })); reply = { type: 'text', text: (lang === 'zh-TW') ? '請選擇門市：' : 'Vui lòng chọn cửa hàng:', quickReply: { items } }; nextStep = 'WAIT_STORE'; nextTemp = { action: 'clockin' }; } else if (action === 'clockout') { reply = { type: 'text', text: (lang === 'zh-TW') ? '請輸入今日業績：' : 'Vui lòng nhập doanh thu hôm nay:' }; nextStep = 'WAIT_REVENUE'; }
return [{ json: { ...ctx, reply, updateStatus: { current_step: nextStep, temp_data: JSON.stringify(nextTemp) } } }];
`;
const idleReplyPrepNode = { "parameters": { "jsCode": idleReplyPrepCode }, "name": "IDLE 回覆準備", "type": "n8n-nodes-base.code", "typeVersion": 1, "position": [2000, 100], "id": generateNodeId() };
workflow.nodes.push(idleReplyPrepNode);
const updateStatusIdleNode = { "parameters": { "operation": "update", "documentId": "={{ $node[\"設定 Config\"].json[\"SHEET_ID\"] }}", "sheetName": "={{ $node[\"設定 Config\"].json[\"SHEET_EMP\"] }}", "key": "UserID", "keyValue": "={{ $json.userId }}", "options": {} }, "name": "更新員工狀態", "type": "n8n-nodes-base.googleSheets", "typeVersion": 1, "position": [2200, 100], "id": generateNodeId(), "credentials": { "googleApi": { "id": "google-sheets-cred-id", "name": "Google Sheets Account" } } };
workflow.nodes.push(updateStatusIdleNode);

// --- Branch C ---
const lookupDailyRevNode = { "parameters": { "operation": "get", "documentId": "={{ $node[\"設定 Config\"].json[\"SHEET_ID\"] }}", "sheetName": "={{ $node[\"設定 Config\"].json[\"SHEET_REV\"] }}", "filtersUI": { "values": [{ "lookupColumn": "日期", "lookupValue": "={{ $json.shortDate }}" }, { "lookupColumn": "店名", "lookupValue": "={{ $json.postbackValue }}" }] }, "options": {} }, "name": "查詢分店業績", "type": "n8n-nodes-base.googleSheets", "typeVersion": 1, "position": [1200, 300], "id": generateNodeId(), "credentials": { "googleApi": { "id": "google-sheets-cred-id", "name": "Google Sheets Account" } } };
workflow.nodes.push(lookupDailyRevNode);
const identityLogicCode = `const d = $input.first().json; // ... (same as before) ...
const allRows = $input.all(); const hasRevRecord = allRows.length > 0 && allRows[0].json['開攤時間']; const revRecord = hasRevRecord ? allRows[0].json : null;
const ctx = $node["狀態解析"].json; const selectedStore = ctx.postbackValue; const lang = ctx.emp.Language || 'zh-TW';
const now = new Date(); let isHelper = false; let nextStep = ''; let reply = {}; let temp = {}; try { temp = JSON.parse(ctx.emp.temp_data || '{}'); } catch(e){}
if (!hasRevRecord) { nextStep = 'WAIT_PHOTO'; temp.store = selectedStore; temp.role = 'opener'; reply = { type: 'text', text: (lang === 'zh-TW') ? '📸 請上傳上班照片 (你是首位開攤人員)' : '📸 Vui lòng tải ảnh chấm công (Bạn là người mở cửa)' }; } else { const [hh, mm] = revRecord['開攤時間'].split(':'); const openTime = new Date(now); openTime.setHours(parseInt(hh), parseInt(mm)); const diff = now - openTime; if (diff <= 3600000) { isHelper = true; nextStep = 'WAIT_PHOTO'; temp.store = selectedStore; temp.role = 'helper'; reply = { type: 'text', text: (lang === 'zh-TW') ? '📸 請上傳上班照片 (小幫手模式 - 免業績)' : '📸 Vui lòng tải ảnh chấm công (Chế độ trợ lý)' }; } else { nextStep = 'WAIT_REVENUE'; temp.store = selectedStore; temp.role = 'midshift'; temp.revRow = revRecord.row_number; reply = { type: 'text', text: (lang === 'zh-TW') ? '💰 請輸入當前櫃台業績：' : '💰 Vui lòng nhập doanh thu hiện tại:' }; } }
return [{ json: { ...ctx, reply, updateStatus: { current_step: nextStep, temp_data: JSON.stringify(temp) } } }];
`;
const identityLogicNode = { "parameters": { "jsCode": identityLogicCode }, "name": "身分判斷與路由", "type": "n8n-nodes-base.code", "typeVersion": 1, "position": [1400, 300], "id": generateNodeId() };
workflow.nodes.push(identityLogicNode);
const updateStatusInNode = { "parameters": { "operation": "update", "documentId": "={{ $node[\"設定 Config\"].json[\"SHEET_ID\"] }}", "sheetName": "={{ $node[\"設定 Config\"].json[\"SHEET_EMP\"] }}", "key": "UserID", "keyValue": "={{ $json.userId }}", "options": {} }, "name": "更新狀態 (上班)", "type": "n8n-nodes-base.googleSheets", "typeVersion": 1, "position": [1600, 300], "id": generateNodeId(), "credentials": { "googleApi": { "id": "google-sheets-cred-id", "name": "Google Sheets Account" } } };
workflow.nodes.push(updateStatusInNode);

// --- Branch D ---
const verifyRevCode = `const ctx = $node["狀態解析"].json; // ... (same as before) ...
const msgText = ctx.msgText; const lang = ctx.emp.Language || 'zh-TW';
let isValid = /^\\d+$/.test(msgText); let reply = {}; let nextStep = ctx.emp.current_step; let temp = {}; try { temp = JSON.parse(ctx.emp.temp_data || '{}'); } catch(e){}
if (isValid) { temp.revenue = parseInt(msgText); nextStep = 'WAIT_PHOTO'; reply = { type: 'text', text: (lang === 'zh-TW') ? '📸 請上傳照片：' : '📸 Vui lòng tải ảnh lên:' }; } else { reply = { type: 'text', text: (lang === 'zh-TW') ? '❌ 請輸入有效的數字' : '❌ Vui lòng nhập số hợp lệ' }; }
return [{ json: { ...ctx, reply, updateStatus: { current_step: nextStep, temp_data: JSON.stringify(temp) } } }];
`;
const verifyRevNode = { "parameters": { "jsCode": verifyRevCode }, "name": "業績驗證", "type": "n8n-nodes-base.code", "typeVersion": 1, "position": [1200, 500], "id": generateNodeId() };
workflow.nodes.push(verifyRevNode);
const updateStatusRevNode = { "parameters": { "operation": "update", "documentId": "={{ $node[\"設定 Config\"].json[\"SHEET_ID\"] }}", "sheetName": "={{ $node[\"設定 Config\"].json[\"SHEET_EMP\"] }}", "key": "UserID", "keyValue": "={{ $json.userId }}", "options": {} }, "name": "更新狀態 (業績後)", "type": "n8n-nodes-base.googleSheets", "typeVersion": 1, "position": [1400, 500], "id": generateNodeId(), "credentials": { "googleApi": { "id": "google-sheets-cred-id", "name": "Google Sheets Account" } } };
workflow.nodes.push(updateStatusRevNode);


// --- Branch E: Photo Finalize ---

const uploadPhotoNode = {
    "parameters": {
        "authentication": "googleDriveOAuth2",
        "fileContent": "={{ $binary.data }}",
        "name": "={{ '[' + ($json.temp_data.action === 'clockin' ? '上班' : '下班') + '][' + $json.emp['暱稱'] + '] ' + $json.workDay + ' ' + $json.currentTime + '.jpg' }}",
        "parents": ["={{ $node[\"設定 Config\"].json[\"DRIVE_FOLDER_ID\"] }}"],
        "options": {}
    },
    "name": "上傳工作照",
    "type": "n8n-nodes-base.googleDrive",
    "typeVersion": 1,
    "position": [1200, 700],
    "id": generateNodeId(),
    "credentials": { "googleDriveOAuth2": { "id": "google-drive-cred-id", "name": "Google Drive Account" } }
};
workflow.nodes.push(uploadPhotoNode);

const sheetOpPrepCode = `
const ctx = $input.first().json; // From Upload Photo
let temp = {}; try { temp = JSON.parse(ctx.emp.temp_data || '{}'); } catch(e){}
const action = temp.action;
const role = temp.role;
let route = '';
if (action === 'clockin') {
    if (role === 'opener') route = 'opener';
    else if (role === 'midshift') route = 'midshift';
    else route = 'helper'; // helper
} else {
    route = 'clockout';
}

// Prepare Sheet Payloads
// For simplicity, we just route, and let Sheet nodes use expressions based on ctx & temp.
return [{
    json: {
        ...ctx,
        route,
        temp
    }
}];
`;

const sheetOpPrepNode = { "parameters": { "jsCode": sheetOpPrepCode }, "name": "寫入資料準備", "type": "n8n-nodes-base.code", "typeVersion": 1, "position": [1400, 700], "id": generateNodeId() };
workflow.nodes.push(sheetOpPrepNode);

const writeSwitchNode = {
    "parameters": {
        "dataType": "string",
        "value1": "={{ $json.route }}",
        "rules": {
            "rules": [
                { "value2": "opener", "outputKey": "opener" },
                { "value2": "midshift", "outputKey": "midshift" },
                { "value2": "helper", "outputKey": "helper" },
                { "value2": "clockout", "outputKey": "clockout" }
            ]
        }
    },
    "name": "寫入分流",
    "type": "n8n-nodes-base.switch",
    "typeVersion": 1,
    "position": [1600, 700],
    "id": generateNodeId()
};
workflow.nodes.push(writeSwitchNode);

// Helper Nodes for Sheet Ops
// Opener: Append Att, Append Rev
const openerAttNode = { "parameters": { "operation": "append", "documentId": "={{ $node[\"設定 Config\"].json[\"SHEET_ID\"] }}", "sheetName": "={{ $node[\"設定 Config\"].json[\"SHEET_ATT\"] }}", "options": {} }, "name": "建立工時 (Open)", "type": "n8n-nodes-base.googleSheets", "typeVersion": 1, "position": [1800, 600], "id": generateNodeId(), "credentials": { "googleApi": { "id": "google-sheets-cred-id", "name": "Google Sheets Account" } } };
workflow.nodes.push(openerAttNode);
const openerRevNode = { "parameters": { "operation": "append", "documentId": "={{ $node[\"設定 Config\"].json[\"SHEET_ID\"] }}", "sheetName": "={{ $node[\"設定 Config\"].json[\"SHEET_REV\"] }}", "options": {} }, "name": "建立業績 (Open)", "type": "n8n-nodes-base.googleSheets", "typeVersion": 1, "position": [2000, 600], "id": generateNodeId(), "credentials": { "googleApi": { "id": "google-sheets-cred-id", "name": "Google Sheets Account" } } };
workflow.nodes.push(openerRevNode);

// Mid: Append Att, Update Rev
const midAttNode = { "parameters": { "operation": "append", "documentId": "={{ $node[\"設定 Config\"].json[\"SHEET_ID\"] }}", "sheetName": "={{ $node[\"設定 Config\"].json[\"SHEET_ATT\"] }}", "options": {} }, "name": "建立工時 (Mid)", "type": "n8n-nodes-base.googleSheets", "typeVersion": 1, "position": [1800, 700], "id": generateNodeId(), "credentials": { "googleApi": { "id": "google-sheets-cred-id", "name": "Google Sheets Account" } } };
workflow.nodes.push(midAttNode);
const midRevNode = { "parameters": { "operation": "update", "documentId": "={{ $node[\"設定 Config\"].json[\"SHEET_ID\"] }}", "sheetName": "={{ $node[\"設定 Config\"].json[\"SHEET_REV\"] }}", "key": "row_number", "keyValue": "={{ $json.temp.revRow }}", "options": {} }, "name": "更新業績 (Mid)", "type": "n8n-nodes-base.googleSheets", "typeVersion": 1, "position": [2000, 700], "id": generateNodeId(), "credentials": { "googleApi": { "id": "google-sheets-cred-id", "name": "Google Sheets Account" } } };
workflow.nodes.push(midRevNode);

// Helper: Append Att
const helperAttNode = { "parameters": { "operation": "append", "documentId": "={{ $node[\"設定 Config\"].json[\"SHEET_ID\"] }}", "sheetName": "={{ $node[\"設定 Config\"].json[\"SHEET_ATT\"] }}", "options": {} }, "name": "建立工時 (Help)", "type": "n8n-nodes-base.googleSheets", "typeVersion": 1, "position": [1800, 800], "id": generateNodeId(), "credentials": { "googleApi": { "id": "google-sheets-cred-id", "name": "Google Sheets Account" } } };
workflow.nodes.push(helperAttNode);

// Clockout: Update Att, Update Rev
const outAttNode = { "parameters": { "operation": "update", "documentId": "={{ $node[\"設定 Config\"].json[\"SHEET_ID\"] }}", "sheetName": "={{ $node[\"設定 Config\"].json[\"SHEET_ATT\"] }}", "key": "row_number", "keyValue": "={{ $json.temp.attRow }}", "options": {} }, "name": "更新工時 (Out)", "type": "n8n-nodes-base.googleSheets", "typeVersion": 1, "position": [1800, 900], "id": generateNodeId(), "credentials": { "googleApi": { "id": "google-sheets-cred-id", "name": "Google Sheets Account" } } };
workflow.nodes.push(outAttNode);
const outRevNode = { "parameters": { "operation": "update", "documentId": "={{ $node[\"設定 Config\"].json[\"SHEET_ID\"] }}", "sheetName": "={{ $node[\"設定 Config\"].json[\"SHEET_REV\"] }}", "key": "row_number", "keyValue": "={{ $json.temp.revRow }}", "options": {} }, "name": "更新業績 (Out)", "type": "n8n-nodes-base.googleSheets", "typeVersion": 1, "position": [2000, 900], "id": generateNodeId(), "credentials": { "googleApi": { "id": "google-sheets-cred-id", "name": "Google Sheets Account" } } };
workflow.nodes.push(outRevNode);

// Reset Status
const resetStatusNode = {
    "parameters": {
        "operation": "update",
        "documentId": "={{ $node[\"設定 Config\"].json[\"SHEET_ID\"] }}",
        "sheetName": "={{ $node[\"設定 Config\"].json[\"SHEET_EMP\"] }}",
        "key": "UserID",
        "keyValue": "={{ $json.userId }}",
        "options": {}
    },
    "name": "重置狀態 (IDLE)",
    "type": "n8n-nodes-base.googleSheets",
    "typeVersion": 1,
    "position": [2200, 750],
    "id": generateNodeId(),
    "credentials": { "googleApi": { "id": "google-sheets-cred-id", "name": "Google Sheets Account" } }
};
workflow.nodes.push(resetStatusNode);


// --- Reply Layer ---
const replyNode = {
    "parameters": {
        "method": "POST",
        "url": "https://api.line.me/v2/bot/message/reply",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendHeaders": true,
        "headerParameters": {
            "parameters": [
                { "name": "Authorization", "value": "={{ 'Bearer ' + $node[\"設定 Config\"].json[\"LINE_ACCESS_TOKEN\"] }}" },
                { "name": "Content-Type", "value": "application/json" }
            ]
        },
        "sendBody": true,
        "bodyParameters": {
            "parameters": [
                { "name": "replyToken", "value": "={{ $json.replyToken }}" },
                { "name": "messages", "value": "={{ [$json.reply] }}" } // Array of 1 message
            ]
        },
        "options": {}
    },
    "name": "Reply To Line",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 1,
    "position": [2400, 0],
    "id": generateNodeId(),
    "credentials": { "httpHeaderAuth": { "id": "line-api-cred-id", "name": "LINE API Auth" } }
};
workflow.nodes.push(replyNode);


// --- Connection Logic (Final) ---
// I'll skip re-typing all connections here but in the file write I MUST include them all. 
// Assumption: Connections map defines the flow.
// I will populate the connections object fully in the write_to_file call.
workflow.connections = {
    // Layer 1 & 2
    "Line Webhook": { "main": [[{ "node": "設定 Config", "type": "main", "index": 0 }]] },
    "設定 Config": { "main": [[{ "node": "統一前置處理", "type": "main", "index": 0 }]] },
    "統一前置處理": { "main": [[{ "node": "查詢員工管理", "type": "main", "index": 0 }]] },
    "查詢員工管理": { "main": [[{ "node": "狀態解析", "type": "main", "index": 0 }]] },
    "狀態解析": { "main": [[{ "node": "狀態路由 (Switch)", "type": "main", "index": 0 }]] },

    // Branch A
    "狀態路由 (Switch)": {
        "main": [
            [{ "node": "註冊邏輯", "type": "main", "index": 0 }],
            [{ "node": "查詢今日工時", "type": "main", "index": 0 }],
            [{ "node": "查詢分店業績", "type": "main", "index": 0 }],
            [{ "node": "業績驗證", "type": "main", "index": 0 }],
            [{ "node": "上傳工作照", "type": "main", "index": 0 }]
        ]
    },
    "註冊邏輯": { "main": [[{ "node": "註冊分流", "type": "main", "index": 0 }]] },
    "註冊分流": { "main": [[{ "node": "上傳證件照", "type": "main", "index": 0 }], [{ "node": "註冊寫入分流", "type": "main", "index": 0 }]] },
    "上傳證件照": { "main": [[{ "node": "註冊寫入分流", "type": "main", "index": 0 }]] }, // Re-using upload node for both ID and Work? No, Work Upload is separate.
    // Wait, "上傳證件照" is Node 9. "上傳工作照" is Node 17.
    // Reg Branch uses "上傳證件照".

    "註冊寫入分流": { "main": [[{ "node": "建立新員工", "type": "main", "index": 0 }], [{ "node": "更新員工資料", "type": "main", "index": 0 }]] },
    "建立新員工": { "main": [[{ "node": "Reply To Line", "type": "main", "index": 0 }]] },
    "更新員工資料": { "main": [[{ "node": "Reply To Line", "type": "main", "index": 0 }]] },

    // Branch B
    "查詢今日工時": { "main": [[{ "node": "IDLE 判斷", "type": "main", "index": 0 }]] },
    "IDLE 判斷": { "main": [[{ "node": "IDLE 分流", "type": "main", "index": 0 }]] },
    "IDLE 分流": { "main": [[{ "node": "讀取分店清單", "type": "main", "index": 0 }], [{ "node": "IDLE 回覆準備", "type": "main", "index": 0 }], []] },
    "讀取分店清單": { "main": [[{ "node": "IDLE 回覆準備", "type": "main", "index": 0 }]] },
    "IDLE 回覆準備": { "main": [[{ "node": "更新員工狀態", "type": "main", "index": 0 }]] },
    "更新員工狀態": { "main": [[{ "node": "Reply To Line", "type": "main", "index": 0 }]] },

    // Branch C
    "查詢分店業績": { "main": [[{ "node": "身分判斷與路由", "type": "main", "index": 0 }]] },
    "身分判斷與路由": { "main": [[{ "node": "更新狀態 (上班)", "type": "main", "index": 0 }]] },
    "更新狀態 (上班)": { "main": [[{ "node": "Reply To Line", "type": "main", "index": 0 }]] },

    // Branch D
    "業績驗證": { "main": [[{ "node": "更新狀態 (業績後)", "type": "main", "index": 0 }]] },
    "更新狀態 (業績後)": { "main": [[{ "node": "Reply To Line", "type": "main", "index": 0 }]] },

    // Branch E
    "上傳工作照": { "main": [[{ "node": "寫入資料準備", "type": "main", "index": 0 }]] },
    "寫入資料準備": { "main": [[{ "node": "寫入分流", "type": "main", "index": 0 }]] },
    "寫入分流": {
        "main": [
            [{ "node": "建立工時 (Open)", "type": "main", "index": 0 }],
            [{ "node": "建立工時 (Mid)", "type": "main", "index": 0 }],
            [{ "node": "建立工時 (Help)", "type": "main", "index": 0 }],
            [{ "node": "更新工時 (Out)", "type": "main", "index": 0 }]
        ]
    },
    "建立工時 (Open)": { "main": [[{ "node": "建立業績 (Open)", "type": "main", "index": 0 }]] },
    "建立業績 (Open)": { "main": [[{ "node": "重置狀態 (IDLE)", "type": "main", "index": 0 }]] },
    "建立工時 (Mid)": { "main": [[{ "node": "更新業績 (Mid)", "type": "main", "index": 0 }]] },
    "更新業績 (Mid)": { "main": [[{ "node": "重置狀態 (IDLE)", "type": "main", "index": 0 }]] },
    "建立工時 (Help)": { "main": [[{ "node": "重置狀態 (IDLE)", "type": "main", "index": 0 }]] },
    "更新工時 (Out)": { "main": [[{ "node": "更新業績 (Out)", "type": "main", "index": 0 }]] },
    "更新業績 (Out)": { "main": [[{ "node": "重置狀態 (IDLE)", "type": "main", "index": 0 }]] },
    "重置狀態 (IDLE)": { "main": [[{ "node": "Reply To Line", "type": "main", "index": 0 }]] }

};

// --- Output ---
fs.writeFileSync('storeops-bot-v2.json', JSON.stringify(workflow, null, 2));
console.log('Workflow JSON generated: storeops-bot-v2.json');
