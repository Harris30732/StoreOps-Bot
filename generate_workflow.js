const fs = require('fs');

const WEBOOK_URL = 'line-hr';
const SHEET_ID = '1ILgphAVTKI5KIpCJKrT5anlF4GQK8YoHf8JAtAnMN7o'; // 替換為實際的 Google Sheet ID
const LINE_CRED = 'lineApi';
const SHEET_CRED = 'googleSheetsOAuth2Api';
const DRIVE_CRED = 'googleDriveOAuth2Api';

const nodes = [];
const connections = {};

let posX = 0;
let posY = 0;

function addNode(name, type, params = {}, options = {}) {
    const node = {
        parameters: params,
        id: `uuid-${name.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name: name,
        type: type,
        typeVersion: options.version || 1,
        position: [posX, posY]
    };

    if (options.webhookId) node.webhookId = options.webhookId;
    if (options.credentials) node.credentials = options.credentials;
    if (options.alwaysOutputData) node.alwaysOutputData = options.alwaysOutputData;

    nodes.push(node);
    return name;
}

function connect(sourceName, targetName, sourceIndex = 0, targetIndex = 0) {
    if (!connections[sourceName]) {
        connections[sourceName] = { main: [] };
    }

    while (connections[sourceName].main.length <= sourceIndex) {
        connections[sourceName].main.push([]);
    }

    connections[sourceName].main[sourceIndex].push({
        node: targetName,
        type: "main",
        index: targetIndex
    });
}

// -------------------------------------------------------------
// 第 1 階段：前置作業 (Webhook -> 擷取資訊 -> 統一前置處理 -> 查詢員工表 -> 判斷有無員工)
// -------------------------------------------------------------
posX = 0; posY = 400;
const nWebhook = addNode('1. LINE Webhook', 'n8n-nodes-base.webhook', {
    httpMethod: 'POST', path: WEBOOK_URL, responseMode: 'lastNode', options: {}
}, { version: 2, webhookId: 'line-webhook' });

posX += 200;
const nPreprocessSet = addNode('2. 擷取訊息資訊', 'n8n-nodes-base.set', {
    assignments: {
        assignments: [
            { id: '1', name: 'userId', value: '={{ $json.body.events[0].source.userId }}', type: 'string' },
            { id: '2', name: 'replyToken', value: '={{ $json.body.events[0].replyToken || "" }}', type: 'string' },
            { id: '3', name: 'msgType', value: '={{ $json.body.events[0].message?.type || $json.body.events[0].type }}', type: 'string' },
            { id: '4', name: 'msgText', value: '={{ $json.body.events[0].message?.text || "" }}', type: 'string' },
            { id: '5', name: 'msgId', value: '={{ $json.body.events[0].message?.id || "" }}', type: 'string' },
            { id: '6', name: 'postbackData', value: '={{ $json.body.events[0].postback?.data || "" }}', type: 'string' }
        ]
    }, options: {}
}, { version: 3.4 });

posX += 200;
const nPreprocessCode = addNode('3. 日期時間處理', 'n8n-nodes-base.code', {
    jsCode: `
const now = new Date();
const twOffset = 8 * 60 * 60 * 1000;
const twNow = new Date(now.getTime() + twOffset);

const workDayThreshold = 6;
let workDate = new Date(twNow);
if (twNow.getUTCHours() < workDayThreshold) {
  workDate.setDate(workDate.getDate() - 1);
}

const workDay = \`\${workDate.getUTCFullYear()}/\${String(workDate.getUTCMonth()+1).padStart(2,'0')}/\${String(workDate.getUTCDate()).padStart(2,'0')}\`;
const shortDate = \`\${String(workDate.getUTCMonth()+1).padStart(2,'0')}/\${String(workDate.getUTCDate()).padStart(2,'0')}\`;
const currentTime = \`\${String(twNow.getUTCHours()).padStart(2,'0')}:\${String(twNow.getUTCMinutes()).padStart(2,'0')}:\${String(twNow.getUTCSeconds()).padStart(2,'0')}\`;
const realDate = \`\${twNow.getUTCFullYear()}/\${String(twNow.getUTCMonth()+1).padStart(2,'0')}/\${String(twNow.getUTCDate()).padStart(2,'0')}\`;
const fullTimestamp = \`\${realDate} \${currentTime}\`;

const d = $input.item.json;
const pbParams = {};
if (d.postbackData) {
  d.postbackData.split('&').forEach(p => { 
    const [k, v] = p.split('='); 
    if (k && v) pbParams[k] = decodeURIComponent(v); 
  });
}

return {
  json: {
    ...d,
    postbackAction: pbParams.action || '',
    postbackValue: pbParams.value || '',
    workDay,
    shortDate,
    currentTime,
    realDate,
    fullTimestamp,
    timestamp: now.getTime()
  }
};
`
}, { version: 2 });

