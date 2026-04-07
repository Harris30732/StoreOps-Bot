$sourceDir = "."
$archiveDir = ".\_archive"

if (-not (Test-Path -Path $archiveDir)) {
    New-Item -ItemType Directory -Path $archiveDir | Out-Null
    Write-Host "Created _archive directory."
}

$filesToArchive = @(
    "line-clock-in-bot-v14.json",
    "line-clock-in-bot-v15.json",
    "line-clock-in-bot-v15-final.json",
    "line-clock-in-bot-v15-optimized.json",
    "line-clock-in-bot-v15-unified.json",
    "line-clock-in-bot-v16-final.json",
    "line-clock-in-bot-v16-optimized.json",
    "storeops-bot-v2.json",
    "v15-prepare-reply-example.json",
    "v15-unified-reply-nodes.json",
    "audit_n8n.py",
    "audit_v2.js",
    "build_v16.js",
    "build_v16_final.js",
    "build_v16_optimized.js",
    "build_v2.js",
    "refactor_config_error.js",
    "unify_replies.js",
    "unify_replies.py",
    "verify_skill_compliance.py",
    "merge_script.js",
    "merge_script.py",
    "part1.py",
    "part2.py",
    "part3.py",
    "debug_trace.txt",
    "merge_output.txt"
)

foreach ($file in $filesToArchive) {
    $filePath = "$sourceDir\$file"
    if (Test-Path -Path $filePath) {
        Move-Item -Path $filePath -Destination $archiveDir -Force
        Write-Host "Moved $file to _archive."
    } else {
        Write-Host "File not found: $file"
    }
}

Write-Host "Cleanup complete."
