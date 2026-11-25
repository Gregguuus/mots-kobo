"""Fabrique un faux KoboReader.sqlite (tables Bookmark et content comme sur la Kobo).
Usage : python3 tests/make_kobo_db.py <fichier>"""
import sqlite3, sys
db = sqlite3.connect(sys.argv[1])
db.executescript("""
CREATE TABLE content (ContentID TEXT, ContentType INTEGER, Title TEXT, Attribution TEXT, VolumeIndex INTEGER);
CREATE TABLE Bookmark (BookmarkID TEXT, VolumeID TEXT, ContentID TEXT, Text TEXT, Annotation TEXT,
  DateCreated TEXT, ChapterProgress REAL, Hidden TEXT, Type TEXT, Color INTEGER);
""")
books = [("file:///mnt/onboard/ishiguro/remains.kepub.epub", "The Remains of the Day", "Kazuo Ishiguro"),
         ("file:///mnt/onboard/camus/etranger.kepub.epub", "L'Étranger", "Albert Camus"),
         ("file:///mnt/onboard/perec/les_choses.kepub.epub", None, None)]
db.executemany("INSERT INTO content VALUES (?,6,?,?,-1)", [(b, t, a) for b, t, a in books if t])
db.executemany("INSERT INTO content VALUES (?,9,'','',?)", [(books[0][0] + "!!ch" + str(i), i) for i in (1, 12)])
rows = [
 ("1", books[0][0], "What is the point in worrying oneself too much about what one could or could not have done to control the course one's life took?", "", "2026-10-02T21:14:00Z", 0.81, "false", "highlight", 0),
 ("2", books[0][0], "The evening's the best part of the day.", "Phrase clé du livre, à relire à la fin.", "2026-10-05T22:01:00Z", 0.93, "false", "note", 2),
 ("3", books[0][0], "", "", "2026-10-06T22:01:00Z", 0.95, "false", "dogear", 0),
 ("4", books[1][0], "Aujourd'hui, maman est morte. Ou peut-être hier, je ne sais pas.", "La première phrase la plus célèbre.", "2026-11-12T08:30:00Z", 0.01, "false", "note", 1),
 ("5", books[1][0], "Je me suis senti prêt à tout revivre.", "", "2026-11-14T20:12:00Z", 0.98, "false", "highlight", 3),
 ("6", books[1][0], "Passage supprimé", "", "2026-11-14T20:13:00Z", 0.5, "true", "highlight", 0),
 ("7", books[2][0], "Ils auraient aimé être riches. Ils croyaient qu'ils auraient su l'être.", "Toute la thèse du roman.", "2026-11-20T19:00:00Z", 0.12, "false", "note", 0),
 ("8", books[1][0], "assoupi", "", "2026-11-14T20:20:00Z", 0.40, "false", "highlight", 1),
 ("9", books[1][0], "la torpeur", "", "2026-11-14T20:21:00Z", 0.41, "false", "highlight", 2),
 ("10", books[1][0], "Tom &amp; Jerry 5\xa0%", "", "2026-11-14T20:22:00Z", 0.42, "false", "highlight", 3),
]
chap = {"1": "!ch12", "2": "!ch1"}  # le passage 2 est au chapitre 1 (90 %), le 1 au chapitre 12 (10 %)
rows[0] = rows[0][:5] + (0.10,) + rows[0][6:]; rows[1] = rows[1][:5] + (0.90,) + rows[1][6:]
db.executemany("INSERT INTO Bookmark VALUES (?,?,?,?,?,?,?,?,?,?)", [(r[0], r[1], r[1] + chap.get(r[0], ""), *r[2:]) for r in rows])
db.commit(); print("ok")
