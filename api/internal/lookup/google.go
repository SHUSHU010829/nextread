package lookup

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// GoogleBooks 查詢 Google Books API；APIKey 可空（有配額限制）。
type GoogleBooks struct {
	BaseURL string // 預設 https://www.googleapis.com/books/v1
	APIKey  string
	Client  *http.Client
}

func NewGoogleBooks(apiKey string) *GoogleBooks {
	return &GoogleBooks{
		BaseURL: "https://www.googleapis.com/books/v1",
		APIKey:  apiKey,
		Client:  &http.Client{Timeout: 8 * time.Second},
	}
}

func (g *GoogleBooks) Name() string { return "google" }

type gbVolume struct {
	VolumeInfo struct {
		Title               string   `json:"title"`
		Subtitle            string   `json:"subtitle"`
		Authors             []string `json:"authors"`
		Description         string   `json:"description"`
		Categories          []string `json:"categories"`
		PublishedDate       string   `json:"publishedDate"`
		Language            string   `json:"language"`
		IndustryIdentifiers []struct {
			Type       string `json:"type"`
			Identifier string `json:"identifier"`
		} `json:"industryIdentifiers"`
		ImageLinks struct {
			SmallThumbnail string `json:"smallThumbnail"`
			Thumbnail      string `json:"thumbnail"`
		} `json:"imageLinks"`
	} `json:"volumeInfo"`
}

func googleQuery(q Query) string {
	if q.ISBN != "" {
		return "isbn:" + q.ISBN
	}
	if q.Title != "" {
		s := "intitle:" + q.Title
		if q.Author != "" {
			s += " inauthor:" + q.Author
		}
		return s
	}
	return q.Text
}

func (g *GoogleBooks) Search(ctx context.Context, q Query) ([]Result, error) {
	v := url.Values{}
	v.Set("q", googleQuery(q))
	v.Set("maxResults", "10")
	v.Set("printType", "books")
	if g.APIKey != "" {
		v.Set("key", g.APIKey)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(g.BaseURL, "/")+"/volumes?"+v.Encode(), nil)
	if err != nil {
		return nil, err
	}
	res, err := g.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("status %d", res.StatusCode)
	}
	var body struct {
		Items []gbVolume `json:"items"`
	}
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		return nil, err
	}
	out := make([]Result, 0, len(body.Items))
	for _, it := range body.Items {
		vi := it.VolumeInfo
		if vi.Title == "" {
			continue
		}
		r := Result{
			Source:        "google",
			Title:         vi.Title,
			Subtitle:      vi.Subtitle,
			Authors:       nonNil(vi.Authors),
			Description:   cleanText(vi.Description),
			Categories:    nonNil(vi.Categories),
			PublishedDate: vi.PublishedDate,
			Language:      vi.Language,
		}
		for _, id := range vi.IndustryIdentifiers {
			if id.Type == "ISBN_13" {
				r.ISBN = id.Identifier
			} else if id.Type == "ISBN_10" && r.ISBN == "" {
				r.ISBN = id.Identifier
			}
		}
		if t := vi.ImageLinks.Thumbnail; t != "" {
			r.CoverURL = httpsURL(t)
		} else if t := vi.ImageLinks.SmallThumbnail; t != "" {
			r.CoverURL = httpsURL(t)
		}
		out = append(out, r)
	}
	return out, nil
}

func nonNil(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}
