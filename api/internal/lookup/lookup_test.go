package lookup

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestParseQuery(t *testing.T) {
	if q := ParseQuery(" 978-986-479-290-1 "); q.ISBN != "9789864792901" {
		t.Fatalf("got %+v", q)
	}
	if q := ParseQuery("被討厭的勇氣"); q.Text != "被討厭的勇氣" || q.ISBN != "" {
		t.Fatalf("got %+v", q)
	}
}

func TestGoogleBooks(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/volumes" || r.URL.Query().Get("q") != "isbn:9789861342338" || r.URL.Query().Get("key") != "k" {
			t.Errorf("bad request %s", r.URL)
		}
		w.Write([]byte(`{"items":[
		  {"volumeInfo":{"title":"被討厭的勇氣","authors":["岸見一郎","古賀史健"],
		   "description":"<p>阿德勒心理學</p><p>第二段&amp;結尾</p>",
		   "categories":["Psychology"],"publishedDate":"2014-10",
		   "industryIdentifiers":[{"type":"ISBN_10","identifier":"9861342331"},{"type":"ISBN_13","identifier":"9789861342338"}],
		   "imageLinks":{"thumbnail":"http://books.google.com/x.jpg"}}},
		  {"volumeInfo":{"title":""}}
		]}`))
	}))
	defer srv.Close()

	g := &GoogleBooks{BaseURL: srv.URL, APIKey: "k", Client: srv.Client()}
	res, err := g.Search(context.Background(), Query{ISBN: "9789861342338"})
	if err != nil {
		t.Fatal(err)
	}
	if len(res) != 1 {
		t.Fatalf("got %d results", len(res))
	}
	r := res[0]
	if r.ISBN != "9789861342338" || r.CoverURL != "https://books.google.com/x.jpg" || len(r.Authors) != 2 {
		t.Fatalf("unexpected result %+v", r)
	}
	if r.Description != "阿德勒心理學\n第二段&結尾" {
		t.Fatalf("description = %q", r.Description)
	}
}

func TestGoogleQuery(t *testing.T) {
	if got := googleQuery(Query{Title: "三體", Author: "劉慈欣"}); got != "intitle:三體 inauthor:劉慈欣" {
		t.Fatal(got)
	}
	if got := googleQuery(Query{Text: "三體"}); got != "三體" {
		t.Fatal(got)
	}
}

func TestOpenLibrary(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/search.json":
			if r.URL.Query().Get("title") != "Dune" || r.URL.Query().Get("author") != "Herbert" {
				t.Errorf("bad query %s", r.URL.RawQuery)
			}
			w.Write([]byte(`{"docs":[
			  {"key":"/works/OL1W","title":"Dune","author_name":["Frank Herbert"],"isbn":["0441013597","9780441013593"],"cover_i":42,"subject":["a","b","c","d","e","f"],"first_publish_year":1965},
			  {"key":"/works/OL2W","title":"Dune Messiah","author_name":["Frank Herbert"]}
			]}`))
		case "/works/OL1W.json":
			w.Write([]byte(`{"description":{"type":"/type/text","value":"Desert planet."}}`))
		case "/works/OL2W.json":
			w.Write([]byte(`{"description":"Sequel."}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	o := &OpenLibrary{BaseURL: srv.URL, CoversURL: "https://covers.example", Client: srv.Client(), DescriptionLimit: 3}
	res, err := o.Search(context.Background(), Query{Title: "Dune", Author: "Herbert"})
	if err != nil {
		t.Fatal(err)
	}
	if len(res) != 2 {
		t.Fatalf("got %d", len(res))
	}
	if res[0].ISBN != "9780441013593" || res[0].CoverURL != "https://covers.example/b/id/42-M.jpg" ||
		res[0].Description != "Desert planet." || len(res[0].Categories) != 5 || res[0].PublishedDate != "1965" {
		t.Fatalf("unexpected %+v", res[0])
	}
	if res[1].Description != "Sequel." {
		t.Fatalf("unexpected %+v", res[1])
	}
}

type fakeProvider struct {
	name string
	res  []Result
	err  error
}

func (f fakeProvider) Name() string { return f.name }
func (f fakeProvider) Search(context.Context, Query) ([]Result, error) {
	return f.res, f.err
}

func TestServiceFallback(t *testing.T) {
	ctx := context.Background()
	q := Query{Text: "x"}

	s := &Service{Providers: []Provider{
		fakeProvider{name: "a", err: errors.New("down")},
		fakeProvider{name: "b", res: []Result{{Title: "B"}}},
	}}
	if res, err := s.Search(ctx, q); err != nil || res[0].Title != "B" {
		t.Fatalf("fallback after error: %v %v", res, err)
	}

	s = &Service{Providers: []Provider{fakeProvider{name: "a"}, fakeProvider{name: "b", res: []Result{{Title: "B"}}}}}
	if res, _ := s.Search(ctx, q); len(res) != 1 {
		t.Fatalf("fallback after empty: %v", res)
	}

	s = &Service{Providers: []Provider{fakeProvider{name: "a", err: errors.New("down")}, fakeProvider{name: "b"}}}
	if res, err := s.Search(ctx, q); err != nil || len(res) != 0 {
		t.Fatalf("one empty provider should not be an error: %v %v", res, err)
	}

	s = &Service{Providers: []Provider{fakeProvider{name: "a", err: errors.New("x")}, fakeProvider{name: "b", err: errors.New("y")}}}
	if _, err := s.Search(ctx, q); err == nil || !strings.Contains(err.Error(), "b: y") {
		t.Fatalf("expected joined error, got %v", err)
	}

	if res, err := s.Search(ctx, Query{}); err != nil || len(res) != 0 {
		t.Fatalf("empty query: %v %v", res, err)
	}
}

func TestBest(t *testing.T) {
	res := []Result{{Title: "Something Else"}, {Title: "被討厭的勇氣", Subtitle: "自我啟發之父"}}
	if r, ok := Best(res, "被討厭的勇氣：自我啟發之父「阿德勒」的教導"); !ok || r.Title != "被討厭的勇氣" {
		t.Fatalf("got %+v %v", r, ok)
	}
	if _, ok := Best(res, "三體"); ok {
		t.Fatal("expected no match")
	}
}