posX += 200;
const nLookupEmp = addNode('4. 查詢員工表', 'n8n-nodes-base.googleSheets', {
    operation: 'lookup',
    documentId: { __rl: true, value: SHEET_ID, mode: 'id' },
    sheetName: { __rl: true, value: '員工資料', mode: 'name' },
    lookupColumn: 'UserID',
    lookupValue: '={{ $json.userId }}'
}, { version: 4.4, credentials: { googleSheetsOAuth2Api: { id: '', name: SHEET_CRED } }, alwaysOutputData: true });

posX += 200;
const nCheckEmpIf = addNode('5. 員工是否存在', 'n8n-nodes-base.if', {
    conditions: {
        options: { caseSensitive: true, typeValidation: "strict" },
        conditions: [{ leftValue: '={{ $json.UserID }}', rightValue: '', operator: { type: 'string', operation: 'notEmpty' } }],
        combinator: 'and'
    },
    options: {}
}, { version: 2 });

connect(nWebhook, nPreprocessSet);
connect(nPreprocessSet, nPreprocessCode);
connect(nPreprocessCode, nLookupEmp);
connect(nLookupEmp, nCheckEmpIf);


// -------------------------------------------------------------
// 第 2 階段：新員工分支 (取得個資 -> 寫入Sheet -> 回覆語系選單)
// -------------------------------------------------------------
let bx = posX + 200;
let by = posY + 200;
const nGetProfile = addNode('6A. 取得LINE個資', 'n8n-nodes-base.httpRequest', {
    url: '=https://api.line.me/v2/bot/profile/{{ $(\'2. 擷取訊息資訊\').item.json.userId }}',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendHeaders: true,
    headerParameters: { parameters: [{ name: 'Authorization', value: 'Bearer YOUR_LINE_TOKEN' }] }
}, { version: 4.2 });

const nCreateEmp = addNode('6B. 建立新員工', 'n8n-nodes-base.googleSheets', {
    operation: 'append',
    documentId: { __rl: true, value: SHEET_ID, mode: 'id' },
    sheetName: { __rl: true, value: '員工資料', mode: 'name' },
    columns: {
        mappingMode: 'defineBelow', value: {
            UserID: '={{ $(\'2. 擷取訊息資訊\').item.json.userId }}',
            '暱稱': '={{ $json.displayName }}',
            Language: '',
            current_step: 'WAIT_LANG',
            temp_data: ''
        }
    }
}, { version: 4.4, credentials: { googleSheetsOAuth2Api: { id: '', name: SHEET_CRED } } });

const nReplyLangCode = addNode('6C. 準備語言選單', 'n8n-nodes-base.code', {
    jsCode: `
return {
  json: {
    replyToken: $('2. 擷取訊息資訊').item.json.replyToken,
    replyMessages: [
      {
        type: 'text',
        text: '👋 歡迎加入！請選擇您的語言 / Vui lòng chọn ngôn ngữ:',
        quickReply: {
          items: [
            { type: 'action', action: { type: 'postback', label: '🇹🇼 中文', data: 'action=lang&value=zh-TW' } },
            { type: 'action', action: { type: 'postback', label: '🇻🇳 Tiếng Việt', data: 'action=lang&value=vi-VN' } }
          ]
        }
      }
    ]
  }
};
`
}, { version: 2 });

connect(nCheckEmpIf, nGetProfile, 1, 0); // False branch -> 沒找到員工
connect(nGetProfile, nCreateEmp);
connect(nCreateEmp, nReplyLangCode);

