#!/bin/sh
# Mots Kobo Notes
#   run.sh        : lancé par udev (Wi-Fi allumé ou démarrage) ; lance la surveillance en arrière-plan
#   run.sh now    : envoi immédiat (NickelMenu)
DIR=${MOTSKOBO_DIR:-/mnt/onboard/MotsKobo}
BIN=${MOTSKOBO_BIN:-/usr/local/motskobo/motskobo-notes}
LOG="$DIR/journal.txt"

if [ "$1" = "now" ]; then exec "$BIN" -force; fi

if [ "$1" != "loop" ]; then
  # se détacher d'udev
  if command -v setsid >/dev/null 2>&1; then setsid "$0" loop </dev/null >/dev/null 2>&1 &
  else "$0" loop </dev/null >/dev/null 2>&1 &
  fi
  exit 0
fi

# Une seule surveillance à la fois
mkdir /tmp/motskobo.lock 2>/dev/null || exit 0
trap 'rmdir /tmp/motskobo.lock' EXIT

# attendre que la mémoire de la liseuse soit montée
i=0; while [ ! -d "$DIR" ] && [ $i -lt 60 ]; do sleep 5; i=$((i+1)); done
[ -f "$DIR/config.txt" ] || exit 0
echo "$(date '+%Y/%m/%d %H:%M:%S') surveillance démarrée" >> "$LOG"

# Entrée NickelMenu, si NickelMenu est installé
NM=/mnt/onboard/.adds/nm
if [ -d "$NM" ] && [ ! -f "$NM/motskobo-notes" ]; then
  echo "menu_item:main:Envoyer mes annotations:cmd_output:90000:$BIN -force" > "$NM/motskobo-notes"
fi

online() {
  (ip route 2>/dev/null; route -n 2>/dev/null) | grep -qE '^(default|0\.0\.0\.0)'
}
was=0
while [ -f "$DIR/config.txt" ]; do
  if online; then
    # à chaque connexion, puis toutes les 10 minutes tant que le Wi-Fi reste allumé
    if [ $was -eq 0 ] || [ $((n % 20)) -eq 0 ]; then "$BIN" -tries 3 >/dev/null 2>&1; fi
    was=1; n=$((n+1))
  else
    was=0; n=1
  fi
  sleep 30
done
