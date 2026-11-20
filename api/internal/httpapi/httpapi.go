// Package httpapi 是前端呼叫的 REST API。
package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/shushu010829/nextread/api/internal/auth"
	"github.com/shushu010829/nextread/api/internal/books"
	"github.com/shushu010829/nextread/api/internal/lookup"
	"github.com/shushu010829/nextread/api/internal/store"
)

// Searcher 是書籍資料查詢服務（lookup.Service）。
type Searcher interface {
	Search(ctx context.Context, q lookup.Query) ([]lookup.Result, error)
}

type Server struct {
	Store          store.Store
	Auth           auth.TokenVerifier
	Lookup         Searcher
	AllowedOrigins []string
	Log            *slog.Logger
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.Handle("GET /books", s.authed(s.listBooks))
	mux.Handle("POST /books", s.authed(s.createBook))
	mux.Handle("PUT /books/{id}", s.authed(s.updateBook))
	mux.Handle("DELETE /books/{id}", s.authed(s.deleteBook))
	mux.Handle("POST /books/import", s.authed(s.importBooks))
	mux.Handle("POST /books/enrich", s.authed(s.enrichBooks))
	mux.Handle("GET /lookup", s.authed(s.lookup))
	return s.cors(mux)
}

func (s *Server) logger() *slog.Logger {
	if s.Log != nil {
		return s.Log
	}
	return slog.Default()
}

// ---- middleware ----

func (s *Server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && s.originAllowed(origin) {
			h := w.Header()
			h.Set("Access-Control-Allow-Origin", origin)
			h.Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			h.Set("Access-Control-Max-Age", "600")
			h.Add("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) originAllowed(origin string) bool {
	for _, o := range s.AllowedOrigins {
		if o == "*" || strings.EqualFold(o, origin) {
			return true
		}
	}
	return false
}

func (s *Server) authed(h func(http.ResponseWriter, *http.Request, auth.User)) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, err := s.Auth.Verify(r.Context(), auth.BearerToken(r))
		if err != nil {
			if errors.Is(err, auth.ErrUnauthorized) {
				writeError(w, http.StatusUnauthorized, "請先登入")
				return
			}
			s.logger().Error("auth", "err", err)
			writeError(w, http.StatusBadGateway, "無法驗證登入狀態")
			return
		}
		h(w, r.WithContext(auth.WithUser(r.Context(), u)), u)
	})
}

// ---- books ----

func (s *Server) listBooks(w http.ResponseWriter, r *http.Request, u auth.User) {
	list, err := s.Store.List(r.Context(), u.Token)
	if err != nil {
		s.storeError(w, err)
		return
	}
	if list == nil {
		list = []books.Book{}
	}
	writeJSON(w, http.StatusOK, list)
}

func (s *Server) createBook(w http.ResponseWriter, r *http.Request, u auth.User) {
	var in books.Input
	if !decode(w, r, &in) {
		return
	}
	row, err := in.Row()
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	b, err := s.Store.Create(r.Context(), u.Token, row)
	if err != nil {
		s.storeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, b)
}

func (s *Server) updateBook(w http.ResponseWriter, r *http.Request, u auth.User) {
	var in books.Input
	if !decode(w, r, &in) {
		return
	}
	row, err := in.Row()
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	b, err := s.Store.Update(r.Context(), u.Token, r.PathValue("id"), row)
	if err != nil {
		s.storeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, b)
}

func (s *Server) deleteBook(w http.ResponseWriter, r *http.Request, u auth.User) {
	if err := s.Store.Delete(r.Context(), u.Token, r.PathValue("id")); err != nil {
		s.storeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type importResponse struct {
	Imported int                 `json:"imported"`
	Skipped  []string            `json:"skipped"`
	Errors   []books.ImportError `json:"errors"`
}

func (s *Server) importBooks(w http.ResponseWriter, r *http.Request, u auth.User) {
	data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 5<<20))
	if err != nil {
		writeError(w, http.StatusRequestEntityTooLarge, "匯入檔案太大（上限 5MB）")
		return
	}
	items, err := books.ParseImport(data)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	existing, err := s.Store.List(r.Context(), u.Token)
	if err != nil {
		s.storeError(w, err)
		return
	}
	plan := books.PlanImport(items, existing)
	created, err := s.Store.CreateMany(r.Context(), u.Token, plan.Rows)
	if err != nil {
		s.storeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, importResponse{Imported: len(created), Skipped: plan.Skipped, Errors: plan.Errors})
}

// ---- Phase 2：書籍資料 ----

func (s *Server) lookup(w http.ResponseWriter, r *http.Request, _ auth.User) {
	q := lookup.ParseQuery(r.URL.Query().Get("q"))
	if t := strings.TrimSpace(r.URL.Query().Get("title")); t != "" && q.Empty() {
		q = lookup.Query{Title: t, Author: strings.TrimSpace(r.URL.Query().Get("author"))}
	}
	if q.Empty() {
		writeError(w, http.StatusBadRequest, "請輸入書名或 ISBN")
		return
	}
	res, err := s.Lookup.Search(r.Context(), q)
	if err != nil {
		s.logger().Warn("lookup", "err", err)
		writeError(w, http.StatusBadGateway, "書籍資料查詢失敗，請稍後再試")
		return
	}
	writeJSON(w, http.StatusOK, res)
}