// -------------------------------------------------------------
// 第 3 階段：既有員工 (讀取狀態機與字典 -> 取消判斷 -> Switch路由)
// -------------------------------------------------------------
bx = posX + 200;
by = posY - 200;
const nReadStateCode = addNode('7. 讀取狀態與翻譯', 'n8n-nodes-base.code', {
    jsCode: `
const prev = $('3. 日期時間處理').item.json;
const emp = $('4. 查詢員工表').item.json;

let step = emp.current_step || 'IDLE';
let tempData = {};
try { tempData = JSON.parse(emp.temp_data || '{}'); } catch(e) {}

const lang = emp.Language || 'zh-TW';
const translations = {
  'zh-TW': {
    selectStore: '📍 請選擇門市:',
    askRevenueIn: '💰 開攤完成! \n若您是第一位開攤，請輸入開攤現有金額 (純數字)\n若中途上班/小幫手請輸入 0',
    askRevenueOut: '💰 辛苦了! 請輸入當前收銀機業績 (純數字):',
    photoId1: '📸 註冊步驟1/2：請上傳您的【身分證正面】照片',
    photoId2: '📸 註冊步驟2/2：請上傳您的【身分證反面】照片',
    photoIn: '📸 請上傳【上班/開攤】照片',
    photoOut: '📸 請上傳【下班/收攤】照片',
    cancel: '❌ 已取消操作',
    clockInSuccess: '✅ 上班打卡成功！您現在狀態為「上班中」。',
    clockOutSuccess: '✅ 下班打卡成功！辛苦了。',
    invalidNumber: '❌ 請輸入有效的數字',
    welcome: '✅ 語言設定完成！\\n\\n📋 使用說明：\\n• 輸入「打卡」開始/結束工作\\n• 系統會自動判斷上下班\\n\\n祝您工作順利！💪'
  },
  'vi-VN': {
    selectStore: '📍 Vui lòng chọn cửa hàng:',
    askRevenueIn: '💰 Nhập số tiền hiện tại lúc mở cửa (chỉ số).\\nNếu là phụ việc nhập 0:',
    askRevenueOut: '💰 Nhập doanh thu hiện tại khi đóng cửa (chỉ số):',
    photoId1: '📸 Đăng ký 1/2: Vui lòng tải lên ảnh [Mặt trước CCCD]',
    photoId2: '📸 Đăng ký 2/2: Vui lòng tải lên ảnh [Mặt sau CCCD]',
    photoIn: '📸 Tải ảnh chấm công vào',
    photoOut: '📸 Tải ảnh chấm công ra',
    cancel: '❌ Đã hủy',
    clockInSuccess: '✅ Chấm công vào thành công! Đang làm việc.',
    clockOutSuccess: '✅ Chấm công ra thành công!',
    invalidNumber: '❌ Vui lòng nhập số hợp lệ',
    welcome: '✅ Đã cài ngôn ngữ!\\n\\n📋 Hướng dẫn:\\n• Nhập "Chấm công" để bắt đầu/kết thúc\\n\\nChúc làm việc vui!'
  }
};

if (prev.postbackAction === 'cancel') {
  step = 'CANCEL';
}

return {
  json: {
    ...prev,
    emp,
    step,
    tempData,
    t: translations[lang]
  }
};
`
}, { version: 2 });

const nStateSwitch = addNode('8. 狀態路由 (Switch)', 'n8n-nodes-base.switch', {
    mode: 'expression',
    evalExpression: '={{ $json.step }}',
    rules: {
        rules: [
            { outputKey: 'CANCEL', outputValue: 'CANCEL' },
            { outputKey: 'IDLE', outputValue: 'IDLE' },
            { outputKey: 'WORKING', outputValue: 'WORKING' },
            { outputKey: 'WAIT_LANG', outputValue: 'WAIT_LANG' },
            { outputKey: 'WAIT_STORE', outputValue: 'WAIT_STORE' },
            { outputKey: 'WAIT_PHOTO', outputValue: 'WAIT_PHOTO' },
            { outputKey: 'WAIT_REVENUE', outputValue: 'WAIT_REVENUE' }
        ]
    },
    fallbackOutput: 'extra'
}, { version: 3 });

connect(nCheckEmpIf, nReadStateCode, 0, 0); // True branch -> 有找到員工
connect(nReadStateCode, nStateSwitch);

// -------------------------------------------------------------
// 路由 A: 取消 (CANCEL)
// -------------------------------------------------------------
const nCancelSheet = addNode('A1. 重置狀態', 'n8n-nodes-base.googleSheets', {
    operation: 'update', documentId: { __rl: true, value: SHEET_ID, mode: 'id' }, sheetName: { __rl: true, value: '員工資料', mode: 'name' },
    columns: { mappingMode: 'defineBelow', value: { current_step: 'IDLE', temp_data: '' } }, options: { lookupColumn: 'UserID', lookupValue: '={{ $json.userId }}' }
}, { version: 4.4, credentials: { googleSheetsOAuth2Api: { id: '', name: SHEET_CRED } } });
const nCancelReply = addNode('A2. 解析取消回覆', 'n8n-nodes-base.code', { jsCode: `return { json: { replyToken: $json.replyToken, replyMessages: [{ type: 'text', text: $json.t.cancel }] } };` }, { version: 2 });

connect(nStateSwitch, nCancelSheet, 0, 0); // CANCEL
connect(nCancelSheet, nCancelReply);

