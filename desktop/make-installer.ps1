# Builds public\downloads\Nexora-Setup.exe: one ~15 KB file that installs Nexora on any Windows 10/11 PC.
# Uses the C# compiler that ships with Windows, so nothing needs to be installed.
#   powershell -File desktop\make-installer.ps1 [-Url https://your-address]
param([string]$Url = '')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$work = Join-Path $env:TEMP 'nexora-installer-build'
New-Item -ItemType Directory -Force $work | Out-Null

if (-not $Url) {
  $cfg = Get-Content (Join-Path $PSScriptRoot 'config.json') -Raw | ConvertFrom-Json
  $Url = $cfg.url
}
if ($Url -notmatch '^https://[^\s"\\]+$') { throw "The address must start with https:// and have no spaces: $Url" }

# --- the icon: a Windows .ico holding PNG pictures at 256, 64, 48, 32 and 16 pixels
$src = [System.Drawing.Image]::FromFile((Join-Path $PSScriptRoot 'icon.png'))
$sizes = 256, 64, 48, 32, 16
$pngs = foreach ($s in $sizes) {
  $bmp = New-Object System.Drawing.Bitmap $s, $s
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'; $g.SmoothingMode = 'HighQuality'
  $g.DrawImage($src, 0, 0, $s, $s); $g.Dispose()
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
  , $ms.ToArray()
}
$src.Dispose()
$ico = New-Object System.IO.MemoryStream
$w = New-Object System.IO.BinaryWriter $ico
$w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $s = $sizes[$i]; $bytes = $pngs[$i]
  $w.Write([byte]($(if ($s -ge 256) { 0 } else { $s }))); $w.Write([byte]($(if ($s -ge 256) { 0 } else { $s })))
  $w.Write([byte]0); $w.Write([byte]0); $w.Write([uint16]1); $w.Write([uint16]32)
  $w.Write([uint32]$bytes.Length); $w.Write([uint32]$offset); $offset += $bytes.Length
}
foreach ($b in $pngs) { $w.Write($b) }
$w.Flush()
$icoPath = Join-Path $work 'nexora.ico'
[System.IO.File]::WriteAllBytes($icoPath, $ico.ToArray())

# --- the program
$cs = (Get-Content (Join-Path $PSScriptRoot 'installer\Nexora.cs') -Raw).Replace('__URL__', $Url)
$csPath = Join-Path $work 'Nexora.cs'
[System.IO.File]::WriteAllText($csPath, $cs, (New-Object System.Text.UTF8Encoding $false))
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { $csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
if (-not (Test-Path $csc)) { throw 'The Windows C# compiler was not found (.NET Framework 4).' }

$outDir = Join-Path $root 'public\downloads'
New-Item -ItemType Directory -Force $outDir | Out-Null
$out = Join-Path $outDir 'Nexora-Setup.exe'
& $csc /nologo /target:winexe /optimize+ "/out:$out" "/win32icon:$icoPath" /r:System.dll $csPath
if ($LASTEXITCODE -ne 0) { throw 'The compiler reported errors.' }
Write-Host ("Built {0} ({1:N0} KB) pointing at {2}" -f $out, ((Get-Item $out).Length / 1KB), $Url)

# --- the Linux script: same address, written with Unix line endings
$sh = (Get-Content (Join-Path $PSScriptRoot 'installer\install-linux.sh') -Raw).Replace('__URL__', $Url).Replace("`r`n", "`n")
[System.IO.File]::WriteAllText((Join-Path $outDir 'install-linux.sh'), $sh, (New-Object System.Text.UTF8Encoding $false))
Write-Host 'Wrote install-linux.sh'
