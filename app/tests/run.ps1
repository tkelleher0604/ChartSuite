# Run the browser suites without installing packages or opening the user's browser profile.
# Examples: ./run.ps1; ./run.ps1 -Suite builder,store; ./run.ps1 -Suite builder -Width 1024
[CmdletBinding()]
param(
  [ValidateSet('text','core','engine','scene','export','inspector','canvas','table','store','tour','skill','perf','builder','design-schema','formulabar','formulabar-rules')]
  [string[]]$Suite = @('text','core','engine','scene','export','inspector','canvas','table','store','tour','skill','perf','builder','design-schema','formulabar','formulabar-rules'),
  [string]$Browser,
  [string]$Artifacts,
  [ValidateRange(800,3840)][int]$Width = 1440,
  [ValidateRange(600,2160)][int]$Height = 1000,
  [ValidateSet('light','dark')][string]$Theme = 'light',
  [ValidateRange(30,600)][int]$TimeoutSeconds = 300
)
$ErrorActionPreference = 'Stop'
if (!$Browser) {
  $Browser = @(
    "$env:ProgramFiles/Google/Chrome/Application/chrome.exe",
    "${env:ProgramFiles(x86)}/Microsoft/Edge/Application/msedge.exe",
    "$env:LOCALAPPDATA/Google/Chrome/Application/chrome.exe"
  ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
if (!$Browser -or !(Test-Path -LiteralPath $Browser)) { throw 'Chrome or Edge was not found. Pass -Browser with its executable path.' }
if (!$Artifacts) { $Artifacts = Join-Path ([IO.Path]::GetTempPath()) ('dendra-tests-' + [guid]::NewGuid().ToString('N')) }
$Artifacts = [IO.Path]::GetFullPath($Artifacts)
New-Item -ItemType Directory -Path $Artifacts -Force | Out-Null
$results = @()
Write-Output "Artifacts: $Artifacts"
# An ephemeral loopback server keeps load pending until each fixture reports completion.
# Unlike virtual time, real time lets animation frames, workers and browser storage finish.
$socket = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$socket.Start()
$port = $socket.LocalEndpoint.Port
$socket.Stop()
$ready = Join-Path $Artifacts ('server-' + [guid]::NewGuid().ToString('N') + '.ready')
$server = Start-Job -FilePath (Join-Path $PSScriptRoot 'serve.ps1') -ArgumentList (Split-Path (Split-Path $PSScriptRoot)), $port, $ready
try {
for ($i = 0; $i -lt 100 -and !(Test-Path -LiteralPath $ready); $i++) { Start-Sleep -Milliseconds 100 }
if (!(Test-Path -LiteralPath $ready)) { throw ('Test server did not start: ' + (Receive-Job $server 2>&1 | Out-String)) }
foreach ($name in $Suite) {
  $dir = Join-Path $Artifacts $name
  New-Item -ItemType Directory -Path $dir -Force | Out-Null
  $file = if ($name -eq 'formulabar-rules') { 'formulabar' } else { $name }
  $query = switch ($name) {
    'inspector' { '?run' }
    'formulabar' { '?checks' }
    'formulabar-rules' { '?rules' }
    'builder' { '?theme=' + $Theme }
    default { '' }
  }
  $separator = if ($query) { '&' } else { '?' }
  $runId = [guid]::NewGuid().ToString('N')
  $url = "http://127.0.0.1:$port/app/tests/$file-test.html$query${separator}runner=$runId"
  $dom = Join-Path $dir 'dom.html'
  $err = Join-Path $dir 'browser.log'
  $shot = Join-Path $dir 'screen.png'
  $profile = Join-Path $dir ('profile-' + [guid]::NewGuid().ToString('N'))
  $browserArgs = @('--headless=new','--disable-gpu','--no-first-run',
    "--window-size=$Width,$Height","--user-data-dir=$profile",'--dump-dom',"--screenshot=$shot",$url)
  # Start-Process joins its array into a Windows command line. Quote each argument explicitly.
  $quoted = $browserArgs | ForEach-Object { if ($_.Contains('"')) { throw 'Browser arguments cannot contain quotes.' }; '"' + $_ + '"' }
  $watch = [Diagnostics.Stopwatch]::StartNew()
  $process = $null
  $result = [ordered]@{ suite = $name; passed = 0; failed = 0; status = 'error'; seconds = 0; detail = ''; artifacts = $dir }
  try {
    $process = Start-Process -FilePath $Browser -WindowStyle Hidden -ArgumentList $quoted -RedirectStandardOutput $dom -RedirectStandardError $err -PassThru
    $handle = $process.Handle # Retain the handle so Windows PowerShell can read ExitCode after exit.
    while (!$process.WaitForExit(1000)) {
      if ($watch.Elapsed.TotalSeconds -ge $TimeoutSeconds) {
        # Release the load gate to retain a screenshot and DOM for an incomplete test too.
        Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri "http://127.0.0.1:$port/__tests/done?runner=$runId" | Out-Null
        $process.WaitForExit(5000) | Out-Null
        throw "Browser exceeded $TimeoutSeconds seconds."
      }
    }
    if ($process.ExitCode -ne 0) { throw "Browser exited with code $($process.ExitCode)." }
    $html = Get-Content -LiteralPath $dom -Encoding utf8 -Raw
    # Never match test source or source templates as results. Only completed, rendered reports count.
    $rendered = [regex]::Replace($html, '(?is)<(script|style)\b[^>]*>.*?</\1>', '')
    $plain = [System.Net.WebUtility]::HtmlDecode([regex]::Replace($rendered, '<[^>]*>', ' '))
    $counts = [regex]::Match($plain, '(\d+) pass(?:ed)?,\s*(\d+) fail(?:ed)?')
    $all = [regex]::Match($plain, 'All (\d+) passed')
    $some = [regex]::Match($plain, '(\d+) of (\d+) failed')
    $fraction = [regex]::Match($plain, '(\d+)/(\d+) passed')
    if ($counts.Success) { $result.passed = [int]$counts.Groups[1].Value; $result.failed = [int]$counts.Groups[2].Value }
    elseif ($all.Success) { $result.passed = [int]$all.Groups[1].Value }
    elseif ($some.Success) { $result.failed = [int]$some.Groups[1].Value; $result.passed = [int]$some.Groups[2].Value - $result.failed }
    elseif ($fraction.Success) { $result.passed = [int]$fraction.Groups[1].Value; $result.failed = [int]$fraction.Groups[2].Value - $result.passed }
    else { throw 'No completed test report. Inspect dom.html, screen.png and browser.log.' }
    if ($result.passed + $result.failed -eq 0) { throw 'The test report contains no checks.' }
    $result.status = if ($result.failed) { 'fail' } else { 'pass' }
  } catch {
    $result.detail = $_.Exception.Message
  } finally {
    if ($process -and !$process.HasExited) { Stop-Process -Id $process.Id -ErrorAction SilentlyContinue }
    $watch.Stop()
    $result.seconds = [Math]::Round($watch.Elapsed.TotalSeconds, 2)
  }
  $results += [pscustomobject]$result
  $results | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $Artifacts 'results.json') -Encoding utf8
  Write-Output ("{0}: {1} passed, {2} failed ({3}, {4}s) {5}" -f $name,$result.passed,$result.failed,$result.status,$result.seconds,$result.detail)
}
} finally {
  try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri "http://127.0.0.1:$port/__tests/stop" | Out-Null } catch {}
  Stop-Job $server
  Remove-Job $server
}
$passed = ($results | Measure-Object -Property passed -Sum).Sum
$failed = ($results | Measure-Object -Property failed -Sum).Sum
$errors = @($results | Where-Object status -eq 'error').Count
Write-Output "Total: $passed passed, $failed failed; $errors incomplete suites. Artifacts: $Artifacts"
if ($failed -or $errors) { exit 1 }
