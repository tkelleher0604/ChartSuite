<#
Dendra in real time, as a person meets it: from each input to the paint after it, on the sample and on the sample
grown by -N entities (grown.js). perf-test.html runs under a virtual clock, which stands still while anything runs,
so it can time the work but not this. This script drives the window in headless Chrome over its DevTools protocol
with real input, the mouse and keys as Chrome takes them from a person, and reads Chrome's Event Timing: an
event's duration is from the input until the next frame is painted. It also reads the longest task the page runs
after each input, which is how long the next input would wait.

Run it with Chrome installed, from any folder:
  powershell -NoProfile -ExecutionPolicy Bypass -File app\tests\realtime.ps1 [-N 200] [-Rounds 3] [-Chrome <chrome.exe>]

For each action it prints the best and the worst of its rounds, input to paint, and the longest task in the three
seconds after (the work done ahead while the window is idle among them). The targets, at +N: an edit, a ruling,
its Undo and showing another view painted within 300 ms; no task longer than about 150 ms; and the sample no
slower than it was. The actions: pointing at a tag in the formula bar (its preview); clicking it to rule it out;
Undo; typing a value in the formula bar and Enter; showing another chart view by its tab, and the first again.
Event Timing reports only inputs of 16 ms or more, to the nearest 8; one under that is printed as < 16.
#>
param([int]$N = 200, [int]$Rounds = 3, [string]$Chrome = '', [int]$Port = 9520)
$ErrorActionPreference = 'Stop'
$app = (Resolve-Path (Join-Path $PSScriptRoot '..\index.html')).Path
if (-not $Chrome) { $Chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LocalAppData\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1 }
if (-not $Chrome) { throw 'Chrome not found: give its path with -Chrome.' }

