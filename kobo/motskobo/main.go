// motskobo-notes : envoie les annotations de la Kobo (surlignages et notes) vers GitHub,
// chiffrées avec la même clé que les mots, dans notes.enc.
//
//	motskobo-notes daemon   surveille le Wi-Fi et la base, envoie à chaque connexion et à chaque
//	                        changement, se met à jour tout seul
//	motskobo-notes -force   un envoi immédiat (entrée NickelMenu)
package main

import (
	"bytes"
	"compress/gzip"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"

	_ "golang.org/x/crypto/x509roots/fallback" // certificats racines intégrés : la Kobo a souvent des certificats périmés
	_ "modernc.org/sqlite"
)

// Renseignée à la compilation (build.sh) : -X main.versionStr=N
var versionStr = "3"

func version() int { n, _ := strconv.Atoi(versionStr); return n }

type Note struct {
	ID string  `json:"id"`
	T  string  `json:"t"`
	N  string  `json:"n,omitempty"`
	D  string  `json:"d,omitempty"`
	P  float64 `json:"p,omitempty"`
	Ch *int64  `json:"ch,omitempty"`
	C  int64   `json:"c,omitempty"`
	B  string  `json:"b"`
	A  string  `json:"a,omitempty"`
	L  string  `json:"l,omitempty"` // langue du livre d'après la Kobo (fr, en…)
}

type Config struct {
	Token, Key, Repo, Branch, File, API, Raw string
	Update                                   bool
}

// ---------- journal ----------

var logFile *os.File

func logf(format string, a ...any) {
	line := time.Now().Format("2006/01/02 15:04:05") + " " + fmt.Sprintf(format, a...) + "\n"
	os.Stdout.WriteString(line)
	if logFile != nil {
		logFile.WriteString(line)
	}
}

func openLog(dir string) {
	p := filepath.Join(dir, "journal.txt")
	if fi, err := os.Stat(p); err == nil && fi.Size() > 200_000 {
		os.Rename(p, filepath.Join(dir, "journal.old.txt"))
	}
	if f, err := os.OpenFile(p, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644); err == nil {
		logFile = f
	}
}

// ---------- réglages ----------

func readConfig(path string) (Config, error) {
	c := Config{Repo: "gregguuus/mots-kobo", Branch: "main", File: "notes.enc", API: "https://api.github.com", Update: true}
	b, err := os.ReadFile(path)
	if err != nil {
		return c, err
	}
	for _, line := range strings.Split(string(b), "\n") {
		line = strings.TrimSpace(strings.TrimPrefix(line, "\xef\xbb\xbf"))
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		k, v, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		v = strings.TrimSpace(v)
		switch strings.ToLower(strings.TrimSpace(k)) {
		case "token":
			c.Token = v
		case "key", "cle", "clé":
			// accepte la clé seule ou l'adresse complète de l'appli (…#k=CLÉ)
			if i := strings.Index(v, "k="); i >= 0 {
				v = v[i+2:]
			}
			if i := strings.IndexAny(v, "&# "); i >= 0 {
				v = v[:i]
			}
			c.Key = strings.TrimSpace(v)
		case "repo":
			c.Repo = v
		case "branch":
			c.Branch = v
		case "file":
			c.File = v
		case "api":
			c.API = strings.TrimRight(v, "/")
		case "raw":
			c.Raw = strings.TrimRight(v, "/")
		case "update":
			c.Update = !(v == "off" || v == "non" || v == "0" || v == "false")
		}
	}
	if c.Raw == "" {
		c.Raw = "https://raw.githubusercontent.com/" + c.Repo + "/" + c.Branch
	}
	if c.Key == "" {
		return c, errors.New("clé manquante dans MotsKobo/config.txt (ligne key=…)")
	}
	return c, nil
}

// ---------- lecture de la base de la Kobo ----------

