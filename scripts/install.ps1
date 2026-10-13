<#
.SYNOPSIS
  Install a released `atc` (a single binary) from GitHub Releases on Windows. Adapted from atomic-agent.

.EXAMPLE
  irm https://github.com/AtomicBot-ai/eye-cli/releases/latest/download/install.ps1 | iex

.NOTES
  Environment overrides (mirror install.sh):
    ATC_REPO           owner/repo   (default: AtomicBot-ai/eye-cli)
    ATC_VERSION        v0.1.0       (optional: pin a tag; default: latest)
    ATC_INSTALL_DIR    path         (default: %LOCALAPPDATA%\atc)
    ATC_NO_PATH        1            (optional: skip the user PATH update)
    ATC_DOWNLOAD_BASE  url          (optional: a mirror holding SHA256SUMS and the binaries; the tests' seam)

  Which binary (scripts/targets.mjs): ARM64 or x64, and the baseline x64 build on a CPU without AVX2.
#>

$ErrorActionPreference = "Stop"
# Windows PowerShell 5.1 redraws a progress bar per chunk, which makes a large download take minutes.
$ProgressPreference = "SilentlyContinue"
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { Write-Verbose "TLS 1.2 not settable here: $($_.Exception.Message)" }

# Run as `irm | iex`, `exit` would close the user's PowerShell window: report and stop the script instead.
function Fail([string]$Message) {
  Write-Host "error: $Message" -ForegroundColor Red
  throw "atc install failed"
}

function Get-Triple {
  # Under WOW64 (a 32-bit PowerShell on 64-bit Windows) PROCESSOR_ARCHITECTURE says x86.
  $native = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
  switch ($native) {
    "ARM64" { return "aarch64-pc-windows-msvc" }
    "AMD64" {
      $avx2 = $true
      try {
        Add-Type -Namespace AtcInstall -Name Cpu -MemberDefinition '[DllImport("kernel32.dll")] public static extern bool IsProcessorFeaturePresent(uint feature);' -ErrorAction Stop
        $avx2 = [AtcInstall.Cpu]::IsProcessorFeaturePresent(40) # PF_AVX2_INSTRUCTIONS_AVAILABLE
      } catch { Write-Verbose "AVX2 check unavailable, assuming AVX2: $($_.Exception.Message)" }
      if ($avx2) { return "x86_64-pc-windows-msvc" } else { return "x86_64-pc-windows-msvc-baseline" }
    }
    default { Fail "atc needs 64-bit Windows (this is $native)" }
  }
}

function Install-Atc {
  $Repo = if ($env:ATC_REPO) { $env:ATC_REPO } else { "AtomicBot-ai/eye-cli" }
  $Version = $env:ATC_VERSION
  $InstallDir = if ($env:ATC_INSTALL_DIR) { $env:ATC_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA "atc" }
  $Triple = Get-Triple
  $Release = if ($env:ATC_DOWNLOAD_BASE) { $env:ATC_DOWNLOAD_BASE }
    elseif ($Version) { "https://github.com/$Repo/releases/download/$Version" }
    else { "https://github.com/$Repo/releases/latest/download" }

  $Work = Join-Path ([System.IO.Path]::GetTempPath()) ("atc-install-" + [System.Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $Work -Force | Out-Null
  try {
    Write-Host "resolving the $(if ($Version) { $Version } else { 'latest' }) release of $Repo for $Triple ..."
    $Sums = Join-Path $Work "SHA256SUMS"
    Invoke-WebRequest -Uri "$Release/SHA256SUMS" -OutFile $Sums -UseBasicParsing
    # Exact names: the triple ends the name, so `...-msvc.exe` never matches `...-msvc-baseline.exe`.
    $suffix = "-$Triple.exe"
    $line = Get-Content $Sums | Where-Object {
      $name = ($_.Trim() -split '\s+')[1]
      $name -and $name.TrimStart('*').StartsWith("atc-") -and $name.EndsWith($suffix)
    } | Select-Object -First 1
    if (-not $line) { Fail "no binary for $Triple in this release" }
    $parts = $line.Trim() -split '\s+'
    $Expected = $parts[0].ToLower()
    $Asset = $parts[1].TrimStart('*')

    Write-Host "downloading $Asset ..."
    $Bin = Join-Path $Work $Asset
    Invoke-WebRequest -Uri "$Release/$Asset" -OutFile $Bin -UseBasicParsing
    # .NET's SHA256, not Get-FileHash: that cmdlet is missing from some Windows PowerShell installs.
    $stream = [System.IO.File]::OpenRead($Bin)
    try { $Actual = -join ([System.Security.Cryptography.SHA256]::Create().ComputeHash($stream) | ForEach-Object { $_.ToString("x2") }) }
    finally { $stream.Dispose() }
    if ($Actual -ne $Expected) { Fail "checksum mismatch for $Asset (expected $Expected, got $Actual); nothing was installed" }
    Write-Host "checksum verified"

    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    $Target = Join-Path $InstallDir "atc.exe"
    Get-ChildItem -Path $InstallDir -File -Filter "atc.exe.old-*" -ErrorAction SilentlyContinue | ForEach-Object {
      try { Remove-Item -LiteralPath $_.FullName -Force -ErrorAction Stop } catch { Write-Verbose "kept $($_.TargetObject): still in use" }
    }
    # A running atc.exe cannot be overwritten but can be renamed: move it aside first, put it back if
    # the new one cannot be written, and remove the old one on the next install.
    $Backup = $null
    if (Test-Path -LiteralPath $Target) {
      $Backup = "$Target.old-" + (Get-Date -Format "yyyyMMddHHmmss")
      Move-Item -LiteralPath $Target -Destination $Backup -Force
    }
    try {
      Copy-Item -LiteralPath $Bin -Destination $Target -Force
    } catch {
      if ($Backup) { Move-Item -LiteralPath $Backup -Destination $Target -Force }
      Fail "could not write $Target ($($_.Exception.Message)); the previous atc is unchanged"
    }
    if ($Backup) { try { Remove-Item -LiteralPath $Backup -Force -ErrorAction Stop } catch { Write-Verbose "kept ${Backup}: still in use, removed by the next install" } }
  } finally {
    Remove-Item -Path $Work -Recurse -Force -ErrorAction SilentlyContinue
  }

  $installed = & $Target --version 2>$null
  if ($LASTEXITCODE -ne 0) { Fail "$Target was installed but does not run (exit code $LASTEXITCODE)" }
  Write-Host ""
  Write-Host "installed atc $installed to $Target"

  $current = [Environment]::GetEnvironmentVariable("Path", "User")
  if (-not $current) { $current = "" }
  $present = ($current -split ';' | Where-Object { $_.TrimEnd('\') -ieq $InstallDir.TrimEnd('\') }).Count -gt 0
  if ($present) {
    Write-Host "PATH already contains $InstallDir"
  } elseif ($env:ATC_NO_PATH -eq "1") {
    Write-Host "add $InstallDir to your PATH to run atc from anywhere"
  } else {
    $sep = if ($current.Length -gt 0 -and -not $current.EndsWith(';')) { ";" } else { "" }
    [Environment]::SetEnvironmentVariable("Path", "$current$sep$InstallDir", "User")
    $env:Path = "$env:Path;$InstallDir"
    Write-Host "added $InstallDir to the user PATH (open a new terminal elsewhere)"
  }
  Write-Host ""
  Write-Host "next:"
  Write-Host "  atc                  # the terminal UI: choose a workspace, install an engine and a model"
  Write-Host "  atc doctor           # check the machine"
  Write-Host "  atc service install  # keep the server running (a scheduled task)"
}

Install-Atc
