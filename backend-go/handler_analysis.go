package main

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-git/go-git/v5"
	githttp "github.com/go-git/go-git/v5/plumbing/transport/http"
)

func callPythonML(filename string, code string) (*PythonResponse, error) {
	client := &http.Client{Timeout: 300 * time.Second}
	baseURL := pythonServiceURL()
	sanitized := sanitizeCode(code)

	detectData, _ := json.Marshal(DetectPayload{Filename: filename, Code: sanitized})
	detectResp, err := client.Post(baseURL+"/detect", "application/json", bytes.NewBuffer(detectData))
	if err != nil {
		return nil, err
	}
	defer detectResp.Body.Close()
	detectBody, _ := io.ReadAll(detectResp.Body)
	var detected DetectResponse
	if err := json.Unmarshal(detectBody, &detected); err != nil {
		return nil, err
	}

	if detected.Pattern == "Clean Code" {
		return &PythonResponse{
			Pattern:          detected.Pattern,
			Confidence:       1.0,
			RefactoredCode:   sanitized,
			Explanation:      detected.Explanation,
			Language:         detected.Language,
			ComplexityBefore: detected.ComplexityBefore,
			ComplexityAfter:  detected.ComplexityBefore,
		}, nil
	}

	refactorData, _ := json.Marshal(RefactorPayload{
		Language:          detected.Language,
		Pattern:           detected.Pattern,
		Fragment:          detected.Fragment,
		OriginalCode:      sanitized,
		FragmentOffset:    detected.FragmentOffset,
		FragmentLineCount: detected.FragmentLineCount,
	})
	refactorResp, err := client.Post(baseURL+"/refactor", "application/json", bytes.NewBuffer(refactorData))
	if err != nil {
		return nil, err
	}
	defer refactorResp.Body.Close()
	refactorBody, _ := io.ReadAll(refactorResp.Body)
	var refactored RefactorResponse
	if err := json.Unmarshal(refactorBody, &refactored); err != nil {
		return nil, err
	}

	return &PythonResponse{
		Pattern:          detected.Pattern,
		Confidence:       refactored.Confidence,
		RefactoredCode:   refactored.RefactoredCode,
		Explanation:      detected.Explanation,
		Language:         detected.Language,
		ComplexityBefore: detected.ComplexityBefore,
		ComplexityAfter:  refactored.ComplexityAfter,
	}, nil
}

