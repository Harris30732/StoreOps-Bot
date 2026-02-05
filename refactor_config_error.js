
const fs = require('fs');

// 讀取目前的 JSON (請確保檔名正確)
const inputFile = 'line-clock-in-bot-v15-final.json';
const outputFile = 'line-clock-in-bot-v15-optimized.json';

// Google Sheets & Drive IDs (將被提取到 Config)
const CONFIG = {
    G_SHEET_ID_EMP: "1ILgphAVTKI5KIpCJKrT5anlF4GQK8YoHf8JAtAnMN7o",
    G_DRIVE_FOLDER_ID: "1k4rfsjHYYXO8He7MUbTZoNJivDJkcn2a"
};

try {
    const data = fs.readFileSync(inputFile, 'utf8');
    const workflow = JSON.parse(data);

    // ============================================
    // Step 1: 建立 Config 節點
    // ============================================
    const configNode = {
        "parameters": {
            "values": {
                "string": [
                    { "name": "G_SHEET_ID", "value": CONFIG.G_SHEET_ID_EMP },
                    { "name": "G_DRIVE_FOLDER_ID", "value": CONFIG.G_DRIVE_FOLDER_ID }
                ]
            }
        },
        "id": "config-node",
        "name": "Config",
        "type": "n8n-nodes-base.set",
        "typeVersion": 3.4,
        "position": [-4272, -250] // 放在 Webhook 旁邊
    };

    // 檢查是否已存在 Config，避免重複 (雖然是新的一步)
    if (!workflow.nodes.find(n => n.name === 'Config')) {
        workflow.nodes.push(configNode);

        // 重新連接: Webhook -> Config -> 擷取訊息資訊
        // 1. 斷開 Webhook -> 擷取訊息資訊
        if (workflow.connections['LINE Webhook']) {
            workflow.connections['LINE Webhook'].main[0] = [
                { "node": "Config", "type": "main", "index": 0 }
            ];
        }

        // 2. 連接 Config -> 擷取訊息資訊
        workflow.connections['Config'] = {
            "main": [
                [{ "node": "擷取訊息資訊", "type": "main", "index": 0 }]
            ]
        };
    }

    // ============================================
    // Step 2: 替換所有 Hardcoded Sheet ID
    // ============================================
    workflow.nodes.forEach(node => {
        // Google Sheets
        if (node.type === 'n8n-nodes-base.googleSheets') {
            if (node.parameters.documentId && node.parameters.documentId.value === CONFIG.G_SHEET_ID_EMP) {
                node.parameters.documentId.value = "={{ $('Config').item.json.G_SHEET_ID }}";
            }
        }
        // Google Drive
        if (node.type === 'n8n-nodes-base.googleDrive') {
            if (node.parameters.folderId && node.parameters.folderId.value === CONFIG.G_DRIVE_FOLDER_ID) {
                node.parameters.folderId.value = "={{ $('Config').item.json.G_DRIVE_FOLDER_ID }}";
            }
        }
    });

    // ============================================
    // Step 3: 新增 Error Trigger 與錯誤處理
    // ============================================
    const errorTriggerNode = {
        "parameters": {},
        "id": "error-trigger",
        "name": "Error Trigger",
        "type": "n8n-nodes-base.errorTrigger",
        "typeVersion": 1,
        "position": [-1000, 1000]
    };

    const errorReplyNode = {
        "parameters": {
            "method": "POST",
            "url": "https://api.line.me/v2/bot/message/reply",
            "authentication": "predefinedCredentialType",
            "nodeCredentialType": "lineMessagingApi",
            "sendHeaders": true,
            "headerParameters": { "parameters": [{ "name": "Content-Type", "value": "application/json" }] },
            "sendBody": true,
            "specifyBody": "json",
            "jsonBody": "={{ JSON.stringify({ replyToken: $('Error Trigger').item.json.body.events[0].replyToken, messages: [{ type: 'text', text: '⚠️ 系統暫時無法回應，請稍後再試。' }] }) }}",
            "options": {}
        },
        "id": "error-reply",
        "name": "報錯回覆",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [-800, 1000],
        "credentials": {
            "lineMessagingApi": { "id": "UiiMHjlAZGMI80LW", "name": "打卡機器人" }
        }
    };

    // 檢查是否已存在
    if (!workflow.nodes.find(n => n.name === 'Error Trigger')) {
        workflow.nodes.push(errorTriggerNode);
        workflow.nodes.push(errorReplyNode);

        workflow.connections['Error Trigger'] = {
            "main": [
                [{ "node": "報錯回覆", "type": "main", "index": 0 }]
            ]
        };
    }

    // 寫入檔案
    fs.writeFileSync(outputFile, JSON.stringify(workflow, null, 2));
    console.log(`✅ Refactoring complete! Saved to ${outputFile}`);
    console.log(`   - Added Config node`);
    console.log(`   - Replaced IDs with variables`);
    console.log(`   - Added Error Trigger & Reply`);

} catch (err) {
    console.error('Error:', err);
}