type enrichResult struct {
	ID     string `json:"id"`
	Title  string `json:"title"`
	Status string `json:"status"` // updated | not_found | error
	Source string `json:"source,omitempty"`
}

type enrichResponse struct {
	Updated int            `json:"updated"`
	Results []enrichResult `json:"results"`
}

// NeedsEnrich 判斷一本書是否缺簡介或封面。
func NeedsEnrich(b books.Book) bool {
	return strings.TrimSpace(b.Description) == "" || strings.TrimSpace(b.CoverURL) == ""
}

// enrichFields 只填入原本空白的欄位，不覆蓋使用者手動輸入的內容。
func enrichFields(b books.Book, r lookup.Result) map[string]any {
	f := map[string]any{}
	if strings.TrimSpace(b.Description) == "" && r.Description != "" {
		f["description"] = r.Description
	}
	if strings.TrimSpace(b.CoverURL) == "" && r.CoverURL != "" {
		f["cover_url"] = r.CoverURL
	}
	if len(b.Categories) == 0 && len(r.Categories) > 0 {
		f["categories"] = books.CleanCategories(r.Categories)
	}
	if b.ISBN == nil {
		if isbn := books.NormalizeISBN(r.ISBN); isbn != "" {
			f["isbn"] = isbn
		}
	}
	if strings.TrimSpace(b.Author) == "" && len(r.Authors) > 0 {
		f["author"] = strings.Join(r.Authors, "、")
	}
	return f
}

// enrichBooks 批次替缺少簡介或封面的書補上資料。
// body 可帶 {"ids": [...]} 只處理指定的書；省略時處理全部需要補的書。
func (s *Server) enrichBooks(w http.ResponseWriter, r *http.Request, u auth.User) {
	var body struct {
		IDs []string `json:"ids"`
	}
	if r.ContentLength != 0 && !decode(w, r, &body) {
		return
	}
	list, err := s.Store.List(r.Context(), u.Token)
	if err != nil {
		s.storeError(w, err)
		return
	}
	want := map[string]bool{}
	for _, id := range body.IDs {
		want[id] = true
	}
	var todo []books.Book
	for _, b := range list {
		if (len(want) == 0 || want[b.ID]) && NeedsEnrich(b) {
			todo = append(todo, b)
		}
	}

	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Minute)
	defer cancel()
	results := make([]enrichResult, len(todo))
	sem := make(chan struct{}, 3)
	var wg sync.WaitGroup
	for i, b := range todo {
		wg.Add(1)
		go func(i int, b books.Book) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			results[i] = s.enrichOne(ctx, u.Token, b)
		}(i, b)
	}
	wg.Wait()

	resp := enrichResponse{Results: results}
	for _, res := range results {
		if res.Status == "updated" {
			resp.Updated++
		}
	}
	if resp.Results == nil {
		resp.Results = []enrichResult{}
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) enrichOne(ctx context.Context, token string, b books.Book) enrichResult {
	out := enrichResult{ID: b.ID, Title: b.Title}
	var match lookup.Result
	found := false

	if b.ISBN != nil {
		if res, err := s.Lookup.Search(ctx, lookup.Query{ISBN: *b.ISBN}); err == nil && len(res) > 0 {
			match, found = res[0], true
		}
	}
	if !found {
		res, err := s.Lookup.Search(ctx, lookup.Query{Title: b.Title, Author: b.Author})
		if err != nil {
			s.logger().Warn("enrich lookup", "title", b.Title, "err", err)
			out.Status = "error"
			return out
		}
		match, found = lookup.Best(res, b.Title)
	}
	if !found {
		out.Status = "not_found"
		return out
	}
	fields := enrichFields(b, match)
	if len(fields) == 0 {
		out.Status = "not_found"
		return out
	}
	if _, err := s.Store.Update(ctx, token, b.ID, fields); err != nil {
		// ISBN 跟書櫃裡別本書重複時，不填 ISBN 再試一次
		if errors.Is(err, store.ErrConflict) {
			delete(fields, "isbn")
			if len(fields) > 0 {
				_, err = s.Store.Update(ctx, token, b.ID, fields)
			}
		}
		if err != nil {
			s.logger().Warn("enrich update", "title", b.Title, "err", err)
			out.Status = "error"
			return out
		}
	}
	out.Status, out.Source = "updated", match.Source
	return out
}

// ---- helpers ----

func (s *Server) storeError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusNotFound, "找不到這本書")
	case errors.Is(err, store.ErrConflict):
		writeError(w, http.StatusConflict, "書櫃裡已經有相同 ISBN 的書")
	default:
		s.logger().Error("store", "err", err)
		writeError(w, http.StatusBadGateway, "資料庫暫時無法使用")
	}
}

func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	if err := dec.Decode(v); err != nil {
		writeError(w, http.StatusBadRequest, "JSON 格式錯誤")
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