// -------------------------------------------------------------
// 路由 B: IDLE (閒置狀態 - 準備打卡上班)
// -------------------------------------------------------------
const nIdleCheck = addNode('B1. 打卡判定(上班)', 'n8n-nodes-base.if', {
    conditions: {
        options: { caseSensitive: false, typeValidation: "strict" },
        conditions: [{ leftValue: '={{ $json.msgText }}', rightValue: '打卡', operator: { type: 'string', operation: 'contains' } }],
        combinator: 'and'
    }, options: {}
}, { version: 2 });
const nSetStore = addNode('B2. 設定 WAIT_STORE', 'n8n-nodes-base.googleSheets', {
    operation: 'update', documentId: { __rl: true, value: SHEET_ID, mode: 'id' }, sheetName: { __rl: true, value: '員工資料', mode: 'name' },
    columns: { mappingMode: 'defineBelow', value: { current_step: 'WAIT_STORE', temp_data: '{"action": "select_store"}' } }, options: { lookupColumn: 'UserID', lookupValue: '={{ $json.userId }}' }
}, { version: 4.4, credentials: { googleSheetsOAuth2Api: { id: '', name: SHEET_CRED } } });
const nReadStores = addNode('B3. 讀取門市表', 'n8n-nodes-base.googleSheets', {
    operation: 'getAll', documentId: { __rl: true, value: SHEET_ID, mode: 'id' }, sheetName: { __rl: true, value: '門市清單', mode: 'name' }, options: {}
}, { version: 4.4, credentials: { googleSheetsOAuth2Api: { id: '', name: SHEET_CRED } }, alwaysOutputData: true }); // 如果沒有門市清單sheet可以改成寫死
const nReplyStores = addNode('B4. 組裝門市選單', 'n8n-nodes-base.code', {
    jsCode: `
const stores = ['板橋店', '土城店', '三重店', '新莊店']; // 靜態替代
const quickReplyItems = stores.map(store => ({
  type: 'action', action: { type: 'postback', label: store, data: \`action=select_store&value=\${encodeURIComponent(store)}\` }
}));
quickReplyItems.push({ type: 'action', action: { type: 'postback', label: '❌ 取消', data: 'action=cancel' } });
return { json: { replyToken: $('7. 讀取狀態與翻譯').item.json.replyToken, replyMessages: [{ type: 'text', text: $('7. 讀取狀態與翻譯').item.json.t.selectStore, quickReply: { items: quickReplyItems } }] } };
`
}, { version: 2 });

connect(nStateSwitch, nIdleCheck, 1, 0); // IDLE
connect(nIdleCheck, nSetStore, 0, 0); // True branch
connect(nSetStore, nReadStores);
connect(nReadStores, nReplyStores);

// -------------------------------------------------------------
// 路由 C: WORKING (上班中 - 準備打卡下班)
// -------------------------------------------------------------
const nWorkCheck = addNode('C1. 打卡判定(下班)', 'n8n-nodes-base.if', {
    conditions: {
        options: { caseSensitive: false, typeValidation: "strict" },
        conditions: [{ leftValue: '={{ $json.msgText }}', rightValue: '打卡', operator: { type: 'string', operation: 'contains' } }],
        combinator: 'and'
    }, options: {}
}, { version: 2 });
const nSetPhotoOut = addNode('C2. 設定 WAIT_PHOTO(下班)', 'n8n-nodes-base.googleSheets', {
    operation: 'update', documentId: { __rl: true, value: SHEET_ID, mode: 'id' }, sheetName: { __rl: true, value: '員工資料', mode: 'name' },
    columns: { mappingMode: 'defineBelow', value: { current_step: 'WAIT_PHOTO', temp_data: '{"action": "clockout"}' } }, options: { lookupColumn: 'UserID', lookupValue: '={{ $json.userId }}' }
}, { version: 4.4, credentials: { googleSheetsOAuth2Api: { id: '', name: SHEET_CRED } } });
const nReplyPhotoOut = addNode('C3. 組裝下班照要求', 'n8n-nodes-base.code', {
    jsCode: `
const t = $('7. 讀取狀態與翻譯').item.json.t;
return { json: { replyToken: $('7. 讀取狀態與翻譯').item.json.replyToken, replyMessages: [{ type: 'text', text: t.photoOut, quickReply: { items: [{ type: 'action', action: { type: 'postback', label: '❌ 取消', data: 'action=cancel' } }] } }] } };
`
}, { version: 2 });

connect(nStateSwitch, nWorkCheck, 2, 0); // WORKING
connect(nWorkCheck, nSetPhotoOut, 0, 0); // True
connect(nSetPhotoOut, nReplyPhotoOut);

// -------------------------------------------------------------
// 路由 D: WAIT_LANG (初次加入語言設定)
// -------------------------------------------------------------
const nSetLangSheet = addNode('D1. 更新語系', 'n8n-nodes-base.googleSheets', {
    operation: 'update', documentId: { __rl: true, value: SHEET_ID, mode: 'id' }, sheetName: { __rl: true, value: '員工資料', mode: 'name' },
    columns: { mappingMode: 'defineBelow', value: { Language: '={{ $json.postbackValue }}', current_step: 'WAIT_PHOTO', temp_data: '{"action": "id_card_1"}' } }, options: { lookupColumn: 'UserID', lookupValue: '={{ $json.userId }}' }
}, { version: 4.4, credentials: { googleSheetsOAuth2Api: { id: '', name: SHEET_CRED } } });
const nReplyIdPhoto = addNode('D2. 要求證件照1', 'n8n-nodes-base.code', {
    jsCode: `
const t = $('7. 讀取狀態與翻譯').item.json.t; // 注意這裡其實語言還沒生效，暫時這樣
return { json: { replyToken: $('7. 讀取狀態與翻譯').item.json.replyToken, replyMessages: [{ type: 'text', text: "✅ 語言設定完成\\n📸 註冊步驟1/2：請上傳您的【身分證正面】照片" }] } };
`
}, { version: 2 });

