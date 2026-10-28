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

With -Set ui (or all) it times the window's own interactions at +N instead (or as well), each in the state a person
reaches it in, on Fund III's box selected at 100%: pointing at a field (its outline and its inspector row lit);
pointing at All like it (its cue) and clicking it; Fill's popover with that group chosen, a swatch pointed at (its
preview) and clicked; Show on chart's eye clicked; a field double-clicked, typed in and kept with Enter; a handle's
dot dragged over another box and dropped there (the two-box panel); on Entities, a heading dragged to a new place, a
column's filter opened, and a name typed in the new row and kept with Enter; and Find, Ctrl+K and typing in it. Event
Timing doesn't time a pointer moved, so pointing is timed from the input to the frame that draws what it shows.
With -CpuProfile <folder>, each action's first round is profiled, and its busiest functions printed, by their own time
and by all they called.
#>
param([int]$N = 200, [int]$Rounds = 3, [string]$Chrome = '', [int]$Port = 9520, [ValidateSet('edits', 'ui', 'all')][string]$Set = 'edits', [string]$CpuProfile = '')
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
# The pointer moved (with the button held, `held`), pressed or let go; a double-click; keys typed one by one, as a person
# types them, `gap` ms apart.
function MoveTo([double]$X, [double]$Y, [switch]$Held) { $null = Cdp 'Input.dispatchMouseEvent' @{ type = 'mouseMoved'; x = $X; y = $Y; button = $(if ($Held) { 'left' } else { 'none' }); buttons = $(if ($Held) { 1 } else { 0 }) } }
function Press([double]$X, [double]$Y, [int]$Count = 1) { $null = Cdp 'Input.dispatchMouseEvent' @{ type = 'mousePressed'; x = $X; y = $Y; button = 'left'; buttons = 1; clickCount = $Count } }
function Release([double]$X, [double]$Y, [int]$Count = 1) { $null = Cdp 'Input.dispatchMouseEvent' @{ type = 'mouseReleased'; x = $X; y = $Y; button = 'left'; buttons = 0; clickCount = $Count } }
function DoubleClick([double]$X, [double]$Y) { MoveTo $X $Y; Press $X $Y 1; Release $X $Y 1; Press $X $Y 2; Release $X $Y 2 }
function TypeKeys([string]$Text, [int]$Gap = 120) {
  foreach ($c in $Text.ToCharArray()) {
    $s = [string]$c; $up = $s.ToUpper(); $vk = [int][char]$up
    $code = if ($c -eq ' ') { 'Space' } elseif ($c -match '\d') { "Digit$c" } elseif ($c -match '[a-zA-Z]') { "Key$up" } else { '' }
    $null = Cdp 'Input.dispatchKeyEvent' @{ type = 'keyDown'; key = $s; code = $code; text = $s; unmodifiedText = $s; windowsVirtualKeyCode = $vk }
    $null = Cdp 'Input.dispatchKeyEvent' @{ type = 'keyUp'; key = $s; code = $code; windowsVirtualKeyCode = $vk }
    Pause $Gap
  }
}
function Key([string]$K, [int]$Code, [int]$Mods = 0) {
  $null = Cdp 'Input.dispatchKeyEvent' @{ type = 'rawKeyDown'; key = $K; code = $(if ($K.Length -eq 1) { 'Key' + $K.ToUpper() } else { $K }); windowsVirtualKeyCode = $Code; modifiers = $Mods }
  $null = Cdp 'Input.dispatchKeyEvent' @{ type = 'keyUp'; key = $K; windowsVirtualKeyCode = $Code; modifiers = $Mods }
}
# The middle of what a selector finds, its text `text` if given, on screen; and its edges, l, t, r and b.
function At([string]$Sel, [string]$Text = '') {
  $p = Js "(() => { const e = [...document.querySelectorAll($(ConvertTo-Json $Sel))].find(e => e.getClientRects().length && (!$(ConvertTo-Json $Text) || e.textContent.trim() === $(ConvertTo-Json $Text))); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, r: r.right, b: r.bottom }; })()"
  if (-not $p) { throw "Nothing on screen is $Sel $Text" }
  return $p
}
# A CPU profile's busiest functions: by their own time, and by all they called, in ms.
function Busiest($P, [int]$Top = 12) {
  $nodes = @{}; $up = @{}
  foreach ($n in $P.nodes) { $nodes[[int]$n.id] = $n; foreach ($c in @($n.children)) { if ($null -ne $c) { $up[[int]$c] = [int]$n.id } } }
  $name = { param($f) "$(if ($f.functionName) { $f.functionName } else { '(anonymous)' }) $($f.url -replace '.*/', ''):$($f.lineNumber + 1)" }
  $self = @{}; $all = @{}
  for ($i = 0; $i -lt $P.samples.Count - 1; $i++) {
    $dt = [double]$P.timeDeltas[$i + 1] / 1000; $id = [int]$P.samples[$i]
    $k = & $name $nodes[$id].callFrame
    if ($k -match '^\((idle|program|root|garbage collector)\)') { if ($k -like '(garbage*') { $self[$k] += $dt }; continue }
    $self[$k] += $dt
    $seen = @{}
    for ($x = $id; $up.ContainsKey($x) -or $x -eq $id; $x = $up[$x]) { $g = & $name $nodes[$x].callFrame; if (-not $seen.ContainsKey($g)) { $seen[$g] = 1; $all[$g] += $dt }; if (-not $up.ContainsKey($x)) { break } }
  }
  $fmt = { param($h) $h.GetEnumerator() | Where-Object { $_.Key -notmatch '^\(root\)' } | Sort-Object Value -Descending | Select-Object -First $Top | ForEach-Object { '    {0,7:N1}  {1}' -f $_.Value, $_.Key } }
  '  own time:'; & $fmt $self; '  with what it called:'; & $fmt $all
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
  // How long until a selector finds something, or a condition holds, polled each frame.
  window.__until = c => new Promise(done => { const t0 = performance.now(), ok = typeof c === 'function' ? c : () => document.querySelector(c);
    const f = () => ok() ? done(performance.now() - t0) : performance.now() - t0 > 8000 ? done(-1) : requestAnimationFrame(f); f(); });
  return 1;
})()
'@
  $results = [ordered]@{}; $aims = @{}
  # An action's time, against its target: 300 ms to the paint for an edit, 200 for the window's own interactions.
  function Note([string]$Label, [string]$What, $T, [int]$Aim = 300) {
    $k = "$What|$Label"
    if (-not $results.Contains($k)) { $results[$k] = New-Object Collections.ArrayList; $aims[$k] = $Aim }
    [void]$results[$k].Add($T)
  }
  # With -CpuProfile, the action that follows is profiled, to its Take, its first round only.
  $script:profiled = @{}; $script:profiling = $null
  function Prof([string]$What) {
    if (-not $CpuProfile -or $script:profiled.ContainsKey($What)) { return }
    $script:profiled[$What] = 1; $script:profiling = $What
    $null = Cdp 'Profiler.enable'; $null = Cdp 'Profiler.setSamplingInterval' @{ interval = 250 }; $null = Cdp 'Profiler.start'
  }
  function Take([string]$Names) {
    Pause 2500
    if ($script:profiling) {
      $p = (Cdp 'Profiler.stop').profile; $file = Join-Path $CpuProfile (($script:profiling -replace '[^\w]+', '-').Trim('-') + '.cpuprofile')
      $null = New-Item -ItemType Directory -Force $CpuProfile; [IO.File]::WriteAllText($file, ($p | ConvertTo-Json -Depth 100 -Compress))
      Write-Host "$($script:profiling):"; Busiest $p | Out-Host
      $script:profiling = $null
    }
    return Js "__take($(ConvertTo-Json ($Names -split ',')))"
  }
  # Until the frame in which a condition holds (a selector, or a function, in JavaScript), from the input after it.
  function Seen([string]$Cond) { $script:cond = $Cond; $null = Js "window.__seen = __until($Cond); 1" }
  # The longer of an input's Event Timing and the frame Seen waited for.
  function Timed([string]$Names) {
    $t = Take $Names; $s = Js '__seen'
    if ($s -lt 0) { throw "Never seen: $script:cond" }
    $t.d = [Math]::Max([double]$t.d, [double]$s); return $t
  }
  function Round([string]$Label) {
    $charts = Js 'App.views.peek().filter(v => v.layout === "chart").map(v => v.name)'
    for ($r = 0; $r -lt $Rounds; $r++) {
      $null = Js 'Shell.select(["own_us_fund"]); 1'; Pause 1500
      $tag = At '.fxbar .fx-out button.tag'
      Mouse 'mouseMoved' 700 860; Pause 800; $null = Js '__take([])'
      $null = Js 'window.__seen = __until(".fx-delta"); 1'
      Mouse 'mouseMoved' $tag.x $tag.y
      $t = Take 'pointerover'; $t.d = Js '__seen'
      Note $Label 'Point at a tag (its preview shown)' $t 0
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
  # ---- The window's own interactions (-Set ui), each as a person reaches it ----
  function UiRound([string]$Label) {
    $note = { param($What, $T) Note $Label $What $T 200 }
    for ($r = 0; $r -lt $Rounds; $r++) {
      # Structure, Fund III's box selected, This box, at 100% round it.
      $s = At 'button.sheet' 'Structure'; Click $s.x $s.y; Pause 1500
      $null = Js '(() => { Shell.select(["fund"]); return 1; })()'; Pause 800
      $null = Js '(() => { const c = Canvas.active.peek(); c.zoom(1); c.zoomTo(["fund"]); return 1; })()'; Pause 1500
      # A field pointed at, its Jurisdiction: outlined, and its row in the inspector lit.
      MoveTo 1200 140; Pause 600; $null = Js '__take([])'
      $f = At 'text[data-text="fund_juris"]'
      Prof 'Point at a field'; Seen '() => document.querySelector(".dc-field.hover") && document.querySelector(".row.lit")'
      MoveTo $f.x $f.y
      & $note 'Point at a field (outlined, its row lit)' (Timed 'pointerover,pointerenter')
      # All like it: pointed at, its cue; clicked, the group chosen.
      $like = At '[data-fb="like"]'
      Prof 'Point at All like it'; Seen '".dc-cue"'
      MoveTo $like.x $like.y
      & $note 'Point at All like it (its cue)' (Timed 'pointerover,pointerenter')
      Prof 'Click All like it'
      Click $like.x $like.y
      & $note 'Click All like it' (Take 'pointerdown,pointerup,click')
      # Fill, the group chosen: its popover; a swatch pointed at, previewed, then another; and one clicked, made.
      $fill = At '[data-fb="fill"]'
      Seen '".palette"'
      Click $fill.x $fill.y
      & $note 'Open Fill' (Timed 'pointerdown,pointerup,click')
      $sw = Js '[...document.querySelectorAll(".palette > button")].map(e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })'
      foreach ($i in @((13 + $r), (23 + $r))) {
        Prof 'Point at a swatch'
        MoveTo $sw[$i].x $sw[$i].y
        & $note 'Point at a swatch (its preview)' (Take 'pointerover,pointerenter')
      }
      Prof 'Click a swatch'
      Click $sw[23 + $r].x $sw[23 + $r].y
      & $note 'Click a swatch (made for the group)' (Take 'pointerdown,pointerup,click')
      # Show on chart, at This box: EIN shown in Fund III's box, or hidden again.
      $own = At '[data-fb="own"]'; Click $own.x $own.y; Pause 800
      $row = At '.row[data-key="fund_ein"]'; MoveTo $row.x $row.y; Pause 400
      $eye = At '.row[data-key="fund_ein"] .onchart'; MoveTo $eye.x $eye.y; Pause 600; $null = Js '__take([])'
      Prof 'Click Show on chart'
      Click $eye.x $eye.y
      & $note 'Click Show on chart' (Take 'pointerdown,pointerup,click')
      # A field double-clicked, typed in, and kept with Enter.
      MoveTo 1200 140; Pause 400; $null = Js '__take([])'
      $f = At 'text[data-text="fund_name"]'
      Prof 'Double-click a field'; Seen '".dc-edit"'
      DoubleClick $f.x $f.y
      & $note 'Double-click a field (its editor)' (Timed 'pointerdown,pointerup,mousedown,mouseup,click,dblclick')
      $null = Cdp 'Input.insertText' @{ text = 'Calder Ridge Capital Partners III' }; Pause 300; $null = Js '__take([])'
      TypeKeys " LP$r"
      & $note 'Type in a field' (Take 'keydown,keypress,input,keyup')
      Prof 'Enter in a field'
      Key 'Enter' 13
      & $note 'Enter (the field kept)' (Take 'keydown')
      # Relating: a handle's dot dragged over another box, and dropped there.
      $null = Js '(() => { Shell.select(["fund"]); return 1; })()'; Pause 1000
      $bx = At '[data-cell-id="fund"]'; $to = At '[data-cell-id="blocker"]'
      MoveTo $bx.x ($bx.b - 2); Pause 600
      $h = At '.dc-handle:not([hidden])'
      MoveTo $h.x $h.y; Pause 300; $null = Js '__take([])'
      Press $h.x $h.y
      foreach ($k in 1..4) { MoveTo ($h.x + ($to.x - $h.x) * $k / 5) ($h.y + ($to.y - 12 - $h.y) * $k / 5) -Held; Pause 80 }
      Pause 300; $null = Js '__take([])'
      Prof 'Drag a dot over a box'; Seen '() => document.querySelectorAll(".dc-hl.haccent").length >= 2'
      MoveTo $to.x $to.y -Held
      & $note 'Drag a dot over a box (both lit)' (Timed 'pointerover,pointerenter')
      Prof 'Drop it on a box'; Seen '".ih-title .and"'
      Release $to.x $to.y
      & $note 'Drop it on a box (the two-box panel)' (Timed 'pointerup,mouseup')
      # Entities: a heading dragged to a new place, a column's filter opened, a name typed in the new row and kept.
      $s = At 'button.sheet' 'Entities'; $null = Js '__take([])'
      Seen '() => document.querySelectorAll(".tabulator-row").length > 20'
      Click $s.x $s.y
      & $note 'Show Entities' (Timed 'pointerdown,mousedown,click')
      Pause 1000
      $hd = At '.tabulator-col .t' 'Jurisdiction'; $w = At '.tabulator-col .t' 'Entity Type'; $dx = $(if ($r % 2) { 1 } else { -1 }) * 1.6 * [Math]::Abs($hd.x - $w.x)
      MoveTo $hd.x $hd.y; Pause 300
      Press $hd.x $hd.y
      foreach ($k in 1..5) { MoveTo ($hd.x + $dx * $k / 5) $hd.y -Held; Pause 60 }
      Pause 300; $null = Js '__take([])'; Prof 'Drop a heading'
      Release ($hd.x + $dx) $hd.y
      & $note 'Drop a heading in a new place' (Take 'pointerup,mouseup,click')
      $hd = At '.tabulator-col .t' 'Entity Type'; MoveTo $hd.x $hd.y; Pause 400
      $cm = Js '(() => { const t = [...document.querySelectorAll(".tabulator-col .t")].find(e => e.textContent.trim() === "Entity Type"), f = t.closest(".tabulator-col").querySelector(".col-menu"), r = f.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()'
      MoveTo $cm.x $cm.y; Pause 300; $null = Js '__take([])'
      Prof 'Open a column menu'; Seen '".float .menu"'
      Click $cm.x $cm.y
      & $note 'Open a column''s menu' (Timed 'pointerdown,pointerup,click')
      $fi = Js '(() => { const e = [...document.querySelectorAll(".float .menu-item")].find(e => /^Filter/.test(e.textContent.trim())), r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()'; MoveTo $fi.x $fi.y; Pause 300; $null = Js '__take([])'
      Prof 'Open a filter'; Seen '".tfilter"'
      Click $fi.x $fi.y
      & $note 'Choose Filter (its values)' (Timed 'pointerdown,pointerup,click')
      Key 'Escape' 27; Pause 600
      $nr = At '.nr-name'; Click $nr.x $nr.y; Pause 400; $null = Js '__take([])'
      TypeKeys "New Entity $r"
      & $note 'Type in the new row' (Take 'keydown,keypress,input,keyup')
      Prof 'Enter in the new row'
      Key 'Enter' 13
      & $note 'Enter (a row added)' (Take 'keydown')
      Key 'Escape' 27; Pause 400
      # Find, on the chart: Ctrl+K, and typing in it.
      $s = At 'button.sheet' 'Structure'; Click $s.x $s.y; Pause 2000; $null = Js '__take([])'
      Prof 'Ctrl+K'; Seen '".findpal"'
      Key 'k' 75 2
      & $note 'Ctrl+K (Find)' (Timed 'keydown')
      Prof 'Type in Find'
      TypeKeys 'extra 12'
      & $note 'Type in Find' (Take 'keydown,keypress,input,keyup')
      Key 'Escape' 27; Pause 600
    }
  }
  if ($Set -ne 'ui') { Round 'sample' }
  $null = Js 'new Promise(r => { const s = document.createElement("script"); s.src = "tests/grown.js"; s.onload = r; document.head.appendChild(s); })'
  $null = Js "(() => { App.change(tx => { for (const [id, r] of Object.entries(grown({}, $N))) if (id.startsWith('x_')) tx.add('record', r, id); }); return 1; })()"
  Pause 8000; $null = Js '__take([])'
  if ($Set -ne 'ui') { Round "+$N" }
  if ($Set -ne 'edits') { UiRound "+$N" }
  $fmt = { param($v) if ($v -lt 16) { '< 16' } else { '{0:N0}' -f $v } }
  $rows = foreach ($k in $results.Keys) {
    $what, $label = $k -split '\|'; $ts = $results[$k]
    $worst = ($ts | Measure-Object d -Maximum).Maximum; $long = ($ts | Measure-Object long -Maximum).Maximum
    # The targets hold at +N: each action's to the paint (none for pointing at a tag, which only previews); 150 ms a task.
    $aim = $aims[$k]
    [pscustomobject]@{ Action = $what; Chart = $label; 'Best (ms)' = (& $fmt (($ts | Measure-Object d -Minimum).Minimum)); 'Worst (ms)' = (& $fmt $worst)
      'Longest task (ms)' = ('{0:N0}' -f $long); Met = $(if ($label -eq 'sample') { '' } else { @($(if ($aim) { if ($worst -le $aim) { 'paint' } else { "PAINT OVER $aim" } }), $(if ($long -le 150) { 'tasks' } else { 'TASK OVER 150' })) -ne $null -join ', ' }) }
  }
  $rows | Format-Table -AutoSize | Out-String -Width 220
} finally {
  try { $script:ws.Dispose() } catch {}
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like "*$profileDir*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Milliseconds 500
  Remove-Item -Recurse -Force $profileDir -ErrorAction SilentlyContinue
}
