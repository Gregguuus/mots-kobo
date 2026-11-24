# mots-kobo
Mots Kobo (données chiffrées)

Appli de révision des mots surlignés sur la Kobo. Les mots arrivent chiffrés dans `words.enc` ; la clé reste dans l'adresse (`#k=…`) et sur l'appareil.

## Deux listes
Les mots de tes livres en anglais et ceux de tes livres en français sont séparés : un sélecteur Anglais / Français en haut de l'accueil. La langue est reconnue livre par livre, d'après les phrases surlignées (ou le champ `l` si l'export le fournit).

## Jeux
- **Révision du jour** : répétition espacée avec quatre réponses (Encore, Difficile, Bien, Facile). Chaque mot revient juste avant d'être oublié ; 15 nouveaux mots par jour au maximum, les plus récents d'abord. Raccourcis clavier : espace, puis 1 à 4.
- **Défi éclair**, **Paires**, **Phrase à trous**
- **Écris-le** : taper le mot anglais à partir du sens et de la phrase du livre ; une faute de frappe est tolérée, « to » est facultatif.
- **Dictée** : écouter le mot et l'écrire.
- **Progrès** : mots maîtrisés, révisions des 7 prochains jours, calendrier de jeu, avancement par livre, mots les plus souvent oubliés, sauvegarde et restauration par code.

## Mes annotations (`annotations.html`)
Tous les passages surlignés et les notes, livre par livre. On y dépose le fichier `KoboReader.sqlite` de la liseuse (dossier caché `.kobo`) ; il est lu dans le navigateur, rien n'est envoyé. Recherche, filtre anglais / français, notes seules, tri par livre ou par date, copie et téléchargement en Markdown. La lecture SQLite utilise sql.js (licence MIT, dans `vendor/`).

## Tests
```
python3 tests/make_fixture.py /tmp/site      # écrit un words.enc de test et affiche sa clé
cp index.html sw.js /tmp/site && (cd /tmp/site && python3 -m http.server 8765 &)
python3 tests/make_kobo_db.py /tmp/kobo.sqlite  # faux KoboReader.sqlite
cp -r annotations.html vendor /tmp/site
node tests/e2e.js "http://localhost:8765/#k=<clé>" /tmp/captures /tmp/kobo.sqlite
```
