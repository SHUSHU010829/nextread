//go:build live

package lookup

import (
	"context"
	"testing"
)

func TestLive(t *testing.T) {
	for _, p := range []Provider{NewGoogleBooks(""), NewOpenLibrary()} {
		for _, q := range []Query{ParseQuery("9789861342338"), {Title: "被討厭的勇氣"}, {Title: "Dune", Author: "Herbert"}} {
			res, err := p.Search(context.Background(), q)
			if err != nil {
				t.Logf("%s %+v: err %v", p.Name(), q, err)
				continue
			}
			t.Logf("%s %+v: %d results", p.Name(), q, len(res))
			if len(res) > 0 {
				r := res[0]
				d := []rune(r.Description)
				if len(d) > 40 {
					d = d[:40]
				}
				t.Logf("  -> %s / %v / isbn=%s cover=%v cats=%v desc=%q", r.Title, r.Authors, r.ISBN, r.CoverURL != "", r.Categories, string(d))
			}
		}
	}
}
