package books

import (
	"testing"
)

func intp(v int) *int { return &v }

func TestNormalizeISBN(t *testing.T) {
	cases := map[string]string{
		"978-986-479-290-1": "9789864792901",
		"986 479 290 x":     "986479290X",
		"986479290X":        "986479290X",
		"98647X2901":        "",
		"12345":             "",
		"978986479290Y":     "",
		"978986479290X":     "",
	}
	for in, want := range cases {
		if got := NormalizeISBN(in); got != want {
			t.Errorf("NormalizeISBN(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestInputRow(t *testing.T) {
	row, err := Input{
		Title:      "  被討厭的勇氣 ",
		Author:     "岸見一郎",
		ISBN:       "978-986-134-233-8",
		Categories: []string{"心理學", " ", "心理學", "哲學"},
		Status:     StatusRead,
		Rating:     intp(1),
		FinishedAt: "2026-10-01",
	}.Row()
	if err != nil {
		t.Fatal(err)
	}
	if row["title"] != "被討厭的勇氣" || row["isbn"] != "9789861342338" || row["rating"] != 1 {
		t.Fatalf("unexpected row: %#v", row)
	}
	if cats := row["categories"].([]string); len(cats) != 2 {
		t.Fatalf("categories not deduped: %v", cats)
	}

	empty, err := Input{Title: "x"}.Row()
	if err != nil {
		t.Fatal(err)
	}
	if empty["status"] != StatusWant || empty["isbn"] != nil || empty["rating"] != nil || empty["finished_at"] != nil {
		t.Fatalf("unexpected defaults: %#v", empty)
	}
}

func TestInputRowValidation(t *testing.T) {
	bad := []Input{
		{Title: "  "},
		{Title: "x", Status: "done"},
		{Title: "x", Rating: intp(2)},
		{Title: "x", ISBN: "abc"},
		{Title: "x", FinishedAt: "2026/10/01"},
		{Title: "x", FinishedAt: "2026-13-01"},
	}
	for _, in := range bad {
		if _, err := in.Row(); !IsValidation(err) {
			t.Errorf("%+v: expected validation error, got %v", in, err)
		}
	}
}

func TestParseImportArtifactShape(t *testing.T) {
	data := []byte(`[
	  {"id":"a1","title":"挪威的森林","author":"村上春樹","status":"read","rating":1,"finishedAt":"2026-09-01","note":"很喜歡","createdAt":"2026-09-02T10:00:00.000Z","updatedAt":"2026-09-02T10:00:00.000Z"},
	  {"id":"a2","title":"人類大歷史","author":"哈拉瑞","status":"want","rating":null,"finishedAt":"","note":""},
	  {"id":"a3","title":"挪威的森林","author":"村上 春樹","status":"read","rating":0},
	  {"id":"a4","title":"","rating":1},
	  {"id":"a5","title":"三體","author":"劉慈欣","status":"read","rating":5}
	]`)
	items, err := ParseImport(data)
	if err != nil {
		t.Fatal(err)
	}
	existing := []Book{{Title: "人類大歷史", Author: "哈拉瑞"}}
	plan := PlanImport(items, existing)

	if len(plan.Rows) != 1 {
		t.Fatalf("rows = %d, want 1: %#v", len(plan.Rows), plan.Rows)
	}
	r := plan.Rows[0]
	if r["title"] != "挪威的森林" || r["rating"] != 1 || r["finished_at"] != "2026-09-01" || r["note"] != "很喜歡" {
		t.Fatalf("unexpected row: %#v", r)
	}
	if r["created_at"] != "2026-09-02T10:00:00.000Z" {
		t.Fatalf("created_at not preserved: %#v", r["created_at"])
	}
	if len(plan.Skipped) != 2 {
		t.Fatalf("skipped = %v, want 2 (existing + duplicate)", plan.Skipped)
	}
	if len(plan.Errors) != 2 || plan.Errors[0].Index != 3 || plan.Errors[1].Index != 4 {
		t.Fatalf("errors = %#v", plan.Errors)
	}
}

func TestParseImportWrapped(t *testing.T) {
	items, err := ParseImport([]byte(`{"books":[{"title":"x","finished_at":"2026-01-02","rating":"-1"}]}`))
	if err != nil {
		t.Fatal(err)
	}
	row, err := items[0].Row()
	if err != nil {
		t.Fatal(err)
	}
	if row["rating"] != -1 || row["finished_at"] != "2026-01-02" || row["status"] != StatusRead {
		t.Fatalf("unexpected row: %#v", row)
	}
	if _, err := ParseImport([]byte(`{"foo":1}`)); !IsValidation(err) {
		t.Fatalf("expected validation error, got %v", err)
	}
	if _, err := ParseImport([]byte(`  `)); !IsValidation(err) {
		t.Fatalf("expected validation error, got %v", err)
	}
}
