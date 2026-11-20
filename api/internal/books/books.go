// Package books 定義書籍資料模型、輸入驗證，以及 artifact 書櫃資料的匯入對應。
package books

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode"
)

type Status string

const (
	StatusWant    Status = "want"
	StatusReading Status = "reading"
	StatusRead    Status = "read"
)

func (s Status) Valid() bool {
	return s == StatusWant || s == StatusReading || s == StatusRead
}

// Book 是 books 表的一列。
type Book struct {
	ID          string   `json:"id"`
	UserID      string   `json:"user_id"`
	Title       string   `json:"title"`
	Author      string   `json:"author"`
	ISBN        *string  `json:"isbn"`
	CoverURL    string   `json:"cover_url"`
	Description string   `json:"description"`
	Categories  []string `json:"categories"`
	Status      Status   `json:"status"`
	Rating      *int     `json:"rating"`
	FinishedAt  *string  `json:"finished_at"`
	Note        string   `json:"note"`
	CreatedAt   string   `json:"created_at"`
	UpdatedAt   string   `json:"updated_at"`
}

// Input 是新增或整筆更新書籍時，使用者可以編輯的欄位。
type Input struct {
	Title       string   `json:"title"`
	Author      string   `json:"author"`
	ISBN        string   `json:"isbn"`
	CoverURL    string   `json:"cover_url"`
	Description string   `json:"description"`
	Categories  []string `json:"categories"`
	Status      Status   `json:"status"`
	Rating      *int     `json:"rating"`
	FinishedAt  string   `json:"finished_at"`
	Note        string   `json:"note"`
}

// ValidationError 代表輸入有誤，HTTP 層會回 400。
type ValidationError struct{ Msg string }

func (e *ValidationError) Error() string { return e.Msg }

func invalid(format string, a ...any) error {
	return &ValidationError{Msg: fmt.Sprintf(format, a...)}
}

// IsValidation 判斷錯誤是否為輸入驗證錯誤。
func IsValidation(err error) bool {
	var v *ValidationError
	return errors.As(err, &v)
}

var dateRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

// NormalizeISBN 去掉連字號與空白；不是合法的 ISBN-10 / ISBN-13 格式時回傳空字串。
func NormalizeISBN(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch {
		case r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == 'x' || r == 'X':
			b.WriteRune('X')
		case r == '-' || unicode.IsSpace(r):
		default:
			return ""
		}
	}
	out := b.String()
	switch len(out) {
	case 13:
		if strings.ContainsRune(out, 'X') {
			return ""
		}
		return out
	case 10:
		if i := strings.IndexRune(out, 'X'); i >= 0 && i != 9 {
			return ""
		}
		return out
	}
	return ""
}

// Row 驗證並正規化輸入，回傳可以直接寫入 PostgREST 的欄位。
func (in Input) Row() (map[string]any, error) {
	title := strings.TrimSpace(in.Title)
	if title == "" {
		return nil, invalid("書名必填")
	}
	status := in.Status
	if status == "" {
		status = StatusWant
	}
	if !status.Valid() {
		return nil, invalid("狀態必須是 want、reading 或 read")
	}
	if in.Rating != nil && (*in.Rating < -1 || *in.Rating > 1) {
		return nil, invalid("評價必須是 1、0、-1 或 null")
	}

	var isbn any
	if raw := strings.TrimSpace(in.ISBN); raw != "" {
		n := NormalizeISBN(raw)
		if n == "" {
			return nil, invalid("ISBN 格式不正確：%s", raw)
		}
		isbn = n
	}

	var finished any
	if d := strings.TrimSpace(in.FinishedAt); d != "" {
		if !dateRe.MatchString(d) {
			return nil, invalid("讀完日期格式需為 YYYY-MM-DD")
		}
		if _, err := time.Parse("2006-01-02", d); err != nil {
			return nil, invalid("讀完日期不正確：%s", d)
		}
		finished = d
	}

	var rating any
	if in.Rating != nil {
		rating = *in.Rating
	}

	return map[string]any{
		"title":       title,
		"author":      strings.TrimSpace(in.Author),
		"isbn":        isbn,
		"cover_url":   strings.TrimSpace(in.CoverURL),
		"description": strings.TrimSpace(in.Description),
		"categories":  CleanCategories(in.Categories),
		"status":      status,
		"rating":      rating,
		"finished_at": finished,
		"note":        strings.TrimSpace(in.Note),
	}, nil
}

// CleanCategories 去除空白、空字串與重複的分類，保留原本順序。
func CleanCategories(in []string) []string {
	out := make([]string, 0, len(in))
	seen := map[string]bool{}
	for _, c := range in {
		c = strings.TrimSpace(c)
		k := strings.ToLower(c)
		if c == "" || seen[k] {
			continue
		}
		seen[k] = true
		out = append(out, c)
	}
	return out
}

// NormalizeTitle 把書名轉成比對用的形式：小寫、只留字母與數字。
func NormalizeTitle(s string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(s) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// DedupKey 用書名＋作者判斷是不是同一本書。
func DedupKey(title, author string) string {
	return NormalizeTitle(title) + "|" + NormalizeTitle(author)
}
