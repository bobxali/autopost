param(
  [Parameter(Mandatory = $true)]
  [string]$ExtensionId,
  [switch]$Chrome = $true,
  [switch]$Edge = $true
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$hostName = "com.auto_re.logger"
$hostPy = Join-Path $root "native_host.py"
$hostCmd = Join-Path $root "native_host.cmd"
$manifestPath = Join-Path $root "$hostName.json"

$pythonCmd = (Get-Command python -ErrorAction SilentlyContinue)
if (-not $pythonCmd) {
  $pythonCmd = (Get-Command py -ErrorAction SilentlyContinue)
}
if (-not $pythonCmd) {
  throw "Python was not found in PATH. Install Python first."
}
$pythonExe = $pythonCmd.Source

$cmdBody = "@echo off`r`n`"$pythonExe`" `"$hostPy`"`r`n"
Set-Content -Path $hostCmd -Value $cmdBody -Encoding ASCII

$manifest = @{
  name = $hostName
  description = "Auto RE local developer logger"
  path = $hostCmd
  type = "stdio"
  allowed_origins = @("chrome-extension://$ExtensionId/")
}
$manifest | ConvertTo-Json -Depth 4 | Set-Content -Path $manifestPath -Encoding ASCII

if ($Chrome) {
  $chromeKey = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName"
  New-Item -Path $chromeKey -Force | Out-Null
  Set-ItemProperty -Path $chromeKey -Name "(default)" -Value $manifestPath
  Write-Host "Chrome host registered at $chromeKey"
}

if ($Edge) {
  $edgeKey = "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$hostName"
  New-Item -Path $edgeKey -Force | Out-Null
  Set-ItemProperty -Path $edgeKey -Name "(default)" -Value $manifestPath
  Write-Host "Edge host registered at $edgeKey"
}

Write-Host "Done. Log file will be created at: $env:LOCALAPPDATA\\AutoRe\\dev_logger\\events.ndjson"