connect(nStateSwitch, nSetLangSheet, 3, 0); // WAIT_LANG
connect(nSetLangSheet, nReplyIdPhoto);

// -------------------------------------------------------------
// 路由 E: WAIT_STORE (門市選擇後)
// -------------------------------------------------------------
const nCheckStoreIf = addNode('E1. 檢查是否有選店', 'n8n-nodes-base.if', {
    conditions: {
        options: { caseSensitive: true },
        conditions: [{ leftValue: '={{ $json.postbackAction }}', rightValue: 'select_store', operator: { type: 'string', operation: 'equals' } }], combinator: 'and'
    }, options: {}
}, { version: 2 });
const nSetPhotoIn = addNode('E2. 設定 WAIT_PHOTO(上班)', 'n8n-nodes-base.googleSheets', {
    operation: 'update', documentId: { __rl: true, value: SHEET_ID, mode: 'id' }, sheetName: { __rl: true, value: '員工資料', mode: 'name' },
    columns: { mappingMode: 'defineBelow', value: { current_step: 'WAIT_PHOTO', temp_data: `={"action": "clockin", "store": "{{ $('7. 讀取狀態與翻譯').item.json.postbackValue }}"}` } }, options: { lookupColumn: 'UserID', lookupValue: '={{ $json.userId }}' }
}, { version: 4.4, credentials: { googleSheetsOAuth2Api: { id: '', name: SHEET_CRED } } });
const nReplyPhotoIn = addNode('E3. 組裝上班照要求', 'n8n-nodes-base.code', {
    jsCode: `
const t = $('7. 讀取狀態與翻譯').item.json.t;
return { json: { replyToken: $('7. 讀取狀態與翻譯').item.json.replyToken, replyMessages: [{ type: 'text', text: t.photoIn, quickReply: { items: [{ type: 'action', action: { type: 'postback', label: '❌ 取消', data: 'action=cancel' } }] } }] } };
`
}, { version: 2 });

connect(nStateSwitch, nCheckStoreIf, 4, 0); // WAIT_STORE
connect(nCheckStoreIf, nSetPhotoIn, 0, 0); // True
connect(nSetPhotoIn, nReplyPhotoIn);

// -------------------------------------------------------------
// 路由 F: WAIT_PHOTO (照片上傳)
// 因為要處理實體的檔案，我們先做 Switch 分發邏輯
// -------------------------------------------------------------
const nCheckIsImage = addNode('F1. 檢查是否為圖片', 'n8n-nodes-base.if', {
    conditions: {
        options: { caseSensitive: true },
        conditions: [{ leftValue: '={{ $json.msgType }}', rightValue: 'image', operator: { type: 'string', operation: 'equals' } }], combinator: 'and'
    }, options: {}
}, { version: 2 });

const nPhotoActionSwitch = addNode('F2. 照片Action路由', 'n8n-nodes-base.switch', {
    mode: 'expression', evalExpression: '={{ $json.tempData.action }}',
    rules: {
        rules: [
            { outputKey: 'id_card_1', outputValue: 'id_card_1' },
            { outputKey: 'id_card_2', outputValue: 'id_card_2' },
            { outputKey: 'clockin', outputValue: 'clockin' },
            { outputKey: 'clockout', outputValue: 'clockout' }
        ]
    }, fallbackOutput: 'extra'
}, { version: 3 });

connect(nStateSwitch, nCheckIsImage, 5, 0); // WAIT_PHOTO
connect(nCheckIsImage, nPhotoActionSwitch, 0, 0); // True

// F - 照片：註冊身分證正面 (id_card_1) -> 要求反面
const nSetPhotoID2 = addNode('F3a. 設定 WAIT_PHOTO(反面)', 'n8n-nodes-base.googleSheets', {
    operation: 'update', documentId: { __rl: true, value: SHEET_ID, mode: 'id' }, sheetName: { __rl: true, value: '員工資料', mode: 'name' },
    columns: { mappingMode: 'defineBelow', value: { current_step: 'WAIT_PHOTO', temp_data: '{"action": "id_card_2"}' } }, options: { lookupColumn: 'UserID', lookupValue: '={{ $json.userId }}' }
}, { version: 4.4, credentials: { googleSheetsOAuth2Api: { id: '', name: SHEET_CRED } } });
const nReplyPhotoID2 = addNode('F4a. 要求證件照2', 'n8n-nodes-base.code', {
    jsCode: `const t = $('7. 讀取狀態與翻譯').item.json.t; return { json: { replyToken: $('7. 讀取狀態與翻譯').item.json.replyToken, replyMessages: [{ type: 'text', text: t.photoId2 }] } };`
}, { version: 2 });

