package main

import (
	"archive/zip"
	"fmt"
	"log"

	"github.com/gin-gonic/gin"
)

func handleGetHistory(c *gin.Context) {
	userID, _ := c.Get("user_id")
	rows, err := db.Query(`
		SELECT id, repo_url, started_at, COALESCE(finished_at,''), total_files, result_count, status
		FROM analyses WHERE user_id=? ORDER BY started_at DESC LIMIT 50
	`, userID)
	if err != nil {
		log.Printf("handleGetHistory query error: %v (user_id=%v)", err, userID)
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var analyses []AnalysisRecord
	for rows.Next() {
		var a AnalysisRecord
		rows.Scan(&a.ID, &a.RepoURL, &a.StartedAt, &a.FinishedAt, &a.TotalFiles, &a.ResultCount, &a.Status)
		analyses = append(analyses, a)
	}
	if analyses == nil {
		analyses = []AnalysisRecord{}
	}
	c.JSON(200, analyses)
}

func handleGetHistoryResults(c *gin.Context) {
	id := c.Param("id")
	userID, _ := c.Get("user_id")
	var ownerID int64
	if err := db.QueryRow(`SELECT COALESCE(user_id,0) FROM analyses WHERE id=?`, id).Scan(&ownerID); err != nil || ownerID != userID {
		c.JSON(403, gin.H{"error": "Доступ запрещён"})
		return
	}
	rows, err := db.Query(`
		SELECT id, file_name, pattern, confidence, original_code, refactored_code,
		       explanation, language, lines_original, lines_refactored, complexity_before, complexity_after
		FROM results WHERE analysis_id=? ORDER BY id
	`, id)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var results []FileResult
	for rows.Next() {
		var r FileResult
		rows.Scan(&r.ID, &r.FileName, &r.Pattern, &r.Confidence,
			&r.OriginalCode, &r.RefactoredCode, &r.Explanation, &r.Language,
			&r.LinesOriginal, &r.LinesRefactored, &r.ComplexityBefore, &r.ComplexityAfter)
		results = append(results, r)
	}
	if results == nil {
		results = []FileResult{}
	}
	c.JSON(200, results)
}

func handleDeleteHistory(c *gin.Context) {
	id := c.Param("id")
	userID, _ := c.Get("user_id")
	var ownerID int64
	if err := db.QueryRow(`SELECT COALESCE(user_id,0) FROM analyses WHERE id=?`, id).Scan(&ownerID); err != nil || ownerID != userID {
		c.JSON(403, gin.H{"error": "Доступ запрещён"})
		return
	}
	db.Exec(`DELETE FROM analyses WHERE id=?`, id)
	db.Exec(`DELETE FROM results WHERE analysis_id=?`, id)
	c.JSON(200, gin.H{"ok": true})
}

func handleExport(c *gin.Context) {
	id := c.Param("id")
	userID, _ := c.Get("user_id")
	var ownerID int64
	var repoURL string
	if err := db.QueryRow(`SELECT COALESCE(user_id,0), repo_url FROM analyses WHERE id=?`, id).Scan(&ownerID, &repoURL); err != nil || ownerID != userID {
		c.JSON(403, gin.H{"error": "Доступ запрещён"})
		return
	}

	rows, err := db.Query(`SELECT file_name, refactored_code FROM results WHERE analysis_id=?`, id)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	c.Header("Content-Type", "application/zip")
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="refactored_%s.zip"`, id))

	zw := zip.NewWriter(c.Writer)
	for rows.Next() {
		var fileName, refactoredCode string
		rows.Scan(&fileName, &refactoredCode)
		w, err := zw.Create(fileName)
		if err != nil {
			continue
		}
		w.Write([]byte(refactoredCode))
	}
	zw.Close()
}
