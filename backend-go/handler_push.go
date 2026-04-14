package main

import (
	"context"
	"os"
	"path/filepath"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
	githttp "github.com/go-git/go-git/v5/plumbing/transport/http"
)

func handlePush(c *gin.Context) {
	var req struct {
		AnalysisID int64  `json:"analysisId"`
		RepoURL    string `json:"repoUrl"`
		Branch     string `json:"branch"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	validURL, err := normalizeAndValidateURL(req.RepoURL)
	if err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	tokenVal, _ := c.Get("github_token")
	ghToken, _ := tokenVal.(string)
	if ghToken == "" {
		c.JSON(401, gin.H{"error": "Нет токена авторизации"})
		return
	}

	branch := req.Branch
	if branch == "" {
		branch = "refactor/ml-suggestions"
	}
	protectedBranches := map[string]bool{
		"main": true, "master": true, "develop": true, "dev": true,
		"production": true, "prod": true, "release": true,
	}
	if protectedBranches[branch] {
		c.JSON(400, gin.H{"error": "Запись в защищённую ветку (" + branch + ") запрещена. Используйте feature-ветку."})
		return
	}
	if !validBranchName.MatchString(branch) {
		c.JSON(400, gin.H{"error": "Недопустимое имя ветки"})
		return
	}

	rows, err := db.Query(`SELECT file_name, refactored_code FROM results WHERE analysis_id=?`, req.AnalysisID)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	type fc struct{ name, code string }
	var changes []fc
	for rows.Next() {
		var f fc
		rows.Scan(&f.name, &f.code)
		changes = append(changes, f)
	}
	rows.Close()

	if len(changes) == 0 {
		c.JSON(400, gin.H{"error": "Нет результатов для отправки"})
		return
	}

	tempDir, _ := os.MkdirTemp("", "push-*")
	defer os.RemoveAll(tempDir)

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	auth := &githttp.BasicAuth{Username: "token", Password: ghToken}
	repo, err := git.PlainCloneContext(ctx, tempDir, false, &git.CloneOptions{
		URL: validURL, Depth: 1, Auth: auth,
	})
	if err != nil {
		c.JSON(500, gin.H{"error": "Клонирование не удалось: " + err.Error()})
		return
	}

	wt, err := repo.Worktree()
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	if err := wt.Checkout(&git.CheckoutOptions{
		Branch: plumbing.NewBranchReferenceName(branch),
		Create: true,
	}); err != nil {
		c.JSON(500, gin.H{"error": "Создание ветки не удалось: " + err.Error()})
		return
	}

	for _, f := range changes {
		cleanPath := filepath.ToSlash(filepath.Clean(f.name))
		target := filepath.Join(tempDir, cleanPath)
		os.MkdirAll(filepath.Dir(target), 0755)
		if err := os.WriteFile(target, []byte(f.code), 0644); err != nil {
			continue
		}
		wt.Add(cleanPath)
	}

	if _, err := wt.Commit("refactor: применить рефакторинг на основе ML-анализа", &git.CommitOptions{
		Author: &object.Signature{
			Name:  "ML Refactor Bot",
			Email: "ml-refactor@noreply.local",
			When:  time.Now(),
		},
	}); err != nil {
		c.JSON(500, gin.H{"error": "Коммит не удался: " + err.Error()})
		return
	}

	if err := repo.PushContext(ctx, &git.PushOptions{Auth: auth}); err != nil {
		c.JSON(500, gin.H{"error": "Push не удался: " + err.Error()})
		return
	}

	c.JSON(200, gin.H{"ok": true, "branch": branch})
}
