#!/bin/sh
# Mots Kobo Notes : lancé par udev (démarrage de la Kobo, Wi-Fi) ou par NickelMenu (« now »).
#   run.sh       : démarre la surveillance en arrière-plan (un seul exemplaire à la fois)
#   run.sh now   : envoi immédiat
DIR=${MOTSKOBO_DIR:-/mnt/onboard/MotsKobo}
SYS=${MOTSKOBO_SYS:-/usr/local/motskobo/motskobo-notes}
ALT="$DIR/bin/motskobo-notes"   # version téléchargée toute seule par le programme

# prend la version la plus récente des deux
BIN="$SYS"
if [ -x "$ALT" ]; then
  a=$("$ALT" -version 2>/dev/null); s=$("$SYS" -version 2>/dev/null)
  [ "${a:-0}" -gt "${s:-0}" ] 2>/dev/null && BIN="$ALT"
fi

if [ "$1" = "now" ]; then exec "$BIN" -dir "$DIR" -force; fi

# se détacher d'udev
if [ "$1" != "bg" ]; then
  if command -v setsid >/dev/null 2>&1; then setsid "$0" bg </dev/null >/dev/null 2>&1 &
  else "$0" bg </dev/null >/dev/null 2>&1 &
  fi
  exit 0
fi

# attendre que la mémoire de la liseuse soit montée (jusqu'à 5 min)
i=0; while [ ! -f "$DIR/config.txt" ] && [ $i -lt 60 ]; do sleep 5; i=$((i+1)); done
[ -f "$DIR/config.txt" ] || exit 0

# entrée NickelMenu « Envoyer mes annotations », si NickelMenu est installé
NM=/mnt/onboard/.adds/nm
if [ -d "$NM" ] && [ ! -f "$NM/motskobo-notes" ]; then
  echo "menu_item:main:Envoyer mes annotations:cmd_output:90000:/usr/local/motskobo/run.sh now" > "$NM/motskobo-notes"
fi

"$BIN" -dir "$DIR" daemon
rc=$?
# si la version téléchargée plante, on revient à celle de la liseuse
if [ "$BIN" = "$ALT" ] && [ $rc -ne 0 ]; then
  rm -f "$ALT"
  exec "$SYS" -dir "$DIR" daemon
fi
