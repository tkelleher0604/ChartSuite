#!/bin/sh
# dendra.sh: dendra.js's commands where there's no Node. The same tool, run in headless Chrome or Edge.
#   sh dendra.sh vocab <workbook.json> [--chart <name>]
#   sh dendra.sh show  <workbook.json> [--chart <name>] [--find <name>] [--day <2026-03-02>]
#   sh dendra.sh check <workbook.json> [--chart <name>] [--day <2026-03-02>]
#   sh dendra.sh apply <workbook.json> <plan.json> [--write]
#   sh dendra.sh new   <workbook.json> --name <chart name> --who <name> [--template <workbook.json>] [--from <chart>]
#   any of them: --app <Dendra's app folder, or its address: https://tkelleher0604.github.io/ChartSuite/app is the
#   published app>; set DENDRA_BROWSER to a Chrome or Edge to use that one
here=$(cd "$(dirname "$0")" && pwd)
command=$1; [ $# -gt 0 ] && shift
case "$command" in vocab|show|check|apply|new) ;; *) sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;; esac

app="$here/../../../app"; write=; book=; plan=; template=; opts=
esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
while [ $# -gt 0 ]; do
  case "$1" in
    --write) write=1 ;;
    --app) app=$2; shift ;;
    --template) template=$2; shift ;;
    --chart|--find|--day|--name|--who|--from) opts="$opts\"${1#--}\": \"$(esc "$2")\", "; shift ;;
    --*) echo "There's no option $1." >&2; exit 2 ;;
    *) if [ -z "$book" ]; then book=$1; else plan=$1; fi ;;
  esac
  shift
done
[ -n "$book" ] || { echo 'Give the workbook file.' >&2; exit 2; }
case "$app" in http://*|https://*) app=${app%/} ;; *) [ -f "$app/core/log.js" ] || { echo "Dendra's app folder isn't at $app; give it with --app." >&2; exit 2; } ;; esac

