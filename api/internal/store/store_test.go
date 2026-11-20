package store

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPostgRESTRequests(t *testing.T) {
	var got struct {
		method, path, query, auth, apikey, prefer string
		body                                      []map[string]any
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got.method, got.path, got.query = r.Method, r.URL.Path, r.URL.RawQuery
		got.auth, got.apikey, got.prefer = r.Header.Get("Authorization"), r.Header.Get("apikey"), r.Header.Get("Prefer")
		got.body = nil
		if b, _ := io.ReadAll(r.Body); len(b) > 0 {
			_ = json.Unmarshal(b, &got.body)
		}
		switch r.Method {
		case http.MethodGet:
			w.Write([]byte(`[{"id":"1","title":"A","status":"read","rating":1,"categories":[]}]`))
		case http.MethodPost:
			if got.body[0]["title"] == "dup" {
				w.WriteHeader(http.StatusConflict)
				w.Write([]byte(`{"code":"23505","message":"duplicate key"}`))
				return
			}
			w.WriteHeader(http.StatusCreated)
			w.Write([]byte(`[{"id":"2","title":"B","status":"want"}]`))
		case http.MethodPatch, http.MethodDelete:
			w.Write([]byte(`[]`))
		}
	}))
	defer srv.Close()

	p := NewPostgREST(srv.URL+"/", "anon")
	ctx := context.Background()

	list, err := p.List(ctx, "tok")
	if err != nil || len(list) != 1 || *list[0].Rating != 1 {
		t.Fatalf("List = %#v, %v", list, err)
	}
	if got.path != "/rest/v1/books" || got.auth != "Bearer tok" || got.apikey != "anon" {
		t.Fatalf("bad request: %+v", got)
	}

	b, err := p.Create(ctx, "tok", map[string]any{"title": "B"})
	if err != nil || b.ID != "2" {
		t.Fatalf("Create = %#v, %v", b, err)
	}
	if got.prefer != "return=representation,missing=default" || got.query != "columns=title" {
		t.Fatalf("bad create request: %+v", got)
	}

	if _, err := p.Create(ctx, "tok", map[string]any{"title": "dup"}); !errors.Is(err, ErrConflict) {
		t.Fatalf("expected conflict, got %v", err)
	}
	if _, err := p.Update(ctx, "tok", "x", map[string]any{"note": "n"}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected not found, got %v", err)
	}
	if got.query != "id=eq.x" {
		t.Fatalf("bad update query: %s", got.query)
	}
	if err := p.Delete(ctx, "tok", "x"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected not found, got %v", err)
	}
}