connect(nPhotoActionSwitch, nSetPhotoID2, 0, 0); // id_card_1
connect(nSetPhotoID2, nReplyPhotoID2);

// F - 照片：註冊身分證反面 (id_card_2) -> 註冊完成回到 IDLE
const nSetIDLE = addNode('F3b. 註冊完成(IDLE)', 'n8n-nodes-base.googleSheets', {
    operation: 'update', documentId: { __rl: true, value: SHEET_ID, mode: 'id' }, sheetName: { __rl: true, value: '員工資料', mode: 'name' },
    columns: { mappingMode: 'defineBelow', value: { current_step: 'IDLE', temp_data: '' } }, options: { lookupColumn: 'UserID', lookupValue: '={{ $json.userId }}' }
}, { version: 4.4, credentials: { googleSheetsOAuth2Api: { id: '', name: SHEET_CRED } } });
const nReplyIDLE = addNode('F4b. 回覆註冊成功', 'n8n-nodes-base.code', {
    jsCode: `const t = $('7. 讀取狀態與翻譯').item.json.t; return { json: { replyToken: $('7. 讀取狀態與翻譯').item.json.replyToken, replyMessages: [{ type: 'text', text: t.welcome }] } };`
}, { version: 2 });

connect(nPhotoActionSwitch, nSetIDLE, 1, 0); // id_card_2
connect(nSetIDLE, nReplyIDLE);

// F - 照片：上班 (clockin) -> 詢問業績 (WAIT_REVENUE - clockin_rev)
const nSetRevIn = addNode('F3c. 設定WAIT_REVENUE(上)', 'n8n-nodes-base.googleSheets', {
    operation: 'update', documentId: { __rl: true, value: SHEET_ID, mode: 'id' }, sheetName: { __rl: true, value: '員工資料', mode: 'name' },
    columns: { mappingMode: 'defineBelow', value: { current_step: 'WAIT_REVENUE', temp_data: `={"action": "clockin_rev", "store": "{{ $json.tempData.store }}"}` } }, options: { lookupColumn: 'UserID', lookupValue: '={{ $json.userId }}' }
}, { version: 4.4, credentials: { googleSheetsOAuth2Api: { id: '', name: SHEET_CRED } } });
const nReplyRevIn = addNode('F4c. 要求輸入開攤業績', 'n8n-nodes-base.code', {
    jsCode: `const t = $('7. 讀取狀態與翻譯').item.json.t; return { json: { replyToken: $('7. 讀取狀態與翻譯').item.json.replyToken, replyMessages: [{ type: 'text', text: t.askRevenueIn, quickReply: { items: [{ type: 'action', action: { type: 'postback', label: '❌ 取消', data: 'action=cancel' } }] } }] } };`
}, { version: 2 });

connect(nPhotoActionSwitch, nSetRevIn, 2, 0); // clockin
connect(nSetRevIn, nReplyRevIn);

// F - 照片：下班 (clockout) -> 詢問業績 (WAIT_REVENUE - clockout_rev)
const nSetRevOut = addNode('F3d. 設定WAIT_REVENUE(下)', 'n8n-nodes-base.googleSheets', {
    operation: 'update', documentId: { __rl: true, value: SHEET_ID, mode: 'id' }, sheetName: { __rl: true, value: '員工資料', mode: 'name' },
    columns: { mappingMode: 'defineBelow', value: { current_step: 'WAIT_REVENUE', temp_data: `={"action": "clockout_rev", "store": "{{ $('7. 讀取狀態與翻譯').item.json.emp.店名 || '未知' }}"}` } }, options: { lookupColumn: 'UserID', lookupValue: '={{ $json.userId }}' }
}, { version: 4.4, credentials: { googleSheetsOAuth2Api: { id: '', name: SHEET_CRED } } });
const nReplyRevOut = addNode('F4d. 要求輸入下班業績', 'n8n-nodes-base.code', {
    jsCode: `const t = $('7. 讀取狀態與翻譯').item.json.t; return { json: { replyToken: $('7. 讀取狀態與翻譯').item.json.replyToken, replyMessages: [{ type: 'text', text: t.askRevenueOut, quickReply: { items: [{ type: 'action', action: { type: 'postback', label: '❌ 取消', data: 'action=cancel' } }] } }] } };`
}, { version: 2 });

connect(nPhotoActionSwitch, nSetRevOut, 3, 0); // clockout
connect(nSetRevOut, nReplyRevOut);

// -------------------------------------------------------------
// 路由 G: WAIT_REVENUE (業績輸入)
// -------------------------------------------------------------
const nCheckNumberIf = addNode('G1. 檢查是否為數字', 'n8n-nodes-base.if', {
    conditions: {
        options: { caseSensitive: true },
        conditions: [{ leftValue: '={{ $json.msgText }}', rightValue: '^\\d+$', operator: { type: 'string', operation: 'regex' } }], combinator: 'and'
    }, options: {}
}, { version: 2 });

