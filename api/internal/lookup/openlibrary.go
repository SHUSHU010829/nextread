package lookup

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// OpenLibrary 查詢 Open Library 的 search API，並補抓前幾筆作品的簡介。
type OpenLibrary struct {
	BaseURL   string // 預設 https://openlibrary.org
	CoversURL string // 預設 https://covers.openlibrary.org
	Client    *http.Client
	// 補抓簡介的筆數上限（每筆多一次請求）
	DescriptionLimit int
}

func NewOpenLibrary() *OpenLibrary {
	return &OpenLibrary{
		BaseURL:          "https://openlibrary.org",
		CoversURL:        "https://covers.openlibrary.org",
		Client:           &http.Client{Timeout: 8 * time.Second},
		DescriptionLimit: 3,
	}
}

func (o *OpenLibrary) Name() string { return "openlibrary" }

type olDoc struct {
	Key              string   `json:"key"`
	Title            string   `json:"title"`
	Subtitle         string   `json:"subtitle"`
	AuthorName       []string `json:"author_name"`
	ISBN             []string `json:"isbn"`
	CoverI           int      `json:"cover_i"`
	Subject          []string `json:"subject"`
	FirstPublishYear int      `json:"first_publish_year"`
	Language         []string `json:"language"`
}

func (o *OpenLibrary) get(ctx context.Context, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(o.BaseURL, "/")+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	res, err := o.Client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("status %d", res.StatusCode)
	}
	return json.NewDecoder(res.Body).Decode(out)
}

func (o *OpenLibrary) Search(ctx context.Context, q Query) ([]Result, error) {
	v := url.Values{}
	switch {
	case q.ISBN != "":
		v.Set("isbn", q.ISBN)
	case q.Title != "":
		v.Set("title", q.Title)
		if q.Author != "" {
			v.Set("author", q.Author)
		}
	default:
		v.Set("q", q.Text)
	}
	v.Set("limit", "8")
	v.Set("fields", "key,title,subtitle,author_name,isbn,cover_i,subject,first_publish_year,language")

	var body struct {
		Docs []olDoc `json:"docs"`
	}
	if err := o.get(ctx, "/search.json?"+v.Encode(), &body); err != nil {
		return nil, err
	}

	out := make([]Result, 0, len(body.Docs))
	keys := make([]string, 0, len(body.Docs))
	for _, d := range body.Docs {
		if d.Title == "" {
			continue
		}
		r := Result{
			Source:     "openlibrary",
			Title:      d.Title,
			Subtitle:   d.Subtitle,
			Authors:    nonNil(d.AuthorName),
			Categories: firstN(d.Subject, 5),
		}
		if q.ISBN != "" {
			r.ISBN = q.ISBN
		} else {
			r.ISBN = pickISBN(d.ISBN)
		}
		if d.FirstPublishYear > 0 {
			r.PublishedDate = fmt.Sprint(d.FirstPublishYear)
		}
		if len(d.Language) > 0 {
			r.Language = d.Language[0]
		}
		if d.CoverI > 0 {
			r.CoverURL = fmt.Sprintf("%s/b/id/%d-M.jpg", strings.TrimRight(o.CoversURL, "/"), d.CoverI)
		}
		out = append(out, r)
		keys = append(keys, d.Key)
	}

	// 補抓前幾筆的作品簡介；失敗就略過，不影響結果
	var wg sync.WaitGroup
	for i := 0; i < len(out) && i < o.DescriptionLimit; i++ {
		if !strings.HasPrefix(keys[i], "/works/") {
			continue
		}
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			var work struct {
				Description json.RawMessage `json:"description"`
			}
			if err := o.get(ctx, keys[i]+".json", &work); err == nil {
				out[i].Description = cleanText(parseOLText(work.Description))
			}
		}(i)
	}
	wg.Wait()
	return out, nil
}

// parseOLText 處理 Open Library 的文字欄位：可能是字串或 {"type":..., "value":...}。
func parseOLText(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return s
	}
	var obj struct {
		Value string `json:"value"`
	}
	if err := json.Unmarshal(raw, &obj); err == nil {
		return obj.Value
	}
	return ""
}

func pickISBN(list []string) string {
	for _, s := range list {
		if len(s) == 13 {
			return s
		}
	}
	if len(list) > 0 {
		return list[0]
	}
	return ""
}

func firstN(s []string, n int) []string {
	if len(s) > n {
		s = s[:n]
	}
	return nonNil(s)
}
