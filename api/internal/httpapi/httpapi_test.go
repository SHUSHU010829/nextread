package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/shushu010829/nextread/api/internal/auth"
	"github.com/shushu010829/nextread/api/internal/books"
	"github.com/shushu010829/nextread/api/internal/lookup"
	"github.com/shushu010829/nextread/api/internal/store"
)

// ---- fakes ----

type fakeAuth struct{}

func (fakeAuth) Verify(_ context.Context, token string) (auth.User, error) {
	if token != "tok" {
		return auth.User{}, auth.ErrUnauthorized
	}
	return auth.User{ID: "u1", Token: token}, nil
}

type memStore struct {
	mu    sync.Mutex
	books []books.Book
	seq   int
}

func str(s string) *string { return &s }

func apply(b *books.Book, row map[string]any) {
	for k, v := range row {
		switch k {
		case "title":
			b.Title = v.(string)
		case "author":
			b.Author = v.(string)
		case "isbn":
			if v == nil {
				b.ISBN = nil
			} else {
				b.ISBN = str(v.(string))
			}
		case "cover_url":
			b.CoverURL = v.(string)
		case "description":
			b.Description = v.(string)
		case "categories":
			b.Categories = v.([]string)
		case "status":
			b.Status = v.(books.Status)
		case "rating":
			if v == nil {
				b.Rating = nil
			} else {
				r := v.(int)
				b.Rating = &r
			}
		case "note":
			b.Note = v.(string)
		}
	}
}

func (m *memStore) List(context.Context, string) ([]books.Book, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]books.Book(nil), m.books...), nil
}

func (m *memStore) Create(ctx context.Context, tok string, row map[string]any) (books.Book, error) {
	out, err := m.CreateMany(ctx, tok, []map[string]any{row})
	if err != nil {
		return books.Book{}, err
	}
	return out[0], nil
}

func (m *memStore) CreateMany(_ context.Context, _ string, rows []map[string]any) ([]books.Book, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []books.Book
	for _, row := range rows {
		if isbn, ok := row["isbn"].(string); ok {
			for _, b := range m.books {
				if b.ISBN != nil && *b.ISBN == isbn {
					return nil, store.ErrConflict
				}
			}
		}
		m.seq++
		b := books.Book{ID: fmt.Sprint(m.seq), UserID: "u1"}
		apply(&b, row)
		m.books = append(m.books, b)
		out = append(out, b)
	}
	return out, nil
}

func (m *memStore) Update(_ context.Context, _ string, id string, fields map[string]any) (books.Book, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if isbn, ok := fields["isbn"].(string); ok {
		for _, b := range m.books {
			if b.ID != id && b.ISBN != nil && *b.ISBN == isbn {
				return books.Book{}, store.ErrConflict
			}
		}
	}
	for i := range m.books {
		if m.books[i].ID == id {
			apply(&m.books[i], fields)
			return m.books[i], nil
		}
	}
	return books.Book{}, store.ErrNotFound
}

func (m *memStore) Delete(_ context.Context, _ string, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for i := range m.books {
		if m.books[i].ID == id {
			m.books = append(m.books[:i], m.books[i+1:]...)
			return nil
		}
	}
	return store.ErrNotFound
}

type fakeLookup struct{}

func (fakeLookup) Search(_ context.Context, q lookup.Query) ([]lookup.Result, error) {
	if q.Title == "三體" || q.Text == "三體" {
		return []lookup.Result{{Source: "google", Title: "三體", Authors: []string{"劉慈欣"}, ISBN: "9789573327059",
			Description: "科幻小說", CoverURL: "https://img/3.jpg", Categories: []string{"Fiction"}}}, nil
	}
	return []lookup.Result{{Source: "google", Title: "Unrelated"}}, nil
}

// ---- helpers ----

func newTestServer() (*Server, *memStore) {
	st := &memStore{}
	return &Server{Store: st, Auth: fakeAuth{}, Lookup: fakeLookup{}, AllowedOrigins: []string{"http://localhost:3000"}}, st
}

func call(t *testing.T, h http.Handler, method, path, body string) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	var rd io.Reader
	if body != "" {
		rd = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, path, rd)
	req.Header.Set("Authorization", "Bearer tok")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var out map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	return rec, out
}

// ---- tests ----

func TestAuthRequired(t *testing.T) {
	s, _ := newTestServer()
	req := httptest.NewRequest(http.MethodGet, "/books", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("code = %d", rec.Code)
	}
}

func TestCORS(t *testing.T) {
	s, _ := newTestServer()
	req := httptest.NewRequest(http.MethodOptions, "/books", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent || rec.Header().Get("Access-Control-Allow-Origin") != "http://localhost:3000" {
		t.Fatalf("code = %d headers = %v", rec.Code, rec.Header())
	}
	req.Header.Set("Origin", "https://evil.example")
	rec = httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatal("unexpected allowed origin")
	}
}

