#!/bin/sh
# Mots Kobo Notes : lancé par udev quand le Wi-Fi s'allume, ou par NickelMenu (« now »).
DIR=/mnt/onboard/MotsKobo
BIN=/usr/local/motskobo/motskobo-notes
[ -f "$DIR/config.txt" ] || exit 0

# Entrée de menu NickelMenu, si NickelMenu est installé
NM=/mnt/onboard/.adds/nm
if [ -d "$NM" ] && [ ! -f "$NM/motskobo-notes" ]; then
  echo "menu_item:main:Envoyer mes annotations:cmd_output:90000:$BIN -force" > "$NM/motskobo-notes"
fi

if [ "$1" = "now" ]; then exec "$BIN" -force; fi

# Depuis udev : se détacher et laisser le Wi-Fi finir de se connecter
if [ "$1" != "bg" ]; then
  if command -v setsid >/dev/null 2>&1; then setsid "$0" bg </dev/null >/dev/null 2>&1 &
  else "$0" bg </dev/null >/dev/null 2>&1 &
  fi
  exit 0
fi
mkdir /tmp/motskobo.lock 2>/dev/null || exit 0
trap 'rmdir /tmp/motskobo.lock' EXIT
sleep 20
"$BIN"
