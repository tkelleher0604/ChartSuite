# Local files and completion signal for run.ps1. No browser debugging or app-model access.
param([string]$Root, [int]$Port, [string]$Ready)
$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath($Root).TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar
$listener = [Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$waiting = @{}
$completed = @{}
function Reply($context, [byte[]]$bytes, [string]$type = 'text/plain', [int]$status = 200) {
  $context.Response.StatusCode = $status
  $context.Response.ContentType = $type
  $context.Response.ContentLength64 = $bytes.Length
  $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $context.Response.Close()
}
$pixel = [Text.Encoding]::UTF8.GetBytes('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>')
try {
  $listener.Start()
  [IO.File]::WriteAllText($Ready, 'ready')
  while ($listener.IsListening) {
    $pending = $listener.GetContextAsync()
    while (!$pending.Wait(100)) {} # Keep the background job interruptible during idle periods.
    $context = $pending.Result
    $url = $context.Request.Url
    $path = [uri]::UnescapeDataString($url.AbsolutePath)
    $run = $context.Request.QueryString['runner']
    if ($path -eq '/__tests/stop') { Reply $context ([byte[]]@()); break }
    if ($path -eq '/__tests/hold.svg') {
      if ($completed[$run]) { Reply $context $pixel 'image/svg+xml' }
      else { $waiting[$run] = $context }
      continue
    }
    if ($path -eq '/__tests/done') {
      $completed[$run] = $true
      if ($waiting[$run]) { Reply $waiting[$run] $pixel 'image/svg+xml'; $waiting.Remove($run) }
      Reply $context ([byte[]]@())
      continue
    }
    $file = [IO.Path]::GetFullPath((Join-Path $Root $path.TrimStart('/')))
    if (!$file.StartsWith($Root, [StringComparison]::OrdinalIgnoreCase) -or !(Test-Path -LiteralPath $file -PathType Leaf)) {
      Reply $context ([Text.Encoding]::UTF8.GetBytes('Not found')) 'text/plain' 404
      continue
    }
    $type = switch ([IO.Path]::GetExtension($file)) {
      '.html' { 'text/html; charset=utf-8' }
      '.js' { 'application/javascript; charset=utf-8' }
      '.css' { 'text/css; charset=utf-8' }
      '.json' { 'application/json; charset=utf-8' }
      '.svg' { 'image/svg+xml' }
      '.png' { 'image/png' }
      '.woff2' { 'font/woff2' }
      '.woff' { 'font/woff' }
      '.ttf' { 'font/ttf' }
      default { 'application/octet-stream' }
    }
    if ($run -and $file.EndsWith('-test.html')) {
      # Keep document load pending until its existing reporter finishes. Timers, animation frames,
      # workers and IndexedDB run on real time; --dump-dom then captures the completed report.
      # Only observe report text: this script never drives controls or changes test outcomes.
      $html = [IO.File]::ReadAllText($file)
      $id = [uri]::EscapeDataString($run)
      $probe = @"
<img hidden alt="" src="/__tests/hold.svg?runner=$id">
<script>
(() => {
  const timer = setInterval(() => {
    const text = [document.title, document.querySelector('#out')?.textContent, ...[...document.querySelectorAll('.results')].map(el => el.textContent)].join(' ');
    if (/^(?:PASS|FAIL) \d+$/.test(document.title) || /\b\d+ pass(?:ed)?,\s*\d+ fail(?:ed)?\b|\bAll \d+ passed\b|\b\d+ of \d+ failed\b|\b\d+\/\d+ passed\b/.test(text)) {
      clearInterval(timer);
      fetch('/__tests/done?runner=$id');
    }
  }, 100);
})();
</script>
"@
      $at = $html.LastIndexOf('</body>', [StringComparison]::OrdinalIgnoreCase)
      if ($at -lt 0) { $html += $probe } else { $html = $html.Insert($at, $probe) }
      Reply $context ([Text.Encoding]::UTF8.GetBytes($html)) $type
    } else { Reply $context ([IO.File]::ReadAllBytes($file)) $type }
  }
} finally {
  foreach ($context in $waiting.Values) { $context.Response.Abort() }
  $listener.Close()
}
