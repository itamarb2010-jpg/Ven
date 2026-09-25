$exe = "$env:LOCALAPPDATA\Modrinth App\Modrinth App.exe"

$running = Get-Process -Name "Modrinth App" -ErrorAction SilentlyContinue
if ($running) {
    Write-Host "Modrinth App is already open. Quit it first, then rerun this." -ForegroundColor Yellow
    exit 1
}

$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9222'
Start-Process $exe
Write-Host "Waiting for the webview..."

$ready = $false
foreach ($i in 1..30) {
    Start-Sleep -Seconds 1
    try {
        Invoke-RestMethod "http://127.0.0.1:9222/json/version" -TimeoutSec 2 -ErrorAction Stop | Out-Null
        $ready = $true
        break
    } catch {}
}

if (-not $ready) { Write-Host "Debug port never opened." -ForegroundColor Red; exit 1 }

node "$PSScriptRoot\src\loader.mjs"
