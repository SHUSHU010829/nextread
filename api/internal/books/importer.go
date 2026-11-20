package books

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// ImportItem 同時接受 artifact 書櫃的 camelCase 欄位（finishedAt、createdAt）
// 與本系統匯出的 snake_case 欄位（finished_at、created_at）。
type ImportItem struct {
	Title       string          `json:"title"`
	Author      string          `json:"author"`
	ISBN        string          `json:"isbn"`
	CoverURL    string          `json:"cover_url"`
	Description string          `json:"description"`
	Categories  []string        `json:"categories"`
	Status      string          `json:"status"`
	Rating      json.RawMessage `json:"rating"`
	Note        string          `json:"note"`

	FinishedAtCamel string `json:"finishedAt"`
	FinishedAtSnake string `json:"finished_at"`
	CreatedAtCamel  string `json:"createdAt"`
	CreatedAtSnake  string `json:"created_at"`
}

// ParseImport 接受 JSON 陣列，或 {"books": [...]} 形式的物件。
func ParseImport(data []byte) ([]ImportItem, error) {
	data = bytes.TrimSpace(data)
	if len(data) == 0 {
		return nil, invalid("匯入內容是空的")
	}
	var items []ImportItem
	if data[0] == '[' {
		if err := json.Unmarshal(data, &items); err != nil {
			return nil, invalid("JSON 格式錯誤：%v", err)
		}
		return items, nil
	}
	var wrapped struct {
		Books []ImportItem `json:"books"`
	}
	if err := json.Unmarshal(data, &wrapped); err != nil {
		return nil, invalid("JSON 格式錯誤：%v", err)
	}
	if wrapped.Books == nil {
		return nil, invalid("找不到書籍資料：需要 JSON 陣列或 {\"books\": [...]}")
	}
	return wrapped.Books, nil
}

func parseRating(raw json.RawMessage) (*int, error) {
	s := strings.TrimSpace(string(raw))
	switch s {
	case "", "null", `""`:
		return nil, nil
	case "1", `"1"`:
		v := 1
		return &v, nil
	case "0", `"0"`:
		v := 0
		return &v, nil
	case "-1", `"-1"`:
		v := -1
		return &v, nil
	}
	return nil, fmt.Errorf("評價必須是 1、0、-1 或 null，收到 %s", s)
}

// Row 把匯入項目轉成可寫入的欄位；有 createdAt 時保留原本的建立時間。
func (it ImportItem) Row() (map[string]any, error) {
	rating, err := parseRating(it.Rating)
	if err != nil {
		return nil, invalid("%v", err)
	}
	finished := it.FinishedAtSnake
	if finished == "" {
		finished = it.FinishedAtCamel
	}
	// artifact 的 finishedAt 可能是 ISO 時間字串，只取日期部分
	if len(finished) > 10 {
		finished = finished[:10]
	}
	status := Status(it.Status)
	if status == "" {
		status = StatusRead
	}
	row, err := Input{
		Title:       it.Title,
		Author:      it.Author,
		ISBN:        it.ISBN,
		CoverURL:    it.CoverURL,
		Description: it.Description,
		Categories:  it.Categories,
		Status:      status,
		Rating:      rating,
		FinishedAt:  finished,
		Note:        it.Note,
	}.Row()
	if err != nil {
		return nil, err
	}
	created := it.CreatedAtSnake
	if created == "" {
		created = it.CreatedAtCamel
	}
	if created != "" {
		if _, err := time.Parse(time.RFC3339, created); err == nil {
			row["created_at"] = created
		}
	}
	return row, nil
}

// ImportError 記錄單筆匯入失敗的原因。
type ImportError struct {
	Index int    `json:"index"`
	Title string `json:"title"`
	Error string `json:"error"`
}

// ImportPlan 是比對現有書櫃後的匯入計畫。
type ImportPlan struct {
	Rows    []map[string]any
	Skipped []string
	Errors  []ImportError
}

// PlanImport 驗證每一筆資料，並以書名＋作者略過已存在或重複的書。
func PlanImport(items []ImportItem, existing []Book) ImportPlan {
	seen := map[string]bool{}
	for _, b := range existing {
		seen[DedupKey(b.Title, b.Author)] = true
	}
	plan := ImportPlan{Rows: []map[string]any{}, Skipped: []string{}, Errors: []ImportError{}}
	for i, it := range items {
		row, err := it.Row()
		if err != nil {
			plan.Errors = append(plan.Errors, ImportError{Index: i, Title: it.Title, Error: err.Error()})
			continue
		}
		key := DedupKey(it.Title, it.Author)
		if seen[key] {
			plan.Skipped = append(plan.Skipped, strings.TrimSpace(it.Title))
			continue
		}
		seen[key] = true
		plan.Rows = append(plan.Rows, row)
	}
	return plan
}
