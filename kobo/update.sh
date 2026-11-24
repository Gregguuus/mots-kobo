#!/bin/sh
# Met à jour Mots Kobo Notes sur la Kobo branchée (garde les réglages) :
#   curl -fsSL https://raw.githubusercontent.com/gregguuus/mots-kobo/main/kobo/update.sh | sh
set -e
V=${MOTSKOBO_VOLUME:-/Volumes/KOBOeReader}
DL=${MOTSKOBO_DL:-https://github.com/gregguuus/mots-kobo/raw/main/kobo/KoboRoot.tgz}
echo ""
echo "== Mise à jour de Mots Kobo Notes =="
if [ ! -d "$V/.kobo" ]; then
  echo "Branche ta Kobo au Mac et touche « Connecter » sur la liseuse…"
  while [ ! -d "$V/.kobo" ]; do sleep 2; done
fi
if [ ! -f "$V/MotsKobo/config.txt" ]; then echo "Réglages introuvables : lance d'abord installer.sh."; exit 1; fi
[ -f "$V/.kobo/KoboRoot.tgz" ] && echo "(La version précédente n'avait pas encore été installée par la Kobo.)"
[ -f "$V/MotsKobo/journal.txt" ] && { echo "Journal :"; tail -5 "$V/MotsKobo/journal.txt"; }
curl -fsSL "$DL" -o "$V/.kobo/KoboRoot.tgz"
sync
if command -v diskutil >/dev/null 2>&1; then diskutil eject "$V" >/dev/null && echo "Kobo éjectée."; fi
echo ""
echo "C'est prêt ! Débranche la Kobo : elle affiche une mise à jour et redémarre."
echo "Si elle ne le fait pas, éteins-la (bouton marche > Éteindre) puis rallume-la."
