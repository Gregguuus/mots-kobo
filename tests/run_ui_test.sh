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
cat > "$W/mk_lecture.py" <<'PY'
import datetime, json, sys
t = datetime.date.today(); secs = [1500, 2400, 0, 1800, 3000, 900, 0, 2100, 2700, 1200, 600, 0, 1500, 2200]   # aujourd'hui, hier, ...
json.dump({"since": (t - datetime.timedelta(days=13)).isoformat(), "days": {(t - datetime.timedelta(days=i)).isoformat(): s for i, s in enumerate(secs) if s}, "hours": [0] * 24, "spent": {}}, open(sys.argv[1], "w"))
PY
python3 "$W/mk_lecture.py" "$W/cfg/lecture.json"
"$W/motskobo" -dir "$W/cfg" -db "$W/KoboReader.sqlite" -out "$W/site/notes.enc"
(cd "$W/site" && python3 -m http.server 8790 >/dev/null 2>&1 & echo $! > "$W/pid"); sleep 1
trap 'kill $(cat "$W/pid") 2>/dev/null' EXIT
NODE_PATH=${NODE_PATH:-$(npm root -g)} node "$ROOT/tests/ui.test.js" "http://localhost:8790/app.html#k=$KEY" "$W/shots"
