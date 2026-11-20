package auth

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func TestVerifier(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.URL.Path != "/auth/v1/user" || r.Header.Get("apikey") != "anon" {
			t.Errorf("bad request %s %v", r.URL.Path, r.Header)
		}
		if r.Header.Get("Authorization") != "Bearer good" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.Write([]byte(`{"id":"u1","email":"a@example.com"}`))
	}))
	defer srv.Close()

	v := NewVerifier(srv.URL, "anon")
	now := time.Unix(1000, 0)
	v.now = func() time.Time { return now }

	u, err := v.Verify(context.Background(), "good")
	if err != nil || u.ID != "u1" || u.Token != "good" {
		t.Fatalf("Verify = %+v, %v", u, err)
	}
	if _, err := v.Verify(context.Background(), "good"); err != nil {
		t.Fatal(err)
	}
	if calls.Load() != 1 {
		t.Fatalf("expected cached result, calls = %d", calls.Load())
	}
	now = now.Add(3 * time.Minute)
	if _, err := v.Verify(context.Background(), "good"); err != nil || calls.Load() != 2 {
		t.Fatalf("expected refresh after ttl, calls = %d, err = %v", calls.Load(), err)
	}
	if _, err := v.Verify(context.Background(), "bad"); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("expected unauthorized, got %v", err)
	}
	if _, err := v.Verify(context.Background(), ""); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("expected unauthorized, got %v", err)
	}
}

func TestBearerToken(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.Header.Set("Authorization", "bearer abc ")
	if got := BearerToken(r); got != "abc" {
		t.Fatalf("got %q", got)
	}
	r.Header.Set("Authorization", "Basic abc")
	if got := BearerToken(r); got != "" {
		t.Fatalf("got %q", got)
	}
}
