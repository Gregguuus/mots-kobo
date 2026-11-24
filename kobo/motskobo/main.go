// motskobo-notes : envoie les annotations de la Kobo (surlignages et notes) vers GitHub,
// chiffrées avec la même clé que les mots, dans notes.enc. Lancé à chaque connexion Wi-Fi.
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
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	_ "golang.org/x/crypto/x509roots/fallback" // certificats racines intégrés : la Kobo a souvent des certificats périmés
	_ "modernc.org/sqlite"
)

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
}

type Config struct{ Token, Key, Repo, Branch, File, API string }

func readConfig(path string) (Config, error) {
	c := Config{Repo: "gregguuus/mots-kobo", Branch: "main", File: "notes.enc", API: "https://api.github.com"}
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
			c.Key = strings.TrimSpace(v)
		case "repo":
			c.Repo = v
		case "branch":
			c.Branch = v
		case "file":
			c.File = v
		case "api":
			c.API = strings.TrimRight(v, "/")
		}
	}
	if c.Key == "" {
		return c, errors.New("clé manquante dans MotsKobo/config.txt (ligne key=…)")
	}
	return c, nil
}

func readNotes(dbPath string) ([]Note, error) {
	// copie d'abord la base : la liseuse peut l'avoir ouverte
	tmp := filepath.Join(os.TempDir(), "motskobo-KoboReader.sqlite")
	if err := copyFile(dbPath, tmp); err != nil {
		return nil, err
	}
	defer os.Remove(tmp)
	db, err := sql.Open("sqlite", "file:"+tmp+"?mode=ro")
	if err != nil {
		return nil, err
	}
	defer db.Close()
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
	q := fmt.Sprintf(`SELECT b.BookmarkID, IFNULL(b.Text,''), IFNULL(%s,''), IFNULL(%s,''), IFNULL(%s,0), IFNULL(%s,''), IFNULL(%s,0), IFNULL(%s,'false'), IFNULL(b.VolumeID,''), IFNULL(c.Title,''), IFNULL(c.Attribution,''), %s
	  FROM Bookmark b LEFT JOIN content c ON c.ContentID=b.VolumeID AND c.ContentType=6`,
		col("Annotation", "NULL"), col("DateCreated", "NULL"), col("ChapterProgress", "0"), col("Type", "''"), col("Color", "0"), col("Hidden", "'false'"), chap)
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
		if err := rows.Scan(&n.ID, &n.T, &n.N, &n.D, &n.P, &typ, &n.C, &hidden, &vol, &n.B, &n.A, &ch); err != nil {
			return nil, err
		}
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

// Même format que words.enc : flux HMAC-SHA256, MAC sur nonce+chiffré, contenu gzip.
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

func push(c Config, content []byte) error {
	if c.Token == "" {
		return errors.New("jeton GitHub manquant dans MotsKobo/config.txt (ligne token=…)")
	}
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
	if r, err := do("GET", u+"?ref="+url.QueryEscape(c.Branch), nil); err != nil {
		return err
	} else {
		var cur struct {
			SHA string `json:"sha"`
		}
		json.NewDecoder(r.Body).Decode(&cur)
		r.Body.Close()
		sha = cur.SHA
	}
	body := map[string]string{"message": "Annotations Kobo", "content": base64.StdEncoding.EncodeToString(content), "branch": c.Branch}
	if sha != "" {
		body["sha"] = sha
	}
	b, _ := json.Marshal(body)
	r, err := do("PUT", u, bytes.NewReader(b))
	if err != nil {
		return err
	}
	defer r.Body.Close()
	if r.StatusCode >= 300 {
		msg, _ := io.ReadAll(io.LimitReader(r.Body, 500))
		return fmt.Errorf("GitHub a refusé l'envoi (%d) : %s", r.StatusCode, msg)
	}
	return nil
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

func main() {
	dir := flag.String("dir", "/mnt/onboard/MotsKobo", "dossier de config.txt et du journal")
	dbPath := flag.String("db", "/mnt/onboard/.kobo/KoboReader.sqlite", "base de la Kobo")
	out := flag.String("out", "", "écrire notes.enc dans ce fichier au lieu de l'envoyer (tests)")
	force := flag.Bool("force", false, "envoyer même si rien n'a changé")
	tries := flag.Int("tries", 12, "essais de connexion, 10 s d'écart")
	flag.Parse()
	log.SetFlags(log.Ldate | log.Ltime)
	if *out == "" {
		if f, err := os.OpenFile(filepath.Join(*dir, "journal.txt"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644); err == nil {
			log.SetOutput(io.MultiWriter(os.Stdout, f))
		}
	}
	if err := run(*dir, *dbPath, *out, *force, *tries); err != nil {
		log.Println("ERREUR :", err)
		os.Exit(1)
	}
}

func run(dir, dbPath, out string, force bool, tries int) error {
	c, err := readConfig(filepath.Join(dir, "config.txt"))
	if err != nil {
		return err
	}
	notes, err := readNotes(dbPath)
	if err != nil {
		return fmt.Errorf("lecture des annotations : %w", err)
	}
	plain, _ := json.Marshal(map[string]any{"notes": notes})
	sum := sha256.Sum256(plain)
	stamp := hex.EncodeToString(sum[:])
	statePath := filepath.Join(dir, "dernier-envoi.txt")
	if prev, _ := os.ReadFile(statePath); !force && out == "" && strings.TrimSpace(string(prev)) == stamp {
		log.Printf("%d annotations, rien de nouveau", len(notes))
		return nil
	}
	plain, _ = json.Marshal(map[string]any{"notes": notes, "updated": time.Now().UTC().Format(time.RFC3339)})
	box, err := seal(plain, c.Key)
	if err != nil {
		return err
	}
	if out != "" {
		return os.WriteFile(out, box, 0644)
	}
	if !waitOnline(c.API, tries) {
		return errors.New("pas de connexion Internet")
	}
	if err := push(c, box); err != nil {
		return err
	}
	os.WriteFile(statePath, []byte(stamp), 0644)
	log.Printf("%d annotations envoyées", len(notes))
	return nil
}
