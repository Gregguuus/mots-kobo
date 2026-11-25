"""Test du démon de la Kobo : envoi à la connexion, au changement, contrôle périodique,
réessai après un 409, un seul démon à la fois, mise à jour automatique.
Usage : python3 tests/kobo_daemon_test.py <binaire v2> <binaire v3> <dossier de travail>"""
import gzip, hashlib, http.server, json, os, shutil, sqlite3, subprocess, sys, threading, time

v2, v3, work = sys.argv[1:4]
VA = int(subprocess.check_output([v2, "-version"]).strip()); VB = int(subprocess.check_output([v3, "-version"]).strip())  # version installée, puis version annoncée
work = os.path.abspath(work); shutil.rmtree(work, ignore_errors=True); os.makedirs(work + "/cfg"); os.makedirs(work + "/recu"); os.makedirs(work + "/raw/kobo")
here = os.path.dirname(os.path.abspath(__file__))
subprocess.run([sys.executable, here + "/make_kobo_db.py", work + "/KoboReader.sqlite"], check=True, capture_output=True)
KEY = subprocess.run([sys.executable, here + "/make_fixture.py", work + "/tmp"], check=True, capture_output=True, text=True).stdout.strip()
open(work + "/cfg/config.txt", "w").write(f"token = jeton-de-test\nkey = {KEY}\napi = http://127.0.0.1:8799\nraw = http://127.0.0.1:8798\n")

def latest(version, binary):
    b = open(binary, "rb").read()
    open(work + "/raw/kobo/motskobo-notes-arm.gz", "wb").write(gzip.compress(b))
    json.dump({"version": version, "sha256": hashlib.sha256(b).hexdigest(), "file": "motskobo-notes-arm.gz"}, open(work + "/raw/kobo/latest.json", "w"))
latest(VA, v2)

gh = subprocess.Popen([sys.executable, here + "/mock_github.py", "8799", work + "/recu"])
class Q(http.server.SimpleHTTPRequestHandler):
    def __init__(s, *a, **k): super().__init__(*a, directory=work + "/raw", **k)
    def log_message(s, *a): pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8798), Q); threading.Thread(target=srv.serve_forever, daemon=True).start()
time.sleep(0.8)

env = dict(os.environ, MOTSKOBO_SAMPLE="1s", MOTSKOBO_ONLINE="1", MOTSKOBO_POLL="300ms", MOTSKOBO_SETTLE="0s", MOTSKOBO_MINCHECK="1s",
           MOTSKOBO_HEARTBEAT="5s", MOTSKOBO_UPDATE="3s", MOTSKOBO_RETRY="1s", MOTSKOBO_LOCK=work + "/lock")
import base64, hmac as _h
def read_notes():
    box = json.load(open(work + "/recu/notes.enc")); K = base64.urlsafe_b64decode(KEY + "=" * (-len(KEY) % 4))
    N, C = base64.b64decode(box["n"]), base64.b64decode(box["c"])
    ke = _h.new(K, b"enc", hashlib.sha256).digest()
    ks = b"".join(_h.new(ke, N + i.to_bytes(4, "big"), hashlib.sha256).digest() for i in range((len(C) + 31) // 32))
    return json.loads(gzip.decompress(bytes(a ^ b for a, b in zip(C, ks))))
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
check("démarre en v%d" % VA, wait("démon v%d démarré" % VA))
check("envoi à la connexion", wait("annotations envoyées (connexion)"))
check("notes.enc reçu", os.path.exists(work + "/recu/notes.enc"))
d2 = subprocess.run([v2, "-dir", work + "/cfg", "-db", work + "/KoboReader.sqlite", "daemon"], env=env, timeout=5)
check("un second démon s'arrête aussitôt", d2.returncode == 0 and journal().count("démon v%d démarré" % VA) == 1)
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
d0 = read_notes()
check("langue des livres envoyée par la Kobo", {n["b"]: n.get("l") for n in d0["notes"]}.get("L'Étranger") == "fr")
check("livres commencés envoyés", any(b["t"] == "The Remains of the Day" and b["p"] == 62 and b["s"] == 1 and b["sp"] == 7200 for b in d0.get("books", [])))
check("suivi du temps de lecture démarré", wait("temps de lecture : suivi démarré", timeout=5))
c = sqlite3.connect(work + "/KoboReader.sqlite"); c.execute("UPDATE content SET TimeSpentReading=TimeSpentReading+90, ___PercentRead=65 WHERE Title='The Remains of the Day'"); c.commit(); c.close()
time.sleep(2.5)
c = sqlite3.connect(work + "/KoboReader.sqlite"); c.execute("UPDATE content SET TimeSpentReading=TimeSpentReading+45 WHERE Title='The Remains of the Day'"); c.commit(); c.close()
time.sleep(2.5)
n0 = journal().count("annotations envoyées")
check("envoi suivant", wait("annotations envoyées", n0 + 1, timeout=15))
rd = read_notes().get("reading", {}); today = time.strftime("%Y-%m-%d")
check("temps de lecture du jour compté (135 s)", rd.get("days", {}).get(today) == 135)
check("heure de lecture comptée", sum(rd.get("hours", [])) == 135)
latest(VB, v3)
check("mise à jour automatique vers v%d" % VB, wait("mise à jour automatique : v%d vers v%d" % (VA, VB), timeout=15))
check("redémarre en v%d" % VB, wait("démon v%d démarré" % VB, timeout=10))
check("binaire déposé dans bin/", os.path.exists(work + "/cfg/bin/motskobo-notes"))
check("la nouvelle version continue d'envoyer", wait("annotations envoyées", n + 2, timeout=15))
d.terminate(); time.sleep(0.3); subprocess.run(["pkill", "-f", work + "/cfg/bin/motskobo-notes"])
gh.terminate(); srv.shutdown()
print("\nTOUS LES TESTS DU DÉMON PASSENT" if ok else "\nÉCHECS")
sys.exit(0 if ok else 1)
