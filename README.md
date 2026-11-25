# Mots Kobo

Appli web (pensée pour l'iPhone, utilisable sur Mac) pour réviser les mots et retrouver les annotations de la liseuse Kobo. Les données arrivent **chiffrées** sur GitHub (`words.enc`, `notes.enc`) ; la clé reste dans l'adresse (`#k=…`) et sur l'appareil.

Ouvrir : https://gregguuus.github.io/mots-kobo/app.html

## Ce que fait l'appli
- **Aujourd'hui** : révision du jour (répétition espacée : Encore, Difficile, Bien, Facile), anneau d'XP, série, jeux, rappel.
- **Mots** : liste par jour, recherche, fiche avec prononciation. Anglais et français sont séparés (sélecteur en haut). Les mots arrivés sans traduction sont traduits automatiquement (MyMemory). Les mots français viennent des surlignages d'un seul mot dans les livres français, avec leur définition du Wiktionnaire.
- **Annotations** : passages surlignés et notes, par livre, en texte noir avec une fine barre de couleur. Recherche, filtres langue / « avec note » / livre, copie, partage, export Markdown.
- **Progrès** : mémoire, révisions à venir, jours de jeu, avancement par livre, mots coriaces.
- **Relecture des passages** (comme la « relecture quotidienne » de Readwise, mais gratuite et pour les livres copiés à la main, que Readwise ne synchronise pas) : chaque jour, 5 passages surlignés reviennent, avec répétition espacée (À revoir, Retenu, Acquis). Carte « Souvenir du jour » sur Aujourd'hui.
- **Fiche livre** : touche un titre (Annotations ou Progrès) pour voir progression, temps de lecture, temps restant estimé, passages, notes, mots, relire ce livre, tout copier en Markdown.
- **Lecture** (onglet Progrès) : temps de lecture par jour (30 jours), série de jours lus, livres en cours avec temps restant, livres terminés. La Kobo ne garde qu'un total par livre : le programme de la Kobo le relève chaque minute et en déduit le temps par jour.
- **Jeux** : Défi éclair, Paires, Phrase à trous, Écris-le, Dictée (avec indice).
- **Son** : vraie prononciation (Wiktionary via dictionaryapi.dev) pour l'anglais, voix de l'iPhone sinon ; réglages de voix et de vitesse, test du son.
- **Rappel quotidien** dans l'app **Rappels** de l'iPhone : le bouton ouvre le menu Partager (`navigator.share`) avec un titre et le lien de l'appli ; il reste à choisir « Rappels », l'heure et « Répéter › Tous les jours ». Apple ne permet pas à une appli web de créer elle-même un rappel qui se répète.
- Les textes passent par un nettoyage (entités HTML, espaces insécables, caractères invisibles).

`annotations.html` redirige vers l'onglet Annotations. `index.html`, `sw.js`, `icon-180.png` et `words.enc` appartiennent au programme de la Kobo, qui les réécrit : ne pas les modifier.

## Programme de la Kobo (`kobo/`)
**Mots Kobo Notes** (Go, compilé pour ARM) tourne en arrière-plan sur la liseuse :
- il relève chaque minute le compteur de temps de lecture de la Kobo (`TimeSpentReading`, livres KEPUB surtout) et envoie avec les annotations la liste des livres commencés (progression, temps, langue) et le temps lu par jour ;
- il envoie les annotations dans `notes.enc` à **chaque connexion Wi-Fi**, à **chaque nouveau surlignage** et par un contrôle toutes les heures (avec une date, pour que l'appli sache que la Kobo est vivante) ;
- il réessaie quand GitHub répond 409 (envoi simultané avec les mots) ;
- il **se met à jour tout seul** : il lit `kobo/latest.json`, télécharge `motskobo-notes-arm.gz` dans `MotsKobo/bin`, vérifie la somme de contrôle puis `-version`, et redémarre dessus ; si la version téléchargée plante, `run.sh` revient à celle de la liseuse ;
- un seul exemplaire tourne à la fois (verrou `flock`), démarré par udev au démarrage, à la mise à disposition de la mémoire et à chaque connexion Wi-Fi ; entrée NickelMenu « Envoyer mes annotations » si NickelMenu est installé.

Installation (Kobo branchée au Mac, une fois) :
```
curl -fsSL https://raw.githubusercontent.com/gregguuus/mots-kobo/main/kobo/installer.sh | sh -s '<adresse de l'appli avec #k=…>'
```
Mise à jour par câble (pour passer à la v2, ensuite c'est automatique) :
```
curl -fsSL https://raw.githubusercontent.com/gregguuus/mots-kobo/main/kobo/update.sh | sh
```
Le journal est dans `MotsKobo/journal.txt`. Pour arrêter l'envoi : supprimer `MotsKobo/config.txt`.

Publier une nouvelle version du programme : augmenter `kobo/VERSION`, lancer `kobo/build.sh` (Go requis), pousser `KoboRoot.tgz`, `motskobo-notes-arm.gz` et `latest.json`. Les Kobo à jour la récupèrent seules dans les 6 heures.

## Tests
```
tests/run_ui_test.sh                      # appli sur un iPhone émulé (Go, Python, Node, Playwright)
python3 tests/kobo_daemon_test.py <v2> <v3> <dossier>   # démon : connexion, changement, 409, mise à jour
```
Outils : `tools/make_icons.js` (icônes depuis `tools/icon.svg`).