func TestBookCRUD(t *testing.T) {
	s, st := newTestServer()
	h := s.Handler()

	rec, out := call(t, h, http.MethodPost, "/books", `{"title":"挪威的森林","author":"村上春樹","status":"read","rating":1,"isbn":"978-957-13-3082-5"}`)
	if rec.Code != http.StatusCreated || out["id"] != "1" || out["isbn"] != "9789571330825" {
		t.Fatalf("create: %d %v", rec.Code, out)
	}

	rec, out = call(t, h, http.MethodPost, "/books", `{"title":"other","isbn":"9789571330825"}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("dup isbn: %d %v", rec.Code, out)
	}

	rec, out = call(t, h, http.MethodPost, "/books", `{"title":"","rating":3}`)
	if rec.Code != http.StatusBadRequest || out["error"] == nil {
		t.Fatalf("validation: %d %v", rec.Code, out)
	}

	rec, out = call(t, h, http.MethodPut, "/books/1", `{"title":"挪威的森林","status":"read","rating":null,"note":"重讀"}`)
	if rec.Code != http.StatusOK || out["rating"] != nil || out["note"] != "重讀" {
		t.Fatalf("update: %d %v", rec.Code, out)
	}

	rec, _ = call(t, h, http.MethodPut, "/books/999", `{"title":"x"}`)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("update missing: %d", rec.Code)
	}

	req := httptest.NewRequest(http.MethodGet, "/books", nil)
	req.Header.Set("Authorization", "Bearer tok")
	lrec := httptest.NewRecorder()
	h.ServeHTTP(lrec, req)
	var list []books.Book
	if err := json.Unmarshal(lrec.Body.Bytes(), &list); err != nil || len(list) != 1 {
		t.Fatalf("list: %s", lrec.Body)
	}

	rec, _ = call(t, h, http.MethodDelete, "/books/1", "")
	if rec.Code != http.StatusNoContent || len(st.books) != 0 {
		t.Fatalf("delete: %d", rec.Code)
	}
}

func TestImport(t *testing.T) {
	s, st := newTestServer()
	h := s.Handler()
	st.books = []books.Book{{ID: "x", Title: "人類大歷史", Author: "哈拉瑞"}}

	body := `[{"title":"挪威的森林","author":"村上春樹","status":"read","rating":1,"finishedAt":"2026-09-01"},
	          {"title":"人類大歷史","author":"哈拉瑞","status":"want","rating":null},
	          {"title":"","rating":1}]`
	rec, out := call(t, h, http.MethodPost, "/books/import", body)
	if rec.Code != http.StatusOK || out["imported"] != float64(1) {
		t.Fatalf("import: %d %v", rec.Code, out)
	}
	if len(out["skipped"].([]any)) != 1 || len(out["errors"].([]any)) != 1 {
		t.Fatalf("import result: %v", out)
	}
	if len(st.books) != 2 {
		t.Fatalf("books = %d", len(st.books))
	}

	rec, _ = call(t, h, http.MethodPost, "/books/import", `not json`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("bad import: %d", rec.Code)
	}
}

func TestLookup(t *testing.T) {
	s, _ := newTestServer()
	h := s.Handler()
	req := httptest.NewRequest(http.MethodGet, "/lookup?q="+"%E4%B8%89%E9%AB%94", nil)
	req.Header.Set("Authorization", "Bearer tok")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var res []lookup.Result
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil || len(res) != 1 || res[0].Title != "三體" {
		t.Fatalf("lookup: %d %s", rec.Code, rec.Body)
	}
	rec2, _ := call(t, h, http.MethodGet, "/lookup?q=", "")
	if rec2.Code != http.StatusBadRequest {
		t.Fatalf("empty lookup: %d", rec2.Code)
	}
}

func TestEnrich(t *testing.T) {
	s, st := newTestServer()
	h := s.Handler()
	st.books = []books.Book{
		{ID: "1", Title: "三體", Description: ""},
		{ID: "2", Title: "冷門書", Description: ""},
		{ID: "3", Title: "已完整", Description: "有了", CoverURL: "https://c"},
		{ID: "4", Title: "三體", Description: "我自己寫的", CoverURL: ""},
		{ID: "5", Title: "三體 平裝版", Description: "d", CoverURL: "https://c", ISBN: str("9789573327059")},
	}
	rec, out := call(t, h, http.MethodPost, "/books/enrich", `{}`)
	if rec.Code != http.StatusOK || out["updated"] != float64(2) {
		t.Fatalf("enrich: %d %v", rec.Code, out)
	}
	if len(out["results"].([]any)) != 3 {
		t.Fatalf("results: %v", out["results"])
	}
	b1 := st.books[0]
	if b1.Description != "科幻小說" || b1.CoverURL == "" || b1.Author != "劉慈欣" {
		t.Fatalf("book 1 not enriched: %+v", b1)
	}
	b4 := st.books[3]
	if b4.Description != "我自己寫的" || b4.CoverURL != "https://img/3.jpg" {
		t.Fatalf("book 4 should keep manual description: %+v", b4)
	}
	if b1.ISBN != nil || b4.ISBN != nil {
		t.Fatalf("duplicate isbn should be skipped: %+v %+v", b1, b4)
	}
	if st.books[1].Description != "" {
		t.Fatal("unrelated result should not be applied")
	}
}