# ---- A small DevTools client ----
$profileDir = Join-Path ([IO.Path]::GetTempPath()) ('dendra-realtime-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
$chromeArgs = @('--headless=new', "--remote-debugging-port=$Port", "--user-data-dir=$profileDir", '--allow-file-access-from-files', '--force-device-scale-factor=1',
  '--window-size=1440,900', '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', 'about:blank')
$proc = Start-Process -FilePath $Chrome -ArgumentList $chromeArgs -PassThru
$script:id = 0; $script:ws = $null; $script:pending = $null; $script:buf = New-Object byte[] 1048576; $script:ms = New-Object IO.MemoryStream
function Receive([int]$TimeoutMs) {
  $deadline = [DateTime]::Now.AddMilliseconds($TimeoutMs)
  while ($true) {
    if (-not $script:pending) { $script:pending = $script:ws.ReceiveAsync((New-Object ArraySegment[byte] -ArgumentList @(, $script:buf)), [Threading.CancellationToken]::None) }
    $left = [int][Math]::Max(0, ($deadline - [DateTime]::Now).TotalMilliseconds)
    if (-not $script:pending.Wait($left)) { return $null }
    $r = $script:pending.Result; $script:pending = $null
    $script:ms.Write($script:buf, 0, $r.Count)
    if ($r.EndOfMessage) { $t = [Text.Encoding]::UTF8.GetString($script:ms.ToArray()); $script:ms.SetLength(0); return $t }
  }
}
function Cdp([string]$Method, $Params = @{}, [int]$TimeoutMs = 120000) {
  $script:id++; $my = $script:id
  $bytes = [Text.Encoding]::UTF8.GetBytes((@{ id = $my; method = $Method; params = $Params } | ConvertTo-Json -Depth 20 -Compress))
  $script:ws.SendAsync((New-Object ArraySegment[byte] -ArgumentList @(, $bytes)), 'Text', $true, [Threading.CancellationToken]::None).Wait()
  $deadline = [DateTime]::Now.AddMilliseconds($TimeoutMs)
  while ([DateTime]::Now -lt $deadline) {
    $t = Receive ([int]($deadline - [DateTime]::Now).TotalMilliseconds)
    if ($null -eq $t) { break }
    $o = $t | ConvertFrom-Json
    if ($o.id -eq $my) { if ($o.error) { throw "$Method failed: $($o.error.message)" }; return $o.result }
  }
  throw "$Method timed out"
}
# Waits, letting the page run, and DevTools' messages pass.
function Pause([int]$Ms) { $end = [DateTime]::Now.AddMilliseconds($Ms); while ([DateTime]::Now -lt $end) { $null = Receive ([int][Math]::Max(1, ($end - [DateTime]::Now).TotalMilliseconds)) } }
function Js([string]$Expr) {
  $r = Cdp 'Runtime.evaluate' @{ expression = $Expr; awaitPromise = $true; returnByValue = $true }
  if ($r.exceptionDetails) { throw "In the page: $($r.exceptionDetails.exception.description)" }
  return $r.result.value
}
function Mouse([string]$Type, [double]$X, [double]$Y) { $null = Cdp 'Input.dispatchMouseEvent' @{ type = $Type; x = $X; y = $Y; button = 'left'; clickCount = 1 } }
function Click([double]$X, [double]$Y) { Mouse 'mouseMoved' $X $Y; Mouse 'mousePressed' $X $Y; Mouse 'mouseReleased' $X $Y }
function Key([string]$K, [int]$Code, [int]$Mods = 0) {
  $null = Cdp 'Input.dispatchKeyEvent' @{ type = 'rawKeyDown'; key = $K; code = $(if ($K.Length -eq 1) { 'Key' + $K.ToUpper() } else { $K }); windowsVirtualKeyCode = $Code; modifiers = $Mods }
  $null = Cdp 'Input.dispatchKeyEvent' @{ type = 'keyUp'; key = $K; windowsVirtualKeyCode = $Code; modifiers = $Mods }
}
# The middle of what a selector finds, its text `text` if given, on screen.
function At([string]$Sel, [string]$Text = '') {
  $p = Js "(() => { const e = [...document.querySelectorAll($(ConvertTo-Json $Sel))].find(e => e.getClientRects().length && (!$(ConvertTo-Json $Text) || e.textContent.trim() === $(ConvertTo-Json $Text))); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()"
  if (-not $p) { throw "Nothing on screen is $Sel $Text" }
  return $p
}

try {
  for ($i = 0; $i -lt 100; $i++) { try { $null = Invoke-RestMethod "http://127.0.0.1:$Port/json/version" -TimeoutSec 1; break } catch { Start-Sleep -Milliseconds 100 } }
  $targets = Invoke-RestMethod "http://127.0.0.1:$Port/json/list"
  $target = $targets | Where-Object { $_.type -eq 'page' } | Select-Object -First 1
  $script:ws = New-Object Net.WebSockets.ClientWebSocket
  $script:ws.ConnectAsync([Uri]$target.webSocketDebuggerUrl, [Threading.CancellationToken]::None).Wait()
  $null = Cdp 'Runtime.enable'; $null = Cdp 'Page.enable'
  # The launch screen and the tour are passed over, as after a first visit.
  $null = Cdp 'Page.addScriptToEvaluateOnNewDocument' @{ source = 'try { sessionStorage.setItem("dendra.launched", "1"); localStorage.setItem("dendra.toured", "1"); } catch (e) {}' }
  $null = Cdp 'Page.navigate' @{ url = 'file:///' + ($app -replace '\\', '/') }
  for ($i = 0; $i -lt 80; $i++) { Pause 250; if ((Js 'typeof App !== "undefined" && App.views.peek().length > 0') -eq $true) { break } }
  Pause 2000
  $null = Js @'
(() => {
  window.__rt = { ev: [], lt: [] };
  new PerformanceObserver(l => l.getEntries().forEach(e => __rt.ev.push({ n: e.name, d: e.duration }))).observe({ type: 'event', durationThreshold: 16 });
  new PerformanceObserver(l => l.getEntries().forEach(e => __rt.lt.push(e.duration))).observe({ type: 'longtask' });
  // The longest of the events named since the last take, and the longest task.
  window.__take = names => { const e = __rt.ev.splice(0).filter(x => names.includes(x.n)), l = __rt.lt.splice(0); return { d: e.length ? Math.max(...e.map(x => x.d)) : 0, long: l.length ? Math.max(...l) : 0 }; };
  // How long until a selector finds something, polled each frame.
  window.__until = sel => new Promise(done => { const t0 = performance.now(), f = () => document.querySelector(sel) ? done(performance.now() - t0) : performance.now() - t0 > 8000 ? done(-1) : requestAnimationFrame(f); f(); });
  return 1;
})()
'@
  $results = [ordered]@{}
  function Note([string]$Label, [string]$What, $T) {
    $k = "$What|$Label"
    if (-not $results.Contains($k)) { $results[$k] = New-Object Collections.ArrayList }
    [void]$results[$k].Add($T)
  }
  function Take([string]$Names) { Pause 2500; return Js "__take($(ConvertTo-Json ($Names -split ',')))" }
  function Round([string]$Label) {
    $charts = Js 'App.views.peek().filter(v => v.layout === "chart").map(v => v.name)'
    for ($r = 0; $r -lt $Rounds; $r++) {
      $null = Js 'Shell.select(["own_us_fund"]); 1'; Pause 1500
      $tag = At '.fxbar .fx-out button.tag'
      Mouse 'mouseMoved' 700 860; Pause 800; $null = Js '__take([])'
      $null = Js 'window.__seen = __until(".fx-delta"); 1'
      Mouse 'mouseMoved' $tag.x $tag.y
      $t = Take 'pointerover'; $t.d = Js '__seen'
      Note $Label 'Point at a tag (its preview shown)' $t
      $null = Js '__take([])'
      Click $tag.x $tag.y
      Note $Label 'Click it to rule it out' (Take 'click,pointerup,pointerdown')
      Mouse 'mouseMoved' 700 860; Pause 500; $null = Js '__take([])'
      Key 'z' 90 2
      Note $Label 'Undo' (Take 'keydown')
      $null = Js 'Shell.select(["fund_ein"]); 1'; Pause 1500
      $v = At '.fxbar .fx-out input.fx-value'
      Click $v.x $v.y; Key 'a' 65 2; $null = Cdp 'Input.insertText' @{ text = '92-' + (1000000 + $r * 13 + $Label.Length) }; Pause 1500; $null = Js '__take([])'
      Key 'Enter' 13
      Note $Label 'Type a value and Enter' (Take 'keydown')
      $null = Js 'Shell.select([]); 1'; Pause 1000; $null = Js '__take([])'
      foreach ($name in @($charts[1], $charts[0])) {
        $tab = At 'button.sheet' $name
        Click $tab.x $tab.y
        Note $Label "Show $(if ($name -eq $charts[0]) { 'the first view again' } else { 'another view' })" (Take 'pointerdown,mousedown,click')
      }
    }
  }
  Round 'sample'
  $null = Js 'new Promise(r => { const s = document.createElement("script"); s.src = "tests/grown.js"; s.onload = r; document.head.appendChild(s); })'
  $null = Js "(() => { App.change(tx => { for (const [id, r] of Object.entries(grown({}, $N))) if (id.startsWith('x_')) tx.add('record', r, id); }); return 1; })()"
  Pause 8000; $null = Js '__take([])'
  Round "+$N"
  $fmt = { param($v) if ($v -lt 16) { '< 16' } else { '{0:N0}' -f $v } }
  $rows = foreach ($k in $results.Keys) {
    $what, $label = $k -split '\|'; $ts = $results[$k]
    $worst = ($ts | Measure-Object d -Maximum).Maximum; $long = ($ts | Measure-Object long -Maximum).Maximum
    # The targets hold at +N: 300 ms to the paint for all but pointing, which only previews; 150 ms a task.
    $aim = $label -ne 'sample' -and $what -notlike 'Point*'
    [pscustomobject]@{ Action = $what; Chart = $label; 'Best (ms)' = (& $fmt (($ts | Measure-Object d -Minimum).Minimum)); 'Worst (ms)' = (& $fmt $worst)
      'Longest task (ms)' = ('{0:N0}' -f $long); Met = $(if ($label -eq 'sample') { '' } else { @($(if ($aim) { if ($worst -le 300) { 'paint' } else { 'PAINT OVER 300' } }), $(if ($long -le 150) { 'tasks' } else { 'TASK OVER 150' })) -ne $null -join ', ' }) }
  }
  $rows | Format-Table -AutoSize | Out-String -Width 220
} finally {
  try { $script:ws.Dispose() } catch {}
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like "*$profileDir*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Milliseconds 500
  Remove-Item -Recurse -Force $profileDir -ErrorAction SilentlyContinue
}
