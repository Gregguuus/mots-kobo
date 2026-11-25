#!/bin/sh
# Construit KoboRoot.tgz (installation par câble) et la mise à jour automatique (latest.json + .gz).
# Usage : kobo/build.sh   (Go requis). Le numéro de version est dans kobo/VERSION.
set -e
cd "$(dirname "$0")"
V=$(cat VERSION)
(cd motskobo && GOOS=linux GOARCH=arm GOARM=7 CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X main.versionStr=$V" -o ../root/usr/local/motskobo/motskobo-notes .)
chmod 755 root/usr/local/motskobo/run.sh root/usr/local/motskobo/motskobo-notes
tar --owner=0 --group=0 --numeric-owner -czf KoboRoot.tgz -C root ./usr ./etc
gzip -9 -n -c root/usr/local/motskobo/motskobo-notes > motskobo-notes-arm.gz
SUM=$(sha256sum root/usr/local/motskobo/motskobo-notes | cut -d' ' -f1)
printf '{"version": %s, "sha256": "%s", "file": "motskobo-notes-arm.gz"}\n' "$V" "$SUM" > latest.json
cat latest.json
ls -la KoboRoot.tgz motskobo-notes-arm.gz