# A path as a file URL, as this system's browser reads one.
# A file of the app: its address when the app is given by one.
appurl() { case "$app" in http://*|https://*) printf '%s/%s' "$app" "$1" ;; *) url "$app/$1" ;; esac; }
abs() { (cd "$(dirname "$1")" && printf '%s/%s' "$(pwd)" "$(basename "$1")"); }
url() { p=$(abs "$1"); command -v cygpath >/dev/null 2>&1 && p=$(cygpath -m "$p"); case "$p" in /*) ;; *) p="/$p" ;; esac; printf 'file://%s' "$p" | sed 's/ /%20/g'; }

browser=$DENDRA_BROWSER
if [ -z "$browser" ]; then
  for b in "/c/Program Files/Google/Chrome/Application/chrome.exe" "/c/Program Files (x86)/Google/Chrome/Application/chrome.exe" \
    "$LOCALAPPDATA/Google/Chrome/Application/chrome.exe" "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
    "/c/Program Files/Microsoft/Edge/Application/msedge.exe" "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" "/Applications/Chromium.app/Contents/MacOS/Chromium"; do
    [ -x "$b" ] && { browser=$b; break; }
  done
fi
if [ -z "$browser" ]; then
  for b in google-chrome google-chrome-stable chromium chromium-browser microsoft-edge; do command -v "$b" >/dev/null 2>&1 && { browser=$b; break; }; done
fi
[ -n "$browser" ] || { echo 'No Chrome or Edge found: install Node and use dendra.js, or set DENDRA_BROWSER.' >&2; exit 2; }

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
[ "$command" != new ] && [ ! -f "$book" ] && { echo "There's no workbook $book." >&2; exit 1; }
[ -n "$plan" ] && [ ! -f "$plan" ] && { echo "There's no plan $plan." >&2; exit 1; }
[ -n "$template" ] && [ ! -f "$template" ] && { echo "There's no template $template." >&2; exit 1; }
decode() { base64 -d 2>/dev/null || base64 -D; }
pick() { sed -n "s/.*<pre id=\"$1\">\([^<]*\)<\/pre>.*/\1/p" "$tmp/out.html"; }

tries=0
while :; do
  before=$( [ -f "$book" ] && cksum < "$book" )
  {
    printf '<!doctype html><meta charset="utf-8"><pre id="text"></pre><pre id="book"></pre><pre id="ok"></pre>\n'
    for f in tree notes log formulas; do printf '<script src="%s"></script>\n' "$(appurl "core/$f.js")"; done
    printf '<script src="%s"></script>\n' "$(url "$here/tool.js")"
    [ "$command" = new ] && [ -z "$template" ] && printf '<script src="%s"></script>\n' "$(appurl sample/calder-ridge.js)"
    printf '<script>\nconst ARGS = { command: "%s", options: { %s}, workbook: %s, plan: %s, template: %s };\n' "$command" "$opts" \
      "$( [ -f "$book" ] && printf '"%s"' "$(url "$book")" || printf null )" "$( [ -n "$plan" ] && printf '"%s"' "$(url "$plan")" || printf null )" \
      "$( [ -n "$template" ] && printf '"%s"' "$(url "$template")" || printf null )"
    cat <<'EOF'
const read = u => { const x = new XMLHttpRequest(); x.open('GET', u, false); x.overrideMimeType('text/plain; charset=utf-8'); x.send(); return x.responseText; };
const b64 = s => { const b = new TextEncoder().encode(s); let t = ''; for (let i = 0; i < b.length; i += 0x8000) t += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(t); };
let r;
try {
  r = DendraTool.run(ARGS.command, { ...ARGS.options, workbook: ARGS.workbook && read(ARGS.workbook), plan: ARGS.plan && read(ARGS.plan),
    template: ARGS.command === 'new' ? (ARGS.template ? read(ARGS.template) : JSON.stringify(SAMPLE)) : null });
} catch (e) { r = { ok: false, text: `Couldn’t run the tool: ${e.message}`, workbook: null }; }
document.getElementById('text').textContent = b64(r.text);
document.getElementById('book').textContent = r.workbook ? b64(r.workbook) : '';
document.getElementById('ok').textContent = r.ok ? 'yes' : 'no';
</script>
EOF
  } > "$tmp/run.html"
  "$browser" --headless=new --disable-gpu --no-first-run --no-default-browser-check --user-data-dir="$tmp/profile" \
    --allow-file-access-from-files --dump-dom "$(url "$tmp/run.html")" > "$tmp/out.html" 2>/dev/null
  ok=$(pick ok)
  [ -n "$ok" ] || { echo "The browser didn’t run the tool ($browser)." >&2; exit 1; }
  pick text | decode > "$tmp/text"
  if [ "$ok" != yes ]; then cat "$tmp/text" >&2; echo >&2; exit 1; fi
  pick book | decode > "$tmp/book"
  writing=; [ -s "$tmp/book" ] && { [ "$command" = new ] || [ -n "$write" ]; } && writing=1
  # Write back only if nobody saved the file meanwhile; else work again from what's there now.
  if [ -n "$writing" ] && [ "$before" != "$( [ -f "$book" ] && cksum < "$book" )" ]; then
    tries=$((tries + 1)); [ $tries -lt 5 ] && continue
    echo "$book kept changing as it was written; try again." >&2; exit 1
  fi
  [ -n "$writing" ] && { cp "$tmp/book" "$book.$$.tmp" && mv -f "$book.$$.tmp" "$book"; }
  cat "$tmp/text"; echo
  if [ "$command" = apply ] && [ -s "$tmp/book" ]; then
    if [ -n "$writing" ]; then echo; echo "Written to $book. Dendra takes it in when its tab is next in front, or open the file there (Ctrl+O)."
    else echo; echo 'Nothing written: this was a dry run. Run it again with --write to record it.'; fi
  fi
  break
done