const nRevActionSwitch = addNode('G2. 業績Action路由', 'n8n-nodes-base.switch', {
    mode: 'expression', evalExpression: '={{ $json.tempData.action }}',
    rules: {
        rules: [
            { outputKey: 'clockin_rev', outputValue: 'clockin_rev' },
            { outputKey: 'clockout_rev', outputValue: 'clockout_rev' }
        ]
    }, fallbackOutput: 'extra'
}, { version: 3 });

connect(nStateSwitch, nCheckNumberIf, 6, 0); // WAIT_REVENUE
connect(nCheckNumberIf, nRevActionSwitch, 0, 0); // True

// 業績驗證失敗
const nErrorRev = addNode('GERR. 回覆數字錯誤', 'n8n-nodes-base.code', { jsCode: `const t = $('7. 讀取狀態與翻譯').item.json.t; return { json: { replyToken: $('7. 讀取狀態與翻譯').item.json.replyToken, replyMessages: [{ type: 'text', text: t.invalidNumber }] } };` }, { version: 2 });
connect(nCheckNumberIf, nErrorRev, 1, 0); // False

// G - 業績：上班 (clockin_rev) -> 進入 WORKING 且寫入上班紀錄
const nWriteClockIn = addNode('G3a. 寫入上班紀錄', 'n8n-nodes-base.googleSheets', {
    operation: 'append', documentId: { __rl: true, value: SHEET_ID, mode: 'id' }, sheetName: { __rl: true, value: '打卡記錄', mode: 'name' },
    columns: {
        mappingMode: 'defineBelow', value: {
            '日期': '={{ $json.workDay }}', '員工姓名': '={{ $json.emp["暱稱"] }}', '店名': '={{ $json.tempData.store }}',
            '上班時間': '={{ $json.currentTime }}', '業績記錄': '={{ $json.msgText }}', '打卡記錄': `[{{"上班"}}][{{ $json.fullTimestamp }}]`
        }
    }
}, { version: 4.4, credentials: { googleSheetsOAuth2Api: { id: '', name: SHEET_CRED } } });

const nWriteRevOpen = addNode('G4a. 寫入業績(開攤)', 'n8n-nodes-base.googleSheets', {
    operation: 'append', documentId: { __rl: true, value: SHEET_ID, mode: 'id' }, sheetName: { __rl: true, value: '業績記錄', mode: 'name' },
    columns: {
        mappingMode: 'defineBelow', value: {
            '日期': '={{ $json.shortDate }}', '店名': '={{ $json.tempData.store }}',
            '開攤時間': '={{ $json.currentTime }}', '操作記錄': `[{{ $json.emp["暱稱"] }}][開攤金額:{{ $json.msgText }}][{{ $json.fullTimestamp }}]`
        }
    }
}, { version: 4.4, credentials: { googleSheetsOAuth2Api: { id: '', name: SHEET_CRED } } });

const nSetWorking = addNode('G5a. 設定WORKING', 'n8n-nodes-base.googleSheets', {
    operation: 'update', documentId: { __rl: true, value: SHEET_ID, mode: 'id' }, sheetName: { __rl: true, value: '員工資料', mode: 'name' },
    columns: { mappingMode: 'defineBelow', value: { current_step: 'WORKING', temp_data: '' } }, options: { lookupColumn: 'UserID', lookupValue: '={{ $json.userId }}' }
}, { version: 4.4, credentials: { googleSheetsOAuth2Api: { id: '', name: SHEET_CRED } } });

const nReplyWorking = addNode('G6a. 回覆上班打卡結束', 'n8n-nodes-base.code', {
    jsCode: `const t = $('7. 讀取狀態與翻譯').item.json.t; return { json: { replyToken: $('7. 讀取狀態與翻譯').item.json.replyToken, replyMessages: [{ type: 'text', text: t.clockInSuccess }] } };`
}, { version: 2 });

connect(nRevActionSwitch, nWriteClockIn, 0, 0); // clockin_rev
connect(nWriteClockIn, nWriteRevOpen);
connect(nWriteRevOpen, nSetWorking);
connect(nSetWorking, nReplyWorking);

