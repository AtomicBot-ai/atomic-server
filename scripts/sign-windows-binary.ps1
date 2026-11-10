<#
.SYNOPSIS
  Authenticode-sign Windows binaries with the code signing key in Azure Key Vault (AzureSignTool).

.EXAMPLE
  pwsh scripts/sign-windows-binary.ps1 dist\bin\atc-x86_64-pc-windows-msvc.exe dist\bin\atc-aarch64-pc-windows-msvc.exe

.NOTES
  Environment:
    AZURE_KEY_VAULT        the Key Vault's name (the `codesign` environment's variable of that name)
    AZURE_CODESIGN_CERT    the certificate's name in that vault (likewise)
    AZURE_KEY_VAULT_ACCESS_TOKEN
                           optional: a token for https://vault.azure.net. Without it the script asks the
                           signed-in Azure CLI for one (`az login` locally, azure/login with OIDC in CI).
    ATC_ALLOW_UNSIGNED=1   skip, with a warning, when the vault is not configured (dry runs only)

  Needs Windows, the .NET SDK (8 or later, for AzureSignTool), the Windows SDK (signtool, which only
  verifies here) and an identity that may sign with the key (Key Vault Crypto User and Key Vault
  Certificate User on the vault). The private key is an HSM key that never leaves the vault:
  AzureSignTool hashes each file here and has Key Vault sign the digest.

  Bun's Windows output carries no certificate table, so unlike a Node SEA binary there is nothing to
  strip before signing. Any PE can be signed on any Windows, so the x64 runner signs the arm64 binary
  too. Every native command's exit code is checked: PowerShell does not stop on them, which is how
  atomic-agent v0.6.6 shipped unsigned.
#>
param([Parameter(Mandatory = $true, ValueFromRemainingArguments = $true)][string[]]$Binaries)

$ErrorActionPreference = "Stop"

# Pinned, as in the other Atomic repositories that sign through the same vault.
$azureSignToolVersion = "7.0.1"

function Invoke-Checked([string]$What, [scriptblock]$Command) {
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "$What failed (exit code $LASTEXITCODE)" }
}

$required = "AZURE_KEY_VAULT", "AZURE_CODESIGN_CERT"
$missing = $required | Where-Object { -not [Environment]::GetEnvironmentVariable($_) }
if ($missing) {
  if ($env:ATC_ALLOW_UNSIGNED -eq "1") {
    Write-Warning "not signing: $($missing -join ', ') not set"
    exit 0
  }
  throw "$($missing -join ', ') required to sign a release"
}
foreach ($bin in $Binaries) { if (-not (Test-Path -LiteralPath $bin)) { throw "no such binary: $bin" } }

$work = Join-Path ([System.IO.Path]::GetTempPath()) ("atc-sign-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $work | Out-Null
try {
  # AzureSignTool into a throwaway tool path: nothing is left installed, and NuGet hiccups get retries.
  $tools = Join-Path $work "tools"
  for ($attempt = 1; $attempt -le 5; $attempt++) {
    dotnet tool install AzureSignTool --version $azureSignToolVersion --tool-path $tools
    if ($LASTEXITCODE -eq 0) { break }
    if ($attempt -eq 5) { throw "installing AzureSignTool $azureSignToolVersion failed (exit code $LASTEXITCODE)" }
    Write-Host "installing AzureSignTool failed (attempt $attempt of 5), retrying"
    Start-Sleep -Seconds ($attempt * 10)
  }
  $azureSignTool = Join-Path $tools "AzureSignTool.exe"

  $signtool = Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin" -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -like "*\x64\*" } |
    Sort-Object { [version]($_.FullName -replace '.*\\(\d+\.\d+\.\d+\.\d+)\\.*', '$1') } -Descending |
    Select-Object -First 1
  if (-not $signtool) { throw "signtool.exe not found in the Windows SDK" }

  # The token is fetched right before signing: an OIDC sign-in cannot refresh once it is about an hour old.
  $token = $env:AZURE_KEY_VAULT_ACCESS_TOKEN
  if (-not $token) {
    if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
      throw "the Azure CLI (az) is required to get a Key Vault token, or set AZURE_KEY_VAULT_ACCESS_TOKEN"
    }
    $token = az account get-access-token --resource https://vault.azure.net --query accessToken -o tsv
    if ($LASTEXITCODE -ne 0 -or -not $token) {
      throw "could not get a Key Vault access token: sign in first (az login; in CI, azure/login)"
    }
  }
  if ($env:GITHUB_ACTIONS -eq "true") { Write-Host "::add-mask::$token" }

  Write-Host "signing $($Binaries.Count) file(s) with $env:AZURE_CODESIGN_CERT from $env:AZURE_KEY_VAULT"
  Invoke-Checked "AzureSignTool sign" {
    & $azureSignTool sign `
      --azure-key-vault-url "https://$env:AZURE_KEY_VAULT.vault.azure.net" `
      --azure-key-vault-certificate $env:AZURE_CODESIGN_CERT `
      --azure-key-vault-accesstoken $token `
      --file-digest sha256 `
      --timestamp-rfc3161 http://timestamp.digicert.com `
      --timestamp-digest sha256 `
      $Binaries
  }
  foreach ($bin in $Binaries) {
    Invoke-Checked "signtool verify $bin" { & $signtool.FullName verify /pa $bin }
    Write-Host "signed by: $((Get-AuthenticodeSignature -LiteralPath $bin).SignerCertificate.Subject)"
  }
  Write-Host "authenticode: ok"
} finally {
  Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
}
