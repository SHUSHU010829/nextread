// Package lookup 從 Google Books（主要）與 Open Library（備援）查詢書籍資料。
package lookup

import (
	"context"
	"errors"
	"html"
	"regexp"
	"strings"

	"github.com/shushu010829/nextread/api/internal/books"
)

// Result 是正規化後的查詢結果，前端用它自動填入表單。
type Result struct {
	Source        string   `json:"source"`
	Title         string   `json:"title"`
	Subtitle      string   `json:"subtitle,omitempty"`
	Authors       []string `json:"authors"`
	ISBN          string   `json:"isbn,omitempty"`
	CoverURL      string   `json:"cover_url,omitempty"`
	Description   string   `json:"description,omitempty"`
	Categories    []string `json:"categories"`
	PublishedDate string   `json:"published_date,omitempty"`
	Language      string   `json:"language,omitempty"`
}

// Query 是一次查詢：ISBN 優先，否則用書名＋作者或自由文字。
type Query struct {
	ISBN   string
	Title  string
	Author string
	Text   string
}

func (q Query) Empty() bool {
	return q.ISBN == "" && strings.TrimSpace(q.Title) == "" && strings.TrimSpace(q.Text) == ""
}

// ParseQuery 判斷使用者輸入的是 ISBN 還是書名。
func ParseQuery(s string) Query {
	s = strings.TrimSpace(s)
	if isbn := books.NormalizeISBN(s); isbn != "" {
		return Query{ISBN: isbn}
	}
	return Query{Text: s}
}

// Provider 是一個書籍資料來源。
type Provider interface {
	Name() string
	Search(ctx context.Context, q Query) ([]Result, error)
}

// Service 依序嘗試各個來源，回傳第一個有結果的來源。
type Service struct {
	Providers []Provider
}

func (s *Service) Search(ctx context.Context, q Query) ([]Result, error) {
	if q.Empty() {
		return []Result{}, nil
	}
	var errs []error
	for _, p := range s.Providers {
		res, err := p.Search(ctx, q)
		if err != nil {
			errs = append(errs, errors.New(p.Name()+": "+err.Error()))
			continue
		}
		if len(res) > 0 {
			return res, nil
		}
	}
	if len(errs) == len(s.Providers) && len(errs) > 0 {
		return nil, errors.Join(errs...)
	}
	return []Result{}, nil
}

// Best 從結果中挑出書名吻合的第一筆，用於批次補資料；找不到時回傳 false。
func Best(results []Result, title string) (Result, bool) {
	want := books.NormalizeTitle(title)
	if want == "" {
		return Result{}, false
	}
	for _, r := range results {
		got := books.NormalizeTitle(r.Title)
		full := books.NormalizeTitle(r.Title + r.Subtitle)
		if got == "" {
			continue
		}
		if got == want || full == want || strings.Contains(want, got) || strings.Contains(got, want) {
			return r, true
		}
	}
	return Result{}, false
}

var (
	brRe  = regexp.MustCompile(`(?i)<br\s*/?>|</p>`)
	tagRe = regexp.MustCompile(`<[^>]+>`)
	nlRe  = regexp.MustCompile(`\n{3,}`)
)

// cleanText 移除 HTML 標籤並整理空行（Google Books 的簡介有時帶 HTML）。
func cleanText(s string) string {
	s = brRe.ReplaceAllString(s, "\n")
	s = tagRe.ReplaceAllString(s, "")
	s = html.UnescapeString(s)
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = nlRe.ReplaceAllString(s, "\n\n")
	return strings.TrimSpace(s)
}

func httpsURL(u string) string {
	if strings.HasPrefix(u, "http://") {
		return "https://" + strings.TrimPrefix(u, "http://")
	}
	return u
}
