#!/bin/sh
# Construit KoboRoot.tgz : à copier dans le dossier caché .kobo de la liseuse.
set -e
cd "$(dirname "$0")"
(cd motskobo && GOOS=linux GOARCH=arm GOARM=7 CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o ../root/usr/local/motskobo/motskobo-notes .)
chmod 755 root/usr/local/motskobo/run.sh root/usr/local/motskobo/motskobo-notes
tar --owner=0 --group=0 --numeric-owner -czf KoboRoot.tgz -C root ./usr ./etc
tar -tvzf KoboRoot.tgz
