"""Fabrique les rappels quotidiens du calendrier : rappels/HHMM.ics, toutes les 30 minutes de 6 h à 22 h 30.
Chaque fichier ajoute un événement qui se répète tous les jours, avec une alerte à l'heure."""
import os
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "rappels"); os.makedirs(out, exist_ok=True)
for h in range(6, 23):
    for m in (0, 30):
        t = f"{h:02d}{m:02d}"
        lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Mots Kobo//FR", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
                 f"UID:motskobo-rappel-{t}@mots-kobo", "DTSTAMP:20261125T000000Z", f"DTSTART:20261126T{t}00", "DURATION:PT10M", "RRULE:FREQ=DAILY",
                 "SUMMARY:Mots Kobo : ta révision du jour", "DESCRIPTION:Quelques minutes suffisent pour garder tes mots en mémoire.",
                 "URL:https://gregguuus.github.io/mots-kobo/app.html", "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Mots Kobo : ta révision du jour", "TRIGGER:PT0S", "END:VALARM", "END:VEVENT", "END:VCALENDAR"]
        open(os.path.join(out, t + ".ics"), "w", encoding="utf-8", newline="").write("\r\n".join(lines) + "\r\n")
print(len(os.listdir(out)), "fichiers")
