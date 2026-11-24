#!/bin/sh
# Installe Mots Kobo Notes sur la Kobo branchée au Mac, en une commande :
#   curl -fsSL https://raw.githubusercontent.com/gregguuus/mots-kobo/main/kobo/installer.sh | sh -s <clé ou adresse de l'appli>
set -e
REPO=gregguuus/mots-kobo
API=${MOTSKOBO_API:-https://api.github.com}
DL=${MOTSKOBO_DL:-https://github.com/$REPO/raw/main/kobo/KoboRoot.tgz}
V=${MOTSKOBO_VOLUME:-/Volumes/KOBOeReader}
KEY=$(printf '%s' "$1" | sed 's/.*k=//')

echo ""
echo "== Installation de Mots Kobo Notes =="
if [ ! -d "$V/.kobo" ]; then
  echo "Branche ta Kobo au Mac et touche « Connecter » sur la liseuse…"
  while [ ! -d "$V/.kobo" ]; do sleep 2; done
fi
echo "Kobo trouvée."

if [ -z "$KEY" ]; then
  printf "Colle l'adresse de ton appli Mots Kobo (celle qui finit par #k=…) puis Entrée : "
  read -r A </dev/tty; KEY=$(printf '%s' "$A" | sed 's/.*k=//')
fi

while :; do
  printf "Colle ton jeton GitHub (github_pat_…) puis Entrée : "
  read -r TOKEN </dev/tty
  TOKEN=$(printf '%s' "$TOKEN" | tr -d ' \r\n')
  R=$(curl -s -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" "$API/repos/$REPO" || true)
  if printf '%s' "$R" | tr -d ' \n' | grep -q '"push":true'; then break; fi
  echo "GitHub refuse ce jeton pour mots-kobo (il faut l'accès au dépôt mots-kobo avec Contents : Read and write). Réessaie."
done

echo "Copie du programme sur la Kobo…"
curl -fsSL "$DL" -o "$V/.kobo/KoboRoot.tgz"
mkdir -p "$V/MotsKobo"
printf '# Mots Kobo Notes : réglages (ne pas partager)\ntoken = %s\nkey = %s\nrepo = %s\n' "$TOKEN" "$KEY" "$REPO" > "$V/MotsKobo/config.txt"
sync
if command -v diskutil >/dev/null 2>&1; then diskutil eject "$V" >/dev/null && echo "Kobo éjectée."; fi
echo ""
echo "C'est fini ! Débranche la Kobo : elle redémarre et installe le programme."
echo "Ensuite, allume son Wi-Fi : tes annotations arrivent dans Mots Kobo → Mes annotations."
