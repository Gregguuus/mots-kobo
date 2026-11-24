"""Fabrique un words.enc de test, chiffré comme celui de la Kobo (HMAC-SHA256 en flux + MAC).
Usage : python3 tests/make_fixture.py <dossier_sortie>  → écrit words.enc et affiche la clé (#k=…)."""
import base64, gzip, hashlib, hmac, json, os, sys

WORDS = [
 ("wistful", "mélancolique", "adj", "She gave a <<wistful>> smile as the train pulled away.", "The Remains of the Day"),
 ("to dwell", "s'attarder sur", "verb", "There is no point trying to <<dwell>> on the past.", "The Remains of the Day"),
 ("banter", "badinage", "noun", "Mr Farraday expected a certain amount of <<banter>>.", "The Remains of the Day"),
 ("hindsight", "le recul", "noun", "In <<hindsight>>, the evening was a turning point.", "The Remains of the Day"),
 ("to loom", "se profiler", "verb", "The mountains <<loomed>> over the village.", "Klara and the Sun"),
 ("eerie", "inquiétant", "adj", "An <<eerie>> silence filled the room.", "Klara and the Sun"),
 ("to glimpse", "entrevoir", "verb", "I <<glimpsed>> the Sun through the blinds.", "Klara and the Sun"),
 ("thoroughfare", "grande artère", "noun", "Taxis rushed along the <<thoroughfare>>.", "Klara and the Sun"),
 ("bleak", "morne", "adj", "The moor looked <<bleak>> under the grey sky.", "Wuthering Heights"),
 ("to brood", "ruminer", "verb", "Heathcliff would <<brood>> for hours.", "Wuthering Heights"),
 ("hearth", "le foyer", "noun", "They sat by the <<hearth>> until midnight.", "Wuthering Heights"),
 ("sullen", "maussade", "adj", "He remained <<sullen>> all evening.", "Wuthering Heights"),
 ("to shrug", "hausser les épaules", "verb", "She <<shrugged>> and walked on.", "Normal People"),
 ("awkward", "gêné", "adj", "There was an <<awkward>> pause.", "Normal People"),
 ("to blurt out", "lâcher", "verb", "He <<blurted out>> the truth.", "Normal People"),
 ("fleeting", "fugace", "adj", "It was a <<fleeting>> moment of joy.", "Normal People"),
 ("threshold", "le seuil", "noun", "She paused on the <<threshold>>.", "Normal People"),
 ("to wince", "grimacer", "verb", "He <<winced>> at the noise.", "Normal People"),
 ("dérisoire", "insignifiant, qui ne mérite pas d'attention", "adj", "Tout cela me paraissait <<dérisoire>> et je ne savais pas pourquoi.", "L'Étranger"),
 ("s'assoupir", "s'endormir doucement", "verb", "Je me suis <<assoupi>> dans le car qui sentait l'essence.", "L'Étranger"),
 ("la torpeur", "engourdissement, ralentissement", "noun", "Une <<torpeur>> lourde montait de la mer et de la plage.", "L'Étranger"),
 ("vétuste", "vieux et abîmé", "adj", "La maison était <<vétuste>> mais elle avait son charme.", "Les Choses"),
 ("une velléité", "une intention faible, sans suite", "noun", "Ils avaient eu des <<velléités>> de changer de vie.", "Les Choses"),
 ("chatoyant", "aux reflets changeants", "adj", "Les tissus <<chatoyants>> étaient dans la vitrine.", "Les Choses"),
]

def main(out):
    words = [{"w": w, "i": i, "t": [[pos, i]], "c": c, "b": b, "d": f"2026-11-{10 + n % 12:02d}T20:00:00"}
             for n, (w, i, pos, c, b) in enumerate(WORDS)]
    # comme les vrais envois de la Kobo : « l » est la forme de base, et un mot récent peut arriver sans traduction
    words.append({"w": "weird", "i": "", "t": {}, "l": "weird", "d": "2026-11-24", "b": "Normal People"})
    plain = gzip.compress(json.dumps({"words": words, "updated": "2026-11-24T07:30:00"}).encode())
    key = os.urandom(32)
    ke = hmac.new(key, b"enc", hashlib.sha256).digest()
    km = hmac.new(key, b"mac", hashlib.sha256).digest()
    nonce = os.urandom(16)
    stream = b"".join(hmac.new(ke, nonce + i.to_bytes(4, "big"), hashlib.sha256).digest()
                      for i in range((len(plain) + 31) // 32))
    ct = bytes(a ^ b for a, b in zip(plain, stream))
    box = {"v": 1, "n": base64.b64encode(nonce).decode(), "c": base64.b64encode(ct).decode(),
           "m": hmac.new(km, nonce + ct, hashlib.sha256).hexdigest()}
    os.makedirs(out, exist_ok=True)
    json.dump(box, open(os.path.join(out, "words.enc"), "w"))
    print(base64.urlsafe_b64encode(key).decode().rstrip("="))

if __name__ == "__main__":
    main(sys.argv[1])
