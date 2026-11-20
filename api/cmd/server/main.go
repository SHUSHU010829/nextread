// nextread API server.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/shushu010829/nextread/api/internal/auth"
	"github.com/shushu010829/nextread/api/internal/httpapi"
	"github.com/shushu010829/nextread/api/internal/lookup"
	"github.com/shushu010829/nextread/api/internal/store"
)

func main() {
	log := slog.New(slog.NewTextHandler(os.Stdout, nil))

	supabaseURL := os.Getenv("SUPABASE_URL")
	anonKey := os.Getenv("SUPABASE_ANON_KEY")
	if supabaseURL == "" || anonKey == "" {
		log.Error("SUPABASE_URL 與 SUPABASE_ANON_KEY 必須設定")
		os.Exit(1)
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	origins := splitList(os.Getenv("ALLOWED_ORIGINS"))
	if len(origins) == 0 {
		origins = []string{"http://localhost:3000"}
	}

	srv := &httpapi.Server{
		Store: store.NewPostgREST(supabaseURL, anonKey),
		Auth:  auth.NewVerifier(supabaseURL, anonKey),
		Lookup: &lookup.Service{Providers: []lookup.Provider{
			lookup.NewGoogleBooks(os.Getenv("GOOGLE_BOOKS_API_KEY")),
			lookup.NewOpenLibrary(),
		}},
		AllowedOrigins: origins,
		Log:            log,
	}

	httpSrv := &http.Server{
		Addr:              ":" + port,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = httpSrv.Shutdown(shutdownCtx)
	}()

	log.Info("listening", "addr", httpSrv.Addr, "origins", origins)
	if err := httpSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Error("server", "err", err)
		os.Exit(1)
	}
}

func splitList(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
