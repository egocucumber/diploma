package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"
)

func generateSessionToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func getEnvOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func pythonServiceURL() string {
	if url := os.Getenv("PYTHON_SERVICE_URL"); url != "" {
		return url
	}
	return "http://localhost:8001"
}

var validBranchName = regexp.MustCompile(`^[a-zA-Z0-9/_\-\.]{1,100}$`)

var validRepoURL = regexp.MustCompile(
	`^https?://(github\.com|gitlab\.com|bitbucket\.org)/[\w\-\.]+/[\w\-\.]+(\.git)?(/.*)?$`,
)

func normalizeAndValidateURL(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", fmt.Errorf("URL is required")
	}
	if !strings.HasPrefix(raw, "http") {
		raw = "https://" + raw
	}
	raw = strings.TrimSuffix(raw, "/")
	if !validRepoURL.MatchString(raw) {
		return "", fmt.Errorf("только репозитории GitHub, GitLab и Bitbucket поддерживаются")
	}
	return raw, nil
}

var sensitivePatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)(password|passwd|secret|api_key|private_key)\s*[=:]\s*["']?[^\s"',;\n]{4,}["']?`),
	regexp.MustCompile(`(?i)(aws_access_key|aws_secret_access_key|database_url|db_password)\s*[=:]\s*["']?[^\s"',;\n]{4,}["']?`),
	regexp.MustCompile(`(?i)(bearer|authorization)\s*[=:]\s*["']?[A-Za-z0-9\-_\.]{20,}["']?`),
}

func sanitizeCode(code string) string {
	for _, pat := range sensitivePatterns {
		code = pat.ReplaceAllString(code, "[REDACTED]")
	}
	return code
}

var skipDirs = map[string]bool{
	"node_modules": true,
	"vendor":       true,
	".git":         true,
	"__pycache__":  true,
	"dist":         true,
	"build":        true,
	".next":        true,
	"target":       true,
	"out":          true,
	".idea":        true,
	".vscode":      true,
	"coverage":     true,
	".cache":       true,
	"migrations":   true,
	"test":         true,
	"tests":        true,
	"__tests__":    true,
}

const maxFileSize = 100 * 1024

var allowedExts = map[string]bool{
	".py": true, ".js": true, ".ts": true, ".go": true, ".java": true,
}

type CollectedFiles struct {
	Files   []string
	Skipped []SkippedFile
}

type SkippedFile struct {
	Path   string
	Reason string
}

func collectFiles(dir string) CollectedFiles {
	var result CollectedFiles
	filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() {
			if skipDirs[info.Name()] {
				return filepath.SkipDir
			}
			return nil
		}
		if !allowedExts[filepath.Ext(path)] {
			return nil
		}
		rel, _ := filepath.Rel(dir, path)
		if info.Size() > maxFileSize {
			result.Skipped = append(result.Skipped, SkippedFile{Path: rel, Reason: "too large (>" + fmt.Sprintf("%dKB", maxFileSize/1024) + ")"})
			return nil
		}
		result.Files = append(result.Files, path)
		return nil
	})
	return result
}

func writeSSE(w gin.ResponseWriter, event string, data interface{}) {
	jsonData, _ := json.Marshal(data)
	fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, jsonData)
	w.Flush()
}
