// Package store 透過 Supabase PostgREST 存取 books 表。
//
// 每個請求都帶著使用者自己的 access token，所以 RLS 會照常生效：
// Go 服務不持有 service role key，也看不到別人的資料。
package store

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/shushu010829/nextread/api/internal/books"
)

var (
	ErrNotFound = errors.New("not found")
	ErrConflict = errors.New("conflict")
)

// Store 是 HTTP 層需要的資料操作。
type Store interface {
	List(ctx context.Context, token string) ([]books.Book, error)
	Create(ctx context.Context, token string, row map[string]any) (books.Book, error)
	CreateMany(ctx context.Context, token string, rows []map[string]any) ([]books.Book, error)
	Update(ctx context.Context, token, id string, fields map[string]any) (books.Book, error)
	Delete(ctx context.Context, token, id string) error
}

// PostgREST 是 Supabase REST API 的 Store 實作。
type PostgREST struct {
	baseURL string // 例如 https://xxx.supabase.co
	anonKey string
	client  *http.Client
}

func NewPostgREST(supabaseURL, anonKey string) *PostgREST {
	return &PostgREST{
		baseURL: strings.TrimRight(supabaseURL, "/"),
		anonKey: anonKey,
		client:  &http.Client{Timeout: 15 * time.Second},
	}
}

func (p *PostgREST) do(ctx context.Context, token, method, query string, body any, out any) error {
	var rd io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		rd = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, p.baseURL+"/rest/v1/books"+query, rd)
	if err != nil {
		return err
	}
	req.Header.Set("apikey", p.anonKey)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	switch method {
	case http.MethodGet:
	case http.MethodPost:
		// missing=default：批次中某列沒給的欄位用資料庫預設值，而不是 NULL
		req.Header.Set("Prefer", "return=representation,missing=default")
	default:
		req.Header.Set("Prefer", "return=representation")
	}
	res, err := p.client.Do(req)
	if err != nil {
		return fmt.Errorf("supabase: %w", err)
	}
	defer res.Body.Close()
	data, err := io.ReadAll(io.LimitReader(res.Body, 10<<20))
	if err != nil {
		return err
	}
	if res.StatusCode == http.StatusConflict {
		return ErrConflict
	}
	if res.StatusCode >= 300 {
		var pgErr struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		}
		_ = json.Unmarshal(data, &pgErr)
		if pgErr.Code == "23505" {
			return ErrConflict
		}
		// 22P02：id 不是合法 uuid
		if pgErr.Code == "22P02" {
			return ErrNotFound
		}
		return fmt.Errorf("supabase %d: %s", res.StatusCode, strings.TrimSpace(string(data)))
	}
	if out != nil {
		return json.Unmarshal(data, out)
	}
	return nil
}

func (p *PostgREST) List(ctx context.Context, token string) ([]books.Book, error) {
	var out []books.Book
	q := "?select=*&order=finished_at.desc.nullslast,created_at.desc"
	if err := p.do(ctx, token, http.MethodGet, q, nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (p *PostgREST) Create(ctx context.Context, token string, row map[string]any) (books.Book, error) {
	out, err := p.CreateMany(ctx, token, []map[string]any{row})
	if err != nil {
		return books.Book{}, err
	}
	if len(out) != 1 {
		return books.Book{}, fmt.Errorf("supabase: expected 1 row, got %d", len(out))
	}
	return out[0], nil
}

func (p *PostgREST) CreateMany(ctx context.Context, token string, rows []map[string]any) ([]books.Book, error) {
	if len(rows) == 0 {
		return []books.Book{}, nil
	}
	// PostgREST 批次新增時每一列的欄位要一致，補齊缺少的欄位
	q := ""
	if cols := columns(rows); len(cols) > 0 {
		q = "?columns=" + url.QueryEscape(strings.Join(cols, ","))
	}
	var out []books.Book
	if err := p.do(ctx, token, http.MethodPost, q, rows, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func columns(rows []map[string]any) []string {
	seen := map[string]bool{}
	var cols []string
	for _, r := range rows {
		for k := range r {
			if !seen[k] {
				seen[k] = true
				cols = append(cols, k)
			}
		}
	}
	return cols
}

func (p *PostgREST) Update(ctx context.Context, token, id string, fields map[string]any) (books.Book, error) {
	var out []books.Book
	if err := p.do(ctx, token, http.MethodPatch, "?id=eq."+url.QueryEscape(id), fields, &out); err != nil {
		return books.Book{}, err
	}
	if len(out) == 0 {
		return books.Book{}, ErrNotFound
	}
	return out[0], nil
}

func (p *PostgREST) Delete(ctx context.Context, token, id string) error {
	var out []books.Book
	if err := p.do(ctx, token, http.MethodDelete, "?id=eq."+url.QueryEscape(id), nil, &out); err != nil {
		return err
	}
	if len(out) == 0 {
		return ErrNotFound
	}
	return nil
}
