# mots-kobo
Mots Kobo (données chiffrées)

Appli de révision des mots surlignés sur la Kobo.

**Important** : la Kobo renvoie sa propre `index.html` (et `sw.js`, l'icône, `words.enc`) à chaque synchronisation. La nouvelle appli vit donc dans **`app.html`**, que la Kobo ne touche pas : https://gregguuus.github.io/mots-kobo/app.html. Elle reprend la clé enregistrée sur le téléphone par l'appli de la Kobo et la remet dans son adresse, pour que l'icône d'écran d'accueil fonctionne. Les mots arrivent chiffrés dans `words.enc` ; la clé reste dans l'adresse (`#k=…`) et sur l'appareil.

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

## Annotations automatiques (programme pour la Kobo)
`kobo/` contient **Mots Kobo Notes**, un petit programme pour la liseuse (Go, compilé pour ARM). À chaque connexion Wi-Fi, il lit les surlignages et notes de `KoboReader.sqlite`, les chiffre avec la même clé que les mots et les envoie dans `notes.enc`. Il n'envoie rien si rien n'a changé. `annotations.html` les affiche alors tout seul.

Installation (une seule fois, Kobo branchée) :
1. Créer un jeton GitHub « fine-grained » limité au dépôt `mots-kobo`, permission **Contents : Read and write**.
2. Copier `kobo/KoboRoot.tgz` dans le dossier caché `.kobo` de la liseuse.
3. Créer le dossier `MotsKobo` à la racine de la liseuse avec `config.txt` :
   ```
   token = <jeton GitHub>
   key = <clé de l'appli, ou l'adresse complète …#k=…>
   ```
4. Éjecter et débrancher : la Kobo installe le programme en redémarrant.

Si NickelMenu est installé, une entrée « Envoyer mes annotations » apparaît dans son menu. Le journal est dans `MotsKobo/journal.txt`. Pour désactiver : supprimer `MotsKobo/config.txt`. Une mise à jour du système de la Kobo peut effacer le programme : recopier alors `KoboRoot.tgz`.

Reconstruire : `kobo/build.sh` (Go requis).

## Tests
```
python3 tests/make_fixture.py /tmp/site      # écrit un words.enc de test et affiche sa clé
cp app.html sw.js /tmp/site && (cd /tmp/site && python3 -m http.server 8765 &)
python3 tests/make_kobo_db.py /tmp/kobo.sqlite  # faux KoboReader.sqlite
(cd kobo/motskobo && go build -o /tmp/motskobo .) && mkdir -p /tmp/cfg && echo "key=<clé>" > /tmp/cfg/config.txt
/tmp/motskobo -dir /tmp/cfg -db /tmp/kobo.sqlite -out /tmp/site/notes.enc   # ce que la Kobo enverrait
# envoi vers un faux GitHub : python3 tests/mock_github.py 8799 /tmp/recu, puis api = http://127.0.0.1:8799 dans config.txt
cp -r annotations.html vendor /tmp/site
node tests/e2e.js "http://localhost:8765/app.html#k=<clé>" /tmp/captures /tmp/kobo.sqlite
```
