# mots-kobo
Mots Kobo (données chiffrées)

Appli de révision des mots surlignés sur la Kobo. Les mots arrivent chiffrés dans `words.enc` ; la clé reste dans l'adresse (`#k=…`) et sur l'appareil.

## Jeux
- **Révision du jour** : répétition espacée avec quatre réponses (Encore, Difficile, Bien, Facile). Chaque mot revient juste avant d'être oublié ; 15 nouveaux mots par jour au maximum, les plus récents d'abord. Raccourcis clavier : espace, puis 1 à 4.
- **Défi éclair**, **Paires**, **Phrase à trous**
- **Écris-le** : taper le mot anglais à partir du sens et de la phrase du livre ; une faute de frappe est tolérée, « to » est facultatif.
- **Dictée** : écouter le mot et l'écrire.
- **Progrès** : mots maîtrisés, révisions des 7 prochains jours, calendrier de jeu, avancement par livre, mots les plus souvent oubliés, sauvegarde et restauration par code.

## Tests
```
python3 tests/make_fixture.py /tmp/site      # écrit un words.enc de test et affiche sa clé
cp index.html sw.js /tmp/site && (cd /tmp/site && python3 -m http.server 8765 &)
node tests/e2e.js "http://localhost:8765/#k=<clé>" /tmp/captures
```
