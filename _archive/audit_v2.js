const fs = require('fs');

const TRIGGER_TYPES = [
    'n8n-nodes-base.webhook',
    'n8n-nodes-base.cron',
    'n8n-nodes-base.interval',
    'n8n-nodes-base.start',
    'n8n-nodes-base.scheduleTrigger'
];

function analyzeWorkflow(filePath) {
    console.log(`Analyzing file: ${filePath}`);

    if (!fs.existsSync(filePath)) {
        console.error("Error: File not found.");
        return;
    }

    let workflow;
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        workflow = JSON.parse(data);
    } catch (e) {
        console.error(`Error loading JSON: ${e.message}`);
        return;
    }

    const nodes = {};
    (workflow.nodes || []).forEach(node => {
        nodes[node.name] = node;
    });

    const connections = workflow.connections || {};

    const incoming = {};
    const outgoing = {};

    // Initialize counts
    Object.keys(nodes).forEach(name => {
        incoming[name] = 0;
        outgoing[name] = 0;
    });

    Object.keys(connections).forEach(srcName => {
        if (!nodes[srcName]) return;

        const outputs = connections[srcName];
        let outCount = 0;

        Object.keys(outputs).forEach(type => {
            const links = outputs[type];
            links.forEach(branch => {
                branch.forEach(link => {
                    const tgtName = link.node;
                    if (nodes[tgtName]) {
                        incoming[tgtName] = (incoming[tgtName] || 0) + 1;
                    }
                    outCount++;
                });
            });
        });
        outgoing[srcName] = outCount;
    });

    const orphans = [];
    const deadEnds = [];

    Object.keys(nodes).forEach(name => {
        const node = nodes[name];

        // Check Orphans
        if (incoming[name] === 0 && !TRIGGER_TYPES.includes(node.type)) {
            orphans.push(name);
        }

        // Check Dead Ends
        // Dead End if outgoing count is 0
        if (outgoing[name] === 0) {
            const lowerName = name.toLowerCase();
            // Exclude valid end nodes (Reply, Response)
            if (!lowerName.includes('response') && !lowerName.includes('reply') && !name.includes('Google Drive')) {
                deadEnds.push(name);
            }
        }
    });

    console.log("# Automated Structural Audit Report");
    console.log(`Total Nodes: ${Object.keys(nodes).length}`);

    console.log("\n## ⚠️ Orphan Nodes (No Incoming Connections)");
    if (orphans.length > 0) {
        orphans.forEach(n => console.log(`- ${n} (\`${nodes[n].type}\`)`));
    } else {
        console.log("✅ None");
    }

    console.log("\n## 🛑 Potential Dead Ends (No Outgoing Connections)");
    if (deadEnds.length > 0) {
        deadEnds.forEach(n => console.log(`- ${n} (\`${nodes[n].type}\`)`));
    } else {
        console.log("✅ None");
    }

    // Naming Check
    const defaultNames = [];
    Object.keys(nodes).forEach(name => {
        // Default Check: Set1, Code1, Switch1, etc.
        if (name.startsWith("Set") && !isNaN(name.substr(3))) defaultNames.push(name);
        if (name.startsWith("HTTP Request") && !isNaN(name.substr(12).trim())) defaultNames.push(name); // "HTTP Request" is valid if unique, but "HTTP Request1" is not.
        if (name.startsWith("Switch") && !isNaN(name.substr(6))) defaultNames.push(name);
        if (name.startsWith("Code") && !isNaN(name.substr(4))) defaultNames.push(name);
    });

    console.log("\n## 🏷️ Naming Convention Issues");
    if (defaultNames.length > 0) {
        defaultNames.forEach(n => console.log(`- ${n}`));
    } else {
        console.log("✅ None");
    }
}

const fileToAnalyze = process.argv[2] || 'storeops-bot-v2.json';
analyzeWorkflow(fileToAnalyze);
