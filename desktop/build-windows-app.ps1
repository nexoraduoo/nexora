# Builds the Nexora Windows app: dist\Nexora-Windows\Nexora.exe (+ dist\Nexora-Windows.zip to send to friends).
# Uses Electron's ready-made runtime and copies our few files next to it, so it is fast and needs no installer tools.
$ErrorActionPreference = 'Stop'
$d = $PSScriptRoot
Set-Location $d

if (-not (Test-Path "$d\node_modules\electron")) {
  Write-Host 'Installing Electron, one time, about 250 MB...'
  npm install --no-audit --no-fund
}
if (-not (Test-Path "$d\node_modules\electron\dist\electron.exe")) {
  Write-Host 'Unpacking Electron...'
  node "$d\node_modules\electron\install.js"
}

$out = "$d\dist\Nexora-Windows"
if (Test-Path "$d\dist") { Remove-Item -Recurse -Force "$d\dist" }
New-Item -ItemType Directory -Force "$out\resources\app" | Out-Null
Write-Host 'Copying files...'
robocopy "$d\node_modules\electron\dist" $out /E /NFL /NDL /NJH /NJS /NP /XD resources | Out-Null
robocopy "$d\node_modules\electron\dist\resources" "$out\resources" /E /NFL /NDL /NJH /NJS /NP | Out-Null
foreach ($f in 'main.js', 'offline.html', 'config.json', 'icon.png') { Copy-Item "$d\$f" "$out\resources\app\$f" }
$ver = (Get-Content "$d\package.json" -Raw | ConvertFrom-Json).version
@{ name = 'nexora'; productName = 'Nexora'; version = $ver; main = 'main.js' } | ConvertTo-Json | Set-Content "$out\resources\app\package.json" -Encoding utf8
Rename-Item "$out\electron.exe" 'Nexora.exe'
Remove-Item "$out\LICENSES.chromium.html" -ErrorAction SilentlyContinue

Write-Host 'Zipping, this takes a few minutes...'
Compress-Archive -Path $out -DestinationPath "$d\dist\Nexora-Windows.zip" -CompressionLevel Optimal -Force
Write-Host ''
Write-Host "Done. Your app: $out\Nexora.exe"
Write-Host "To share it: $d\dist\Nexora-Windows.zip"