// G - 業績：下班 (clockout_rev) -> 進入 IDLE 且更新下班紀錄
const nWriteClockOut = addNode('G3b. 寫入下班紀錄', 'n8n-nodes-base.googleSheets', { // 實際上這裡要先Search拿到Row再Update，為了簡化展示先用 Append (實作需要處理)
    operation: 'append', documentId: { __rl: true, value: SHEET_ID, mode: 'id' }, sheetName: { __rl: true, value: '打卡記錄', mode: 'name' },
    columns: {
        mappingMode: 'defineBelow', value: {
            '日期': '={{ $json.workDay }}', '員工姓名': '={{ $json.emp["暱稱"] }}', '店名': '={{ $json.tempData.store }}',
            '下班時間': '={{ $json.currentTime }}', '業績記錄': '={{ $json.msgText }}', '打卡記錄': `[{{"下班"}}][{{ $json.fullTimestamp }}]`
        }
    }
}, { version: 4.4, credentials: { googleSheetsOAuth2Api: { id: '', name: SHEET_CRED } } });

const nWriteRevClose = addNode('G4b. 寫入業績(收攤)', 'n8n-nodes-base.googleSheets', {
    operation: 'append', documentId: { __rl: true, value: SHEET_ID, mode: 'id' }, sheetName: { __rl: true, value: '業績記錄', mode: 'name' },
    columns: {
        mappingMode: 'defineBelow', value: {
            '日期': '={{ $json.shortDate }}', '店名': '={{ $json.tempData.store }}',
            '操作記錄': `[{{ $json.emp["暱稱"] }}][收攤業績:{{ $json.msgText }}][{{ $json.fullTimestamp }}]`
        }
    }
}, { version: 4.4, credentials: { googleSheetsOAuth2Api: { id: '', name: SHEET_CRED } } });

const nSetIDLEout = addNode('G5b. 設定IDLE', 'n8n-nodes-base.googleSheets', {
    operation: 'update', documentId: { __rl: true, value: SHEET_ID, mode: 'id' }, sheetName: { __rl: true, value: '員工資料', mode: 'name' },
    columns: { mappingMode: 'defineBelow', value: { current_step: 'IDLE', temp_data: '' } }, options: { lookupColumn: 'UserID', lookupValue: '={{ $json.userId }}' }
}, { version: 4.4, credentials: { googleSheetsOAuth2Api: { id: '', name: SHEET_CRED } } });

const nReplyIDLEout = addNode('G6b. 回覆下班打卡結束', 'n8n-nodes-base.code', {
    jsCode: `const t = $('7. 讀取狀態與翻譯').item.json.t; return { json: { replyToken: $('7. 讀取狀態與翻譯').item.json.replyToken, replyMessages: [{ type: 'text', text: t.clockOutSuccess }] } };`
}, { version: 2 });

connect(nRevActionSwitch, nWriteClockOut, 1, 0); // clockout_rev
connect(nWriteClockOut, nWriteRevClose);
connect(nWriteRevClose, nSetIDLEout);
connect(nSetIDLEout, nReplyIDLEout);


// -------------------------------------------------------------
// 統一回應層
// -------------------------------------------------------------
const nReplyMerge = addNode('98. 統一回覆路由', 'n8n-nodes-base.merge', { mode: 'mergeByPosition' }, { version: 3 });
const nLineReply = addNode('99. LINE Reply API', 'n8n-nodes-base.httpRequest', {
    method: 'POST', url: 'https://api.line.me/v2/bot/message/reply',
    authentication: 'predefinedCredentialType', nodeCredentialType: 'lineApi',
    sendHeaders: true, headerParameters: { parameters: [{ name: 'Authorization', value: 'Bearer YOUR_LINE_TOKEN' }, { name: 'Content-Type', value: 'application/json' }] },
    sendBody: true, specifyBody: 'json', jsonBody: '={{ { "replyToken": $json.replyToken, "messages": $json.replyMessages } }}'
}, { version: 4.2 });

connect(nReplyLangCode, nReplyMerge);  // 新員工
connect(nCancelReply, nReplyMerge);    // 取消
connect(nReplyStores, nReplyMerge);    // 上班選店
connect(nReplyPhotoOut, nReplyMerge);  // 要求下班照
connect(nReplyIdPhoto, nReplyMerge);   // 要求證件1
connect(nReplyPhotoIn, nReplyMerge);   // 要求上班照
connect(nReplyPhotoID2, nReplyMerge);  // 要求證件2
connect(nReplyIDLE, nReplyMerge);      // 註冊完
connect(nReplyRevIn, nReplyMerge);     // 要求開攤業績
connect(nReplyRevOut, nReplyMerge);    // 要求下班業績
connect(nErrorRev, nReplyMerge);       // 業績數字錯
connect(nReplyWorking, nReplyMerge);   // 上班完成
connect(nReplyIDLEout, nReplyMerge);   // 下班完成

connect(nReplyMerge, nLineReply);

// -------------------------------------------------------------
// 生成輸出
// -------------------------------------------------------------
const content = fs.readFileSync('line-clock-in-bot-v17-statemachine.json', 'utf8');
const output = JSON.parse(content);
output.nodes = nodes;
output.connections = connections;
fs.writeFileSync('line-clock-in-bot-v17-statemachine.json', JSON.stringify(output, null, 2));
console.log('Written successfully.');
