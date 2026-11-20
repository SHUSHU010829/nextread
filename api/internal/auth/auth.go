// Package auth 驗證 Supabase Auth 發出的 access token。
//
// 做法是把 token 交給 Supabase 的 /auth/v1/user 驗證，並短暫快取結果，
// 不必在 Go 端處理 JWT secret 或 JWKS 金鑰輪替。
package auth

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

var ErrUnauthorized = errors.New("unauthorized")

// User 是通過驗證的使用者，Token 會再轉交給 PostgREST 讓 RLS 生效。
type User struct {
	ID    string
	Email string
	Token string
}

type ctxKey struct{}

func WithUser(ctx context.Context, u User) context.Context {
	return context.WithValue(ctx, ctxKey{}, u)
}

func FromContext(ctx context.Context) (User, bool) {
	u, ok := ctx.Value(ctxKey{}).(User)
	return u, ok
}

type cached struct {
	user    User
	expires time.Time
}

// Verifier 透過 Supabase Auth 驗證 token。
type Verifier struct {
	baseURL string
	anonKey string
	client  *http.Client
	ttl     time.Duration
	now     func() time.Time

	mu    sync.Mutex
	cache map[[32]byte]cached
}

func NewVerifier(supabaseURL, anonKey string) *Verifier {
	return &Verifier{
		baseURL: strings.TrimRight(supabaseURL, "/"),
		anonKey: anonKey,
		client:  &http.Client{Timeout: 10 * time.Second},
		ttl:     2 * time.Minute,
		now:     time.Now,
		cache:   map[[32]byte]cached{},
	}
}

func (v *Verifier) Verify(ctx context.Context, token string) (User, error) {
	if token == "" {
		return User{}, ErrUnauthorized
	}
	key := sha256.Sum256([]byte(token))
	now := v.now()

	v.mu.Lock()
	if c, ok := v.cache[key]; ok && now.Before(c.expires) {
		v.mu.Unlock()
		return c.user, nil
	}
	v.mu.Unlock()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, v.baseURL+"/auth/v1/user", nil)
	if err != nil {
		return User{}, err
	}
	req.Header.Set("apikey", v.anonKey)
	req.Header.Set("Authorization", "Bearer "+token)
	res, err := v.client.Do(req)
	if err != nil {
		return User{}, fmt.Errorf("supabase auth: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusUnauthorized || res.StatusCode == http.StatusForbidden {
		return User{}, ErrUnauthorized
	}
	if res.StatusCode != http.StatusOK {
		return User{}, fmt.Errorf("supabase auth: status %d", res.StatusCode)
	}
	var body struct {
		ID    string `json:"id"`
		Email string `json:"email"`
	}
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		return User{}, fmt.Errorf("supabase auth: %w", err)
	}
	if body.ID == "" {
		return User{}, ErrUnauthorized
	}
	u := User{ID: body.ID, Email: body.Email, Token: token}

	v.mu.Lock()
	for k, c := range v.cache {
		if !now.Before(c.expires) {
			delete(v.cache, k)
		}
	}
	v.cache[key] = cached{user: u, expires: now.Add(v.ttl)}
	v.mu.Unlock()
	return u, nil
}

// TokenVerifier 讓 HTTP 層在測試時可以換成假的驗證器。
type TokenVerifier interface {
	Verify(ctx context.Context, token string) (User, error)
}

// BearerToken 從 Authorization header 取出 token。
func BearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if len(h) > 7 && strings.EqualFold(h[:7], "bearer ") {
		return strings.TrimSpace(h[7:])
	}
	return ""
}
