"""Test du démon de la Kobo : envoi à la connexion, au changement, contrôle périodique,
réessai après un 409, un seul démon à la fois, mise à jour automatique.
Usage : python3 tests/kobo_daemon_test.py <binaire v2> <binaire v3> <dossier de travail>"""
import gzip, hashlib, http.server, json, os, shutil, sqlite3, subprocess, sys, threading, time

v2, v3, work = sys.argv[1:4]
work = os.path.abspath(work); shutil.rmtree(work, ignore_errors=True); os.makedirs(work + "/cfg"); os.makedirs(work + "/recu"); os.makedirs(work + "/raw/kobo")
here = os.path.dirname(os.path.abspath(__file__))
subprocess.run([sys.executable, here + "/make_kobo_db.py", work + "/KoboReader.sqlite"], check=True, capture_output=True)
KEY = subprocess.run([sys.executable, here + "/make_fixture.py", work + "/tmp"], check=True, capture_output=True, text=True).stdout.strip()
open(work + "/cfg/config.txt", "w").write(f"token = jeton-de-test\nkey = {KEY}\napi = http://127.0.0.1:8799\nraw = http://127.0.0.1:8798\n")

def latest(version, binary):
    b = open(binary, "rb").read()
    open(work + "/raw/kobo/motskobo-notes-arm.gz", "wb").write(gzip.compress(b))
    json.dump({"version": version, "sha256": hashlib.sha256(b).hexdigest(), "file": "motskobo-notes-arm.gz"}, open(work + "/raw/kobo/latest.json", "w"))
latest(2, v2)

gh = subprocess.Popen([sys.executable, here + "/mock_github.py", "8799", work + "/recu"])
class Q(http.server.SimpleHTTPRequestHandler):
    def __init__(s, *a, **k): super().__init__(*a, directory=work + "/raw", **k)
    def log_message(s, *a): pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8798), Q); threading.Thread(target=srv.serve_forever, daemon=True).start()
time.sleep(0.8)

env = dict(os.environ, MOTSKOBO_ONLINE="1", MOTSKOBO_POLL="300ms", MOTSKOBO_SETTLE="0s", MOTSKOBO_MINCHECK="1s",
           MOTSKOBO_HEARTBEAT="5s", MOTSKOBO_UPDATE="3s", MOTSKOBO_RETRY="1s", MOTSKOBO_LOCK=work + "/lock")
def journal(): 
    p = work + "/cfg/journal.txt"
    return open(p).read() if os.path.exists(p) else ""
def wait(text, n=1, timeout=25):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if journal().count(text) >= n: return True
        time.sleep(0.2)
    print("--- journal ---\n" + journal()); return False
ok = True
def check(name, cond):
    global ok; ok &= bool(cond); print(("OK   " if cond else "ÉCHEC"), name)

d = subprocess.Popen([v2, "-dir", work + "/cfg", "-db", work + "/KoboReader.sqlite", "daemon"], env=env)
check("démarre en v2", wait("démon v2 démarré"))
check("envoi à la connexion", wait("annotations envoyées (connexion)"))
check("notes.enc reçu", os.path.exists(work + "/recu/notes.enc"))
d2 = subprocess.run([v2, "-dir", work + "/cfg", "-db", work + "/KoboReader.sqlite", "daemon"], env=env, timeout=5)
check("un second démon s'arrête aussitôt", d2.returncode == 0 and journal().count("démon v2 démarré") == 1)
time.sleep(2.2)
check("rien envoyé tant que rien ne change", journal().count("(changement)") == 0)
c = sqlite3.connect(work + "/KoboReader.sqlite")
c.execute("INSERT INTO Bookmark VALUES ('99', 'file:///mnt/onboard/camus/etranger.kepub.epub', 'file:///mnt/onboard/camus/etranger.kepub.epub', 'Nouveau passage surligné', '', '2026-11-25T10:00:00Z', 0.5, 'false', 'highlight', 0)"); c.commit(); c.close()
check("envoi après un nouveau surlignage", wait("annotations envoyées (changement)", timeout=10))
check("contrôle périodique même sans changement", wait("annotations envoyées (contrôle)", timeout=12))
open(work + "/recu/fail409", "w").write("1")
c = sqlite3.connect(work + "/KoboReader.sqlite"); c.execute("UPDATE Bookmark SET Annotation='ma note' WHERE BookmarkID='99'"); c.commit(); c.close()
n = journal().count("annotations envoyées")
check("réessai après un 409 (envois simultanés)", wait("annotations envoyées", n + 1, timeout=15) and not os.path.exists(work + "/recu/fail409"))
check("aucune erreur jusque-là", "ERREUR" not in journal())
latest(3, v3)
check("mise à jour automatique vers v3", wait("mise à jour automatique : v2 vers v3", timeout=15))
check("redémarre en v3", wait("démon v3 démarré", timeout=10))
check("binaire déposé dans bin/", os.path.exists(work + "/cfg/bin/motskobo-notes"))
check("v3 continue d'envoyer", wait("annotations envoyées", n + 2, timeout=15))
d.terminate(); time.sleep(0.3); subprocess.run(["pkill", "-f", work + "/cfg/bin/motskobo-notes"])
gh.terminate(); srv.shutdown()
print("\nTOUS LES TESTS DU DÉMON PASSENT" if ok else "\nÉCHECS")
sys.exit(0 if ok else 1)
