#!/usr/bin/env bash
# The case's files, and the sample workbook as a file, as Dendra's Save as… would write it.
set -eu
here="$(dirname "$0")"
[ -d "$here/files" ] && cp -R "$here/files/." .
grep -v '^//' "$here/../../../../app/sample/calder-ridge.js" | sed '1s/^const SAMPLE = //' | sed '$s/;[[:space:]]*$//' > calder-ridge.dendra.json