// openCopy copie la base (et son journal WAL s'il existe) : la liseuse peut l'avoir ouverte.
func openCopy(dbPath string) (*sql.DB, func(), error) {
	tmpDir, err := os.MkdirTemp("", "motskobo")
	if err != nil {
		return nil, nil, err
	}
	tmp := filepath.Join(tmpDir, "KoboReader.sqlite")
	if err := copyFile(dbPath, tmp); err != nil {
		os.RemoveAll(tmpDir)
		return nil, nil, err
	}
	for _, suf := range []string{"-wal", "-shm"} {
		if _, err := os.Stat(dbPath + suf); err == nil {
			copyFile(dbPath+suf, tmp+suf)
		}
	}
	db, err := sql.Open("sqlite", tmp)
	if err != nil {
		os.RemoveAll(tmpDir)
		return nil, nil, err
	}
	return db, func() { db.Close(); os.RemoveAll(tmpDir) }, nil
}

func shortLang(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	if len(s) >= 2 && (s[:2] == "fr" || s[:2] == "en") {
		return s[:2]
	}
	return ""
}

func readNotes(dbPath string) ([]Note, error) {
	db, cleanup, err := openCopy(dbPath)
	if err != nil {
		return nil, err
	}
	defer cleanup()
	cols := tableCols(db, "Bookmark")
	if !cols["text"] {
		return nil, errors.New("table Bookmark introuvable")
	}
	cc := tableCols(db, "content")
	col := func(name, def string) string {
		if cols[strings.ToLower(name)] {
			return "b." + name
		}
		return def
	}
	chap := "NULL"
	if cc["volumeindex"] && cols["contentid"] {
		chap = "(SELECT ch.VolumeIndex FROM content ch WHERE ch.ContentType<>6 AND (ch.ContentID=b.ContentID OR ch.ContentID=replace(b.ContentID,'!','!!')) LIMIT 1)"
	}
	lang := "''"
	if cc["language"] {
		lang = "IFNULL(c.Language,'')"
	}
	q := fmt.Sprintf(`SELECT b.BookmarkID, IFNULL(b.Text,''), IFNULL(%s,''), IFNULL(%s,''), IFNULL(%s,0), IFNULL(%s,''), IFNULL(%s,0), IFNULL(%s,'false'), IFNULL(b.VolumeID,''), IFNULL(c.Title,''), IFNULL(c.Attribution,''), %s, %s
	  FROM Bookmark b LEFT JOIN content c ON c.ContentID=b.VolumeID AND c.ContentType=6`,
		col("Annotation", "NULL"), col("DateCreated", "NULL"), col("ChapterProgress", "0"), col("Type", "''"), col("Color", "0"), col("Hidden", "'false'"), chap, lang)
	rows, err := db.Query(q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Note
	for rows.Next() {
		var n Note
		var typ, hidden, vol string
		var ch sql.NullInt64
		var lg string
		if err := rows.Scan(&n.ID, &n.T, &n.N, &n.D, &n.P, &typ, &n.C, &hidden, &vol, &n.B, &n.A, &ch, &lg); err != nil {
			return nil, err
		}
		n.L = shortLang(lg)
		n.T, n.N = strings.TrimSpace(n.T), strings.TrimSpace(n.N)
		if hidden == "true" || typ == "dogear" || (n.T == "" && n.N == "") {
			continue
		}
		if ch.Valid {
			v := ch.Int64
			n.Ch = &v
		}
		if n.B == "" {
			n.B = titleFromPath(vol)
		}
		out = append(out, n)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out, rows.Err()
}

func tableCols(db *sql.DB, t string) map[string]bool {
	m := map[string]bool{}
	rows, err := db.Query("PRAGMA table_info(" + t + ")")
	if err != nil {
		return m
	}
	defer rows.Close()
	for rows.Next() {
		var cid int
		var name, typ string
		var notnull, pk int
		var dflt any
		if rows.Scan(&cid, &name, &typ, &notnull, &dflt, &pk) == nil {
			m[strings.ToLower(name)] = true
		}
	}
	return m
}

func titleFromPath(p string) string {
	s, _ := url.PathUnescape(p[strings.LastIndex(p, "/")+1:])
	for _, ext := range []string{".kepub.epub", ".epub", ".kepub", ".pdf"} {
		s = strings.TrimSuffix(s, ext)
	}
	s = strings.NewReplacer("_", " ", "-", " ").Replace(s)
	if s == "" {
		return "Livre sans titre"
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

// ---------- chiffrement : même format que words.enc ----------
// flux HMAC-SHA256, MAC sur nonce+chiffré, contenu gzip.

func seal(plain []byte, keyStr string) ([]byte, error) {
	key, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(keyStr, "="))
	if err != nil {
		return nil, fmt.Errorf("clé illisible : %w", err)
	}
	mac := func(k, d []byte) []byte { h := hmac.New(sha256.New, k); h.Write(d); return h.Sum(nil) }
	ke, km := mac(key, []byte("enc")), mac(key, []byte("mac"))
	var z bytes.Buffer
	gw := gzip.NewWriter(&z)
	gw.Write(plain)
	gw.Close()
	p := z.Bytes()
	nonce := make([]byte, 16)
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	ct := make([]byte, len(p))
	for i := 0; i*32 < len(p); i++ {
		ctr := make([]byte, 4)
		binary.BigEndian.PutUint32(ctr, uint32(i))
		ks := mac(ke, append(append([]byte{}, nonce...), ctr...))
		for j := 0; j < 32 && i*32+j < len(p); j++ {
			ct[i*32+j] = p[i*32+j] ^ ks[j]
		}
	}
	box := map[string]any{"v": 1, "n": base64.StdEncoding.EncodeToString(nonce), "c": base64.StdEncoding.EncodeToString(ct),
		"m": hex.EncodeToString(mac(km, append(append([]byte{}, nonce...), ct...)))}
	return json.Marshal(box)
}

// ---------- envoi vers GitHub ----------

type httpErr struct {
	code int
	msg  string
}

func (e *httpErr) Error() string {
	return fmt.Sprintf("GitHub a refusé l'envoi (%d) : %s", e.code, e.msg)
}

func pushOnce(c Config, content []byte) error {
	u := c.API + "/repos/" + c.Repo + "/contents/" + c.File
	cl := &http.Client{Timeout: 60 * time.Second}
	do := func(method, u string, body io.Reader) (*http.Response, error) {
		req, _ := http.NewRequest(method, u, body)
		req.Header.Set("Authorization", "Bearer "+c.Token)
		req.Header.Set("Accept", "application/vnd.github+json")
		req.Header.Set("User-Agent", "motskobo-notes")
		return cl.Do(req)
	}
	var sha string
	r, err := do("GET", u+"?ref="+url.QueryEscape(c.Branch), nil)
	if err != nil {
		return err
	}
	var cur struct {
		SHA string `json:"sha"`
	}
	json.NewDecoder(r.Body).Decode(&cur)
	r.Body.Close()
	if r.StatusCode == 401 || r.StatusCode == 403 {
		return &httpErr{r.StatusCode, "jeton refusé ou expiré (à recréer sur github.com/settings/personal-access-tokens)"}
	}
	sha = cur.SHA
	body := map[string]string{"message": "Annotations Kobo", "content": base64.StdEncoding.EncodeToString(content), "branch": c.Branch}
	if sha != "" {
		body["sha"] = sha
	}
	b, _ := json.Marshal(body)
	r, err = do("PUT", u, bytes.NewReader(b))
	if err != nil {
		return err
	}
	defer r.Body.Close()
	if r.StatusCode >= 300 {
		msg, _ := io.ReadAll(io.LimitReader(r.Body, 300))
		return &httpErr{r.StatusCode, string(msg)}
	}
	return nil
}

// push réessaie quand GitHub répond 409 (deux envois en même temps : les nôtres et ceux des mots) ou 5xx.
func push(c Config, content []byte) error {
	if c.Token == "" {
		return errors.New("jeton GitHub manquant dans MotsKobo/config.txt (ligne token=…)")
	}
	var last error
	for attempt := 0; attempt < 4; attempt++ {
		if attempt > 0 {
			time.Sleep(time.Duration(attempt) * 2 * time.Second)
		}
		err := pushOnce(c, content)
		if err == nil {
			return nil
		}
		var he *httpErr
		if errors.As(err, &he) && (he.code == 409 || he.code == 422 || he.code >= 500) {
			last = err
			continue
		}
		return err
	}
	return last
}

func waitOnline(api string, tries int) bool {
	cl := &http.Client{Timeout: 10 * time.Second}
	for i := 0; i < tries; i++ {
		if r, err := cl.Get(api); err == nil {
			r.Body.Close()
			return true
		}
		time.Sleep(10 * time.Second)
	}
	return false
}

// ---------- livres et temps de lecture ----------

// Book : un livre commencé, avec sa progression. La Kobo ne garde qu'un total de temps de lecture par livre.
type Book struct {
	ID string  `json:"id"`
	T  string  `json:"t"`
	A  string  `json:"a,omitempty"`
	P  float64 `json:"p"`           // pourcentage lu
	S  int     `json:"s"`           // 0 non lu, 1 en cours, 2 terminé
	Sp int64   `json:"sp"`          // secondes de lecture au total
	D  string  `json:"d,omitempty"` // dernière lecture
	L  string  `json:"l,omitempty"`
}

func readBooks(dbPath string) ([]Book, error) {
	db, cleanup, err := openCopy(dbPath)
	if err != nil {
		return nil, err
	}
	defer cleanup()
	cols := tableCols(db, "content")
	sel := func(name, def string) string {
		if cols[strings.ToLower(name)] {
			return "IFNULL(" + name + "," + def + ")"
		}
		return def
	}
	rows, err := db.Query(fmt.Sprintf(`SELECT ContentID, IFNULL(Title,''), IFNULL(Attribution,''), %s, %s, %s, %s, %s FROM content WHERE ContentType=6 AND IFNULL(Title,'')<>''`,
		sel("___PercentRead", "0"), sel("ReadStatus", "0"), sel("TimeSpentReading", "0"), sel("DateLastRead", "''"), sel("Language", "''")))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Book
	for rows.Next() {
		var b Book
		var lg string
		if err := rows.Scan(&b.ID, &b.T, &b.A, &b.P, &b.S, &b.Sp, &b.D, &lg); err != nil {
			return nil, err
		}
		b.L = shortLang(lg)
		if b.S > 0 || b.P > 0 || b.Sp > 0 || b.D != "" { // seulement les livres commencés
			out = append(out, b)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].D > out[j].D })
	return out, rows.Err()
}

// Reading : temps de lecture par jour, reconstitué en regardant le compteur de la Kobo chaque minute.
type Reading struct {
	Since string           `json:"since"`
	Days  map[string]int64 `json:"days"`  // secondes lues, par jour
	Hours [24]int64        `json:"hours"` // secondes lues, par heure de la journée
	Spent map[string]int64 `json:"spent"` // dernier compteur vu, par livre
}

func loadReading(dir string) *Reading {
	r := &Reading{Days: map[string]int64{}, Spent: map[string]int64{}}
	if b, err := os.ReadFile(filepath.Join(dir, "lecture.json")); err == nil {
		json.Unmarshal(b, r)
	}
	if r.Days == nil {
		r.Days = map[string]int64{}
	}
	if r.Spent == nil {
		r.Spent = map[string]int64{}
	}
	return r
}

func (r *Reading) save(dir string) {
	// on ne garde que les 400 derniers jours
	if len(r.Days) > 400 {
		keys := make([]string, 0, len(r.Days))
		for k := range r.Days {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys[:len(keys)-400] {
			delete(r.Days, k)
		}
	}
	b, _ := json.Marshal(r)
	tmp := filepath.Join(dir, "lecture.json.tmp")
	if os.WriteFile(tmp, b, 0644) == nil {
		os.Rename(tmp, filepath.Join(dir, "lecture.json"))
	}
}

// public : ce qui part vers l'appli (sans les compteurs internes)
func (r *Reading) public() map[string]any {
	return map[string]any{"since": r.Since, "days": r.Days, "hours": r.Hours}
}

// counters lit le temps de lecture de chaque livre : d'abord directement (lecture seule, rapide), sinon sur une copie.
func counters(dbPath string) (map[string]int64, error) {
	read := func(db *sql.DB) (map[string]int64, error) {
		if !tableCols(db, "content")["timespentreading"] {
			return nil, errors.New("la base ne compte pas le temps de lecture")
		}
		rows, err := db.Query(`SELECT ContentID, IFNULL(TimeSpentReading,0) FROM content WHERE ContentType=6 AND IFNULL(TimeSpentReading,0)>0`)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		m := map[string]int64{}
		for rows.Next() {
			var id string
			var s int64
			if err := rows.Scan(&id, &s); err != nil {
				return nil, err
			}
			m[id] = s
		}
		return m, rows.Err()
	}
	if db, err := sql.Open("sqlite", "file:"+dbPath+"?mode=ro&_pragma=busy_timeout(2000)"); err == nil {
		m, err := read(db)
		db.Close()
		if err == nil {
			return m, nil
		}
	}
	db, cleanup, err := openCopy(dbPath)
	if err != nil {
		return nil, err
	}
	defer cleanup()
	return read(db)
}

// sample compare les compteurs à ceux de la minute précédente et attribue la différence au jour et à l'heure en cours.
func (r *Reading) sample(dir, dbPath string, now time.Time) error {
	cur, err := counters(dbPath)
	if err != nil {
		return err
	}
	changed := false
	if r.Since == "" {
		r.Since, changed = now.Format("2006-01-02"), true
	}
	for id, c := range cur {
		prev, seen := r.Spent[id]
		if !seen || c < prev { // premier passage, ou livre remis à zéro : simple point de départ
			r.Spent[id], changed = c, true
			continue
		}
		if d := c - prev; d > 0 && d <= 3600 {
			r.Days[now.Format("2006-01-02")] += d
			r.Hours[now.Hour()] += d
			r.Spent[id], changed = c, true
		} else if d > 3600 {
			r.Spent[id], changed = c, true
		}
	}
	if changed {
		r.save(dir)
	}
	return nil
}

// safely exécute f sans jamais faire tomber le démon.
var lastErr = map[string]string{}

func safely(what string, f func() error) {
	defer func() {
		if r := recover(); r != nil {
			logf("%s : incident évité (%v)", what, r)
		}
	}()
	if err := f(); err != nil {
		if lastErr[what] != err.Error() { // une même erreur n'est écrite qu'une fois
			lastErr[what] = err.Error()
			logf("%s : %v", what, err)
		}
	} else {
		delete(lastErr, what)
	}
}

// ---------- un envoi ----------

type syncer struct {
	c    Config
	dir  string
	db   string
	boot time.Time
}

func (s *syncer) payload(notes []Note, why string) map[string]any {
	p := map[string]any{
		"notes":   notes,
		"updated": time.Now().UTC().Format(time.RFC3339),
		"kobo":    map[string]any{"v": version(), "boot": s.boot.UTC().Format(time.RFC3339), "why": why},
	}
	if books, err := readBooks(s.db); err == nil && len(books) > 0 {
		p["books"] = books
	}
	if r := loadReading(s.dir); r.Since != "" {
		p["reading"] = r.public()
	}
	return p
}

// safeSync : un envoi qui rencontre un cas imprévu est noté dans le journal mais ne fait jamais tomber le démon.
func (s *syncer) safeSync(force bool, why string) (err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("incident évité : %v", r)
		}
	}()
	return s.sync(force, why)
}

func (s *syncer) sync(force bool, why string) error {
	notes, err := readNotes(s.db)
	if err != nil {
		return fmt.Errorf("lecture des annotations : %w", err)
	}
	plain, _ := json.Marshal(notes)
	sum := sha256.Sum256(plain)
	stamp := hex.EncodeToString(sum[:])
	statePath := filepath.Join(s.dir, "dernier-envoi.txt")
	if prev, _ := os.ReadFile(statePath); !force && strings.TrimSpace(string(prev)) == stamp {
		logf("%d annotations, rien de nouveau (%s)", len(notes), why)
		return nil
	}
	payload, _ := json.Marshal(s.payload(notes, why))
	box, err := seal(payload, s.c.Key)
	if err != nil {
		return err
	}
	if err := push(s.c, box); err != nil {
		return err
	}
	os.WriteFile(statePath, []byte(stamp), 0644)
	logf("%d annotations envoyées (%s)", len(notes), why)
	return nil
}

// ---------- surveillance ----------

func envDur(name string, def time.Duration) time.Duration {
	if v := os.Getenv(name); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return def
}

func isOnline() bool {
	if os.Getenv("MOTSKOBO_ONLINE") == "1" {
		return true
	}
	b, err := os.ReadFile("/proc/net/route")
	if err != nil {
		return false
	}
	for i, line := range strings.Split(string(b), "\n") {
		f := strings.Fields(line)
		if i == 0 || len(f) < 4 || f[1] != "00000000" {
			continue
		}
		if flags, err := strconv.ParseInt(f[3], 16, 64); err == nil && flags&2 != 0 {
			return true
		}
	}
	return false
}

func dbStamp(db string) string {
	var sb strings.Builder
	for _, p := range []string{db, db + "-wal"} {
		if fi, err := os.Stat(p); err == nil {
			fmt.Fprintf(&sb, "%d:%d;", fi.ModTime().UnixNano(), fi.Size())
		}
	}
	return sb.String()
}

var (
	failedUpdate int
	lockFile     *os.File
)

func daemon(dir, db string) {
	lockPath := os.Getenv("MOTSKOBO_LOCK")
	if lockPath == "" {
		lockPath = "/tmp/motskobo.lock"
	}
	if lf, err := os.OpenFile(lockPath, os.O_CREATE|os.O_RDWR, 0644); err == nil {
		if syscall.Flock(int(lf.Fd()), syscall.LOCK_EX|syscall.LOCK_NB) != nil {
			return // un autre démon tourne déjà ; le verrou disparaît tout seul si le processus meurt
		}
		lockFile = lf // à garder : si Go referme le fichier, le verrou saute
	}
	poll := envDur("MOTSKOBO_POLL", 20*time.Second)
	settle := envDur("MOTSKOBO_SETTLE", 12*time.Second)
	minCheck := envDur("MOTSKOBO_MINCHECK", 2*time.Minute)
	heartbeat := envDur("MOTSKOBO_HEARTBEAT", 60*time.Minute)
	updEvery := envDur("MOTSKOBO_UPDATE", 6*time.Hour)
	retry := envDur("MOTSKOBO_RETRY", 60*time.Second)
	sampleEvery := envDur("MOTSKOBO_SAMPLE", 60*time.Second)
	reading := loadReading(dir)
	var lastSample time.Time
	sampled := false

	logf("démon v%d démarré", version())
	s := &syncer{dir: dir, db: db, boot: time.Now()}
	cfgPath := filepath.Join(dir, "config.txt")
	var (
		wasOnline, pending, paused bool
		lastStamp                  string
		lastCheck, lastSync        time.Time
		nextTry, lastUpd           time.Time
	)
	for {
		c, err := readConfig(cfgPath)
		if err != nil {
			if !paused {
				logf("en pause : %v", err)
				paused = true
			}
			time.Sleep(poll)
			continue
		}
		if paused {
			logf("réglages retrouvés")
			paused = false
		}
		s.c = c
		now := time.Now()
		if now.Sub(lastSample) >= sampleEvery {
			lastSample = now
			safely("lecture", func() error {
				err := reading.sample(dir, db, now)
				if err == nil && !sampled {
					sampled = true
					logf("temps de lecture : suivi démarré")
				}
				return err
			})
		}
		if !isOnline() {
			wasOnline = false
			time.Sleep(poll)
			continue
		}
		reason, force := "", false
		if !wasOnline {
			wasOnline, pending = true, true
			time.Sleep(settle) // laisse le Wi-Fi finir de se connecter
			now = time.Now()
		}
		if now.After(nextTry) || nextTry.IsZero() {
			switch st := dbStamp(db); {
			case pending:
				reason, force = "connexion", true
			case st != lastStamp && now.Sub(lastCheck) >= minCheck:
				reason = "changement"
				lastCheck = now
			case now.Sub(lastSync) >= heartbeat:
				reason, force = "contrôle", true
			}
			if reason != "" {
				if err := s.safeSync(force, reason); err != nil {
					logf("ERREUR : %v", err)
					nextTry = now.Add(retry)
				} else {
					pending, lastSync, lastStamp, nextTry = false, now, dbStamp(db), time.Time{}
				}
			}
		}
		if c.Update && now.Sub(lastUpd) >= updEvery {
			lastUpd = now
			if err := selfUpdate(c, dir, db); err != nil {
				logf("mise à jour : %v", err)
			}
		}
		time.Sleep(poll)
	}
}

// ---------- mise à jour automatique ----------
// Le programme regarde si kobo/latest.json (dans le dépôt GitHub) annonce une version plus récente,
// la télécharge dans MotsKobo/bin, la vérifie (somme de contrôle, puis -version) et redémarre dessus.

func selfUpdate(c Config, dir, db string) error {
	cl := &http.Client{Timeout: 90 * time.Second}
	get := func(u string) ([]byte, error) {
		req, _ := http.NewRequest("GET", u, nil)
		req.Header.Set("User-Agent", "motskobo-notes")
		r, err := cl.Do(req)
		if err != nil {
			return nil, err
		}
		defer r.Body.Close()
		if r.StatusCode != 200 {
			return nil, fmt.Errorf("%s : %d", u, r.StatusCode)
		}
		return io.ReadAll(io.LimitReader(r.Body, 40<<20))
	}
	b, err := get(c.Raw + "/kobo/latest.json?t=" + strconv.FormatInt(time.Now().Unix(), 10))
	if err != nil {
		return err
	}
	var l struct {
		Version int    `json:"version"`
		SHA256  string `json:"sha256"`
		File    string `json:"file"`
	}
	if err := json.Unmarshal(b, &l); err != nil || l.File == "" {
		return errors.New("latest.json illisible")
	}
	if l.Version <= version() || l.Version == failedUpdate {
		return nil
	}
	gz, err := get(c.Raw + "/kobo/" + l.File)
	if err != nil {
		return err
	}
	zr, err := gzip.NewReader(bytes.NewReader(gz))
	if err != nil {
		return err
	}
	bin, err := io.ReadAll(zr)
	if err != nil {
		return err
	}
	if sum := sha256.Sum256(bin); hex.EncodeToString(sum[:]) != l.SHA256 {
		return errors.New("somme de contrôle incorrecte, mise à jour ignorée")
	}
	bdir := filepath.Join(dir, "bin")
	os.MkdirAll(bdir, 0755)
	tmp := filepath.Join(bdir, "motskobo-notes.new")
	if err := os.WriteFile(tmp, bin, 0755); err != nil {
		return err
	}
	os.Chmod(tmp, 0755)
	out, err := exec.Command(tmp, "-version").Output()
	if err != nil || strings.TrimSpace(string(out)) != strconv.Itoa(l.Version) {
		os.Remove(tmp)
		failedUpdate = l.Version
		return fmt.Errorf("la version %d ne démarre pas sur cette liseuse, ignorée", l.Version)
	}
	final := filepath.Join(bdir, "motskobo-notes")
	if err := os.Rename(tmp, final); err != nil {
		return err
	}
	logf("mise à jour automatique : v%d vers v%d", version(), l.Version)
	return syscall.Exec(final, []string{final, "-dir", dir, "-db", db, "daemon"}, os.Environ())
}

// ---------- entrée ----------

func main() {
	dir := flag.String("dir", "/mnt/onboard/MotsKobo", "dossier de config.txt et du journal")
	dbPath := flag.String("db", "/mnt/onboard/.kobo/KoboReader.sqlite", "base de la Kobo")
	out := flag.String("out", "", "écrire notes.enc dans ce fichier au lieu de l'envoyer (tests)")
	force := flag.Bool("force", false, "envoyer même si rien n'a changé")
	tries := flag.Int("tries", 12, "essais de connexion, 10 s d'écart")
	ver := flag.Bool("version", false, "afficher le numéro de version")
	flag.Parse()
	if *ver {
		fmt.Println(version())
		return
	}
	if *out == "" {
		openLog(*dir)
	}
	if flag.Arg(0) == "daemon" {
		daemon(*dir, *dbPath)
		return
	}
	if err := runOnce(*dir, *dbPath, *out, *force, *tries); err != nil {
		logf("ERREUR : %v", err)
		os.Exit(1)
	}
}

func runOnce(dir, dbPath, out string, force bool, tries int) error {
	c, err := readConfig(filepath.Join(dir, "config.txt"))
	if err != nil {
		return err
	}
	if out != "" {
		notes, err := readNotes(dbPath)
		if err != nil {
			return err
		}
		s := &syncer{c: c, dir: dir, db: dbPath, boot: time.Now()}
		payload, _ := json.Marshal(s.payload(notes, "test"))
		box, err := seal(payload, c.Key)
		if err != nil {
			return err
		}
		return os.WriteFile(out, box, 0644)
	}
	if !waitOnline(c.API, tries) {
		return errors.New("pas de connexion Internet")
	}
	s := &syncer{c: c, dir: dir, db: dbPath, boot: time.Now()}
	return s.sync(force, "manuel")
}
