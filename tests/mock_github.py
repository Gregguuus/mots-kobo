"""Faux GitHub minimal pour tester l'envoi : GET et PUT sur /repos/<o>/<r>/contents/<fichier>.
Usage : python3 tests/mock_github.py <port> <dossier où écrire les fichiers reçus>"""
import base64, hashlib, json, os, sys
from http.server import BaseHTTPRequestHandler, HTTPServer
port, out = int(sys.argv[1]), sys.argv[2]
files = {}
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def send(self, code, obj):
        b = json.dumps(obj).encode(); self.send_response(code); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        p = self.path.split("?")[0]
        if p in files: return self.send(200, {"sha": files[p]})
        if "/contents/" in p: return self.send(404, {"message": "Not Found"})
        ok = self.headers.get("Authorization") == "Bearer jeton-de-test"
        self.send(200 if ok else 401, {"full_name": "gregguuus/mots-kobo", "permissions": {"admin": False, "push": ok}} if ok else {"message": "Bad credentials"})
    def do_PUT(self):
        if self.headers.get("Authorization") != "Bearer jeton-de-test": return self.send(401, {"message": "Bad credentials"})
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        p = self.path.split("?")[0]
        if p in files and body.get("sha") != files[p]: return self.send(409, {"message": "sha manquant"})
        data = base64.b64decode(body["content"]); files[p] = hashlib.sha1(data).hexdigest()
        open(os.path.join(out, os.path.basename(p)), "wb").write(data); self.send(201, {"content": {"sha": files[p]}})
HTTPServer(("127.0.0.1", port), H).serve_forever()
