<#
.SYNOPSIS
  Authenticode-sign Windows binaries with DigiCert KeyLocker (adapted from atomic-agent's release steps).

.EXAMPLE
  pwsh scripts/sign-windows-binary.ps1 dist\bin\atc-x86_64-pc-windows-msvc.exe dist\bin\atc-aarch64-pc-windows-msvc.exe

.NOTES
  Environment:
    SM_API_KEY, SM_CLIENT_CERT_FILE_B64, SM_CLIENT_CERT_PASSWORD, SM_CODE_SIGNING_CERT_SHA1_HASH
    ATC_ALLOW_UNSIGNED=1   skip, with a warning, when KeyLocker is not configured (dry runs only)

  Bun's Windows output carries no certificate table, so unlike a Node SEA binary there is nothing to
  strip before signing. signtool signs any PE, so the x64 runner signs the arm64 binary too. Every
  native command's exit code is checked: PowerShell does not stop on them, which is how atomic-agent
  v0.6.6 shipped unsigned.
#>
param([Parameter(Mandatory = $true, ValueFromRemainingArguments = $true)][string[]]$Binaries)

$ErrorActionPreference = "Stop"

function Invoke-Checked([string]$What, [scriptblock]$Command) {
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "$What failed (exit code $LASTEXITCODE)" }
}

$required = "SM_API_KEY", "SM_CLIENT_CERT_FILE_B64", "SM_CLIENT_CERT_PASSWORD", "SM_CODE_SIGNING_CERT_SHA1_HASH"
$missing = $required | Where-Object { -not [Environment]::GetEnvironmentVariable($_) }
if ($missing) {
  if ($env:ATC_ALLOW_UNSIGNED -eq "1") {
    Write-Warning "not signing: $($missing -join ', ') not set"
    exit 0
  }
  throw "$($missing -join ', ') required to sign a release"
}
foreach ($bin in $Binaries) { if (-not (Test-Path -LiteralPath $bin)) { throw "no such binary: $bin" } }

$env:SM_HOST = "https://clientauth.one.digicert.com"
$work = Join-Path ([System.IO.Path]::GetTempPath()) ("atc-sign-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $work | Out-Null
try {
  # DigiCert's signing tools, then the client certificate that authenticates to KeyLocker.
  $msi = Join-Path $work "smtools.msi"
  Invoke-WebRequest -Uri "https://one.digicert.com/signingmanager/api-ui/v1/releases/smtools-windows-x64.msi/download" `
    -Headers @{ "x-api-key" = $env:SM_API_KEY } -OutFile $msi -UseBasicParsing
  $install = Start-Process msiexec.exe -ArgumentList "/i", "`"$msi`"", "/quiet", "/norestart" -Wait -PassThru
  if ($install.ExitCode -ne 0) { throw "installing smtools failed (exit code $($install.ExitCode))" }
  $env:Path = "C:\Program Files\DigiCert\DigiCert One Signing Manager Tools;$env:Path"
  $cert = Join-Path $work "client.p12"
  [IO.File]::WriteAllBytes($cert, [Convert]::FromBase64String($env:SM_CLIENT_CERT_FILE_B64))
  $env:SM_CLIENT_CERT_FILE = $cert

  Invoke-Checked "smctl healthcheck" { smctl healthcheck }
  Invoke-Checked "smctl windows certsync" { smctl windows certsync }

  $signtool = Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin" -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -like "*\x64\*" } |
    Sort-Object { [version]($_.FullName -replace '.*\\(\d+\.\d+\.\d+\.\d+)\\.*', '$1') } -Descending |
    Select-Object -First 1
  if (-not $signtool) { throw "signtool.exe not found in the Windows SDK" }

  foreach ($bin in $Binaries) {
    Write-Host "signing: $bin"
    Invoke-Checked "signtool sign $bin" {
      & $signtool.FullName sign /sha1 $env:SM_CODE_SIGNING_CERT_SHA1_HASH /tr http://timestamp.digicert.com /td SHA256 /fd SHA256 $bin
    }
    Invoke-Checked "signtool verify $bin" { & $signtool.FullName verify /pa $bin }
  }
  Write-Host "authenticode: ok"
} finally {
  Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
}
