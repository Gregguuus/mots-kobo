#!/bin/sh
# Construit un site de test (appli + mots et annotations chiffrés d'exemple) et lance tests/ui.test.js.
# Usage : tests/run_ui_test.sh [dossier de travail]   (Go, Python 3, Node et Playwright requis)
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd); W=${1:-/tmp/motskobo-uitest}
mkdir -p "$W/site/js" "$W/site/vendor" "$W/shots" "$W/cfg"
cp "$ROOT"/app.html "$ROOT"/app.css "$ROOT"/sw.js "$ROOT"/icon-app-180.png "$W/site/"; cp "$ROOT"/js/*.js "$W/site/js/"; cp "$ROOT"/vendor/sql-wasm.* "$W/site/vendor/"; cp -r "$ROOT/rappels" "$W/site/"
KEY=$(python3 "$ROOT/tests/make_fixture.py" "$W/site")
rm -f "$W/KoboReader.sqlite"; python3 "$ROOT/tests/make_kobo_db.py" "$W/KoboReader.sqlite" >/dev/null
(cd "$ROOT/kobo/motskobo" && go build -o "$W/motskobo" .)
printf 'key=%s\n' "$KEY" > "$W/cfg/config.txt"
"$W/motskobo" -dir "$W/cfg" -db "$W/KoboReader.sqlite" -out "$W/site/notes.enc"
(cd "$W/site" && python3 -m http.server 8790 >/dev/null 2>&1 & echo $! > "$W/pid"); sleep 1
trap 'kill $(cat "$W/pid") 2>/dev/null' EXIT
NODE_PATH=${NODE_PATH:-$(npm root -g)} node "$ROOT/tests/ui.test.js" "http://localhost:8790/app.html#k=$KEY" "$W/shots"