func runAnalysis(c *gin.Context, dir string, repoURL string, repo *git.Repository) {
	userID, _ := c.Get("user_id")
	res, err := db.Exec(`INSERT INTO analyses (repo_url, user_id, status) VALUES (?, ?, 'running')`, repoURL, userID)
	if err != nil {
		writeSSE(c.Writer, "error", gin.H{"message": "Database error: " + err.Error()})
		return
	}
	analysisID, _ := res.LastInsertId()
	defer func() {
		db.Exec(`UPDATE analyses SET finished_at=CURRENT_TIMESTAMP, status='done' WHERE id=?`, analysisID)
	}()

	resultCount := 0

	if repo != nil {
		writeSSE(c.Writer, "status", gin.H{"message": "Extracting commit history..."})
		pairs, freqs, err := extractCommitHistory(repo, 50)
		if err == nil && len(pairs) > 0 {
			writeSSE(c.Writer, "commit_history", gin.H{"pairs": len(pairs), "hotFiles": freqs})
			for i, pair := range pairs {
				writeSSE(c.Writer, "progress", gin.H{
					"current":  i + 1,
					"total":    len(pairs),
					"file":     pair.FileName,
					"fileName": filepath.Base(pair.FileName),
				})
				pyResp, err := callPythonML(pair.FileName, pair.Before)
				if err != nil {
					continue
				}
				resultCount++
				linesOrig := strings.Count(pair.Before, "\n") + 1
				linesRef := strings.Count(pyResp.RefactoredCode, "\n") + 1
				result := FileResult{
					ID: resultCount, FileName: pair.FileName, Pattern: pyResp.Pattern,
					Confidence: pyResp.Confidence, OriginalCode: pair.Before,
					RefactoredCode: pyResp.RefactoredCode,
					Explanation:    pyResp.Explanation + "\n\nКоммит: " + pair.Message,
					Language: pyResp.Language, LinesOriginal: linesOrig, LinesRefactored: linesRef,
					ComplexityBefore: pyResp.ComplexityBefore, ComplexityAfter: pyResp.ComplexityAfter,
				}
				db.Exec(`INSERT INTO results (analysis_id,file_name,pattern,confidence,original_code,refactored_code,explanation,language,lines_original,lines_refactored,complexity_before,complexity_after) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
					analysisID, pair.FileName, pyResp.Pattern, pyResp.Confidence,
					pair.Before, pyResp.RefactoredCode, result.Explanation, pyResp.Language,
					linesOrig, linesRef, pyResp.ComplexityBefore, pyResp.ComplexityAfter)
				writeSSE(c.Writer, "result", result)
			}
		}
	}

	writeSSE(c.Writer, "status", gin.H{"message": "Scanning files..."})
	collected := collectFiles(dir)
	files := collected.Files

	langStats := map[string]int{}
	for _, f := range files {
		ext := strings.TrimPrefix(filepath.Ext(f), ".")
		langStats[ext]++
	}
	writeSSE(c.Writer, "total", gin.H{"count": len(files), "langStats": langStats})
	db.Exec(`UPDATE analyses SET total_files=? WHERE id=?`, len(files), analysisID)

	for i, filePath := range files {
		relPath, _ := filepath.Rel(dir, filePath)
		writeSSE(c.Writer, "progress", gin.H{
			"current": i + 1, "total": len(files),
			"file": relPath, "fileName": filepath.Base(relPath),
		})

		content, err := os.ReadFile(filePath)
		if err != nil {
			continue
		}

		pyResp, err := callPythonML(relPath, string(content))
		if err != nil {
			continue
		}

		resultCount++
		linesOrig := strings.Count(string(content), "\n") + 1
		linesRef := strings.Count(pyResp.RefactoredCode, "\n") + 1
		result := FileResult{
			ID: resultCount, FileName: relPath, Pattern: pyResp.Pattern,
			Confidence: pyResp.Confidence, OriginalCode: string(content),
			RefactoredCode: pyResp.RefactoredCode, Explanation: pyResp.Explanation,
			Language: pyResp.Language, LinesOriginal: linesOrig, LinesRefactored: linesRef,
			ComplexityBefore: pyResp.ComplexityBefore, ComplexityAfter: pyResp.ComplexityAfter,
		}
		db.Exec(`INSERT INTO results (analysis_id,file_name,pattern,confidence,original_code,refactored_code,explanation,language,lines_original,lines_refactored,complexity_before,complexity_after) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
			analysisID, relPath, pyResp.Pattern, pyResp.Confidence,
			string(content), pyResp.RefactoredCode, pyResp.Explanation, pyResp.Language,
			linesOrig, linesRef, pyResp.ComplexityBefore, pyResp.ComplexityAfter)
		writeSSE(c.Writer, "result", result)
	}

	db.Exec(`UPDATE analyses SET result_count=? WHERE id=?`, resultCount, analysisID)
	writeSSE(c.Writer, "done", gin.H{
		"total_results": resultCount,
		"analysis_id":   analysisID,
		"total_files": len(files),
	})
}

func handleAnalyzeStream(c *gin.Context) {
	repoUrl := c.Query("repoUrl")
	validURL, err := normalizeAndValidateURL(repoUrl)
	if err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	userID, _ := c.Get("user_id")
	var runningCount int
	db.QueryRow(`SELECT COUNT(*) FROM analyses WHERE user_id=? AND status='running'`, userID).Scan(&runningCount)
	if runningCount >= 2 {
		c.JSON(429, gin.H{"error": "У вас уже запущено 2 анализа. Дождитесь завершения перед запуском нового."})
		return
	}

	token, _ := c.Get("github_token")
	ghToken, _ := token.(string)

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	writeSSE(c.Writer, "status", gin.H{"message": "Cloning repository..."})

	tempDir, _ := os.MkdirTemp("", "repo-*")
	defer os.RemoveAll(tempDir)

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	cloneOpts := &git.CloneOptions{URL: validURL, Depth: 50}
	if ghToken != "" {
		cloneOpts.Auth = &githttp.BasicAuth{Username: "token", Password: ghToken}
	}
	clonedRepo, err := git.PlainCloneContext(ctx, tempDir, false, cloneOpts)
	if err != nil {
		msg := err.Error()
		if ctx.Err() != nil {
			msg = "Timeout: cloning took too long (>120s). Try a smaller repository."
		}
		writeSSE(c.Writer, "error", gin.H{"message": "Clone failed: " + msg})
		return
	}

	runAnalysis(c, tempDir, validURL, clonedRepo)
}

func handleUpload(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(400, gin.H{"error": "Файл не загружен"})
		return
	}
	if !strings.HasSuffix(strings.ToLower(file.Filename), ".zip") {
		c.JSON(400, gin.H{"error": "Поддерживаются только ZIP-архивы"})
		return
	}
	if file.Size > 50*1024*1024 {
		c.JSON(400, gin.H{"error": "Размер архива не должен превышать 50MB"})
		return
	}

	tmpZip, err := os.CreateTemp("", "upload-*.zip")
	if err != nil {
		c.JSON(500, gin.H{"error": "Server error"})
		return
	}
	defer os.Remove(tmpZip.Name())

	src, err := file.Open()
	if err != nil {
		c.JSON(500, gin.H{"error": "Server error"})
		return
	}
	defer src.Close()
	io.Copy(tmpZip, src)
	tmpZip.Close()

	extractDir, _ := os.MkdirTemp("", "extract-*")
	defer os.RemoveAll(extractDir)

	if err := extractZip(tmpZip.Name(), extractDir); err != nil {
		c.JSON(400, gin.H{"error": "Не удалось распаковать ZIP: " + err.Error()})
		return
	}

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")
	writeSSE(c.Writer, "status", gin.H{"message": "Processing uploaded archive..."})

	runAnalysis(c, extractDir, "upload:"+file.Filename, nil)
}

func extractZip(src, dest string) error {
	r, err := zip.OpenReader(src)
	if err != nil {
		return err
	}
	defer r.Close()

	destClean := filepath.Clean(dest)
	var totalSize int64

	for _, f := range r.File {
		target := filepath.Join(dest, filepath.Clean("/"+f.Name))
		if !strings.HasPrefix(filepath.Clean(target), destClean+string(os.PathSeparator)) {
			continue
		}
		if f.FileInfo().IsDir() {
			os.MkdirAll(target, 0755)
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			return err
		}
		out, err := os.Create(target)
		if err != nil {
			return err
		}
		rc, err := f.Open()
		if err != nil {
			out.Close()
			return err
		}
		n, _ := io.Copy(out, io.LimitReader(rc, 100*1024*1024-totalSize))
		totalSize += n
		rc.Close()
		out.Close()
		if totalSize >= 100*1024*1024 {
			break
		}
	}
	return nil
}
