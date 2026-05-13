package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"time"

	"github.com/gin-gonic/gin"
)

func handleGitHubLogin(c *gin.Context) {
	clientID := os.Getenv("GITHUB_CLIENT_ID")
	if clientID == "" {
		c.JSON(500, gin.H{"error": "GitHub OAuth not configured"})
		return
	}
	redirectURI := getEnvOrDefault("FRONTEND_URL", "http://localhost:3000") + "/api/auth/github/callback"
	authURL := "https://github.com/login/oauth/authorize?client_id=" +
		url.QueryEscape(clientID) + "&redirect_uri=" + url.QueryEscape(redirectURI) + "&scope=repo,read:user"
	c.Redirect(http.StatusTemporaryRedirect, authURL)
}

func handleGitHubCallback(c *gin.Context) {
	code := c.Query("code")
	if code == "" {
		c.JSON(400, gin.H{"error": "Missing code"})
		return
	}
	clientID := os.Getenv("GITHUB_CLIENT_ID")
	clientSecret := os.Getenv("GITHUB_CLIENT_SECRET")
	frontendURL := getEnvOrDefault("FRONTEND_URL", "http://localhost:3000")

	body, _ := json.Marshal(map[string]string{
		"client_id":     clientID,
		"client_secret": clientSecret,
		"code":          code,
	})
	req, _ := http.NewRequest("POST", "https://github.com/login/oauth/access_token", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		c.Redirect(http.StatusTemporaryRedirect, frontendURL+"?auth_error=token_exchange_failed")
		return
	}
	defer resp.Body.Close()

	var tokenResp GitHubTokenResponse
	json.NewDecoder(resp.Body).Decode(&tokenResp)
	if tokenResp.AccessToken == "" {
		c.Redirect(http.StatusTemporaryRedirect, frontendURL+"?auth_error=no_token")
		return
	}

	userReq, _ := http.NewRequest("GET", "https://api.github.com/user", nil)
	userReq.Header.Set("Authorization", "Bearer "+tokenResp.AccessToken)
	userResp, err := client.Do(userReq)
	if err != nil {
		c.Redirect(http.StatusTemporaryRedirect, frontendURL+"?auth_error=user_fetch_failed")
		return
	}
	defer userResp.Body.Close()

	var ghUser GitHubUser
	json.NewDecoder(userResp.Body).Decode(&ghUser)

	encryptedToken, err := encryptToken(tokenResp.AccessToken)
	if err != nil {
		c.Redirect(http.StatusTemporaryRedirect, frontendURL+"?auth_error=encryption_failed")
		return
	}

	_, err = db.Exec(`
		INSERT INTO users (github_id, login, name, avatar_url, access_token, updated_at)
		VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
		ON CONFLICT(github_id) DO UPDATE SET
			login=EXCLUDED.login, name=EXCLUDED.name, avatar_url=EXCLUDED.avatar_url,
			access_token=EXCLUDED.access_token, updated_at=CURRENT_TIMESTAMP
	`, ghUser.ID, ghUser.Login, ghUser.Name, ghUser.AvatarURL, encryptedToken)
	if err != nil {
		c.Redirect(http.StatusTemporaryRedirect, frontendURL+"?auth_error=db_error")
		return
	}

	var userID int64
	db.QueryRow(`SELECT id FROM users WHERE github_id=$1`, ghUser.ID).Scan(&userID)

	sessionToken := generateSessionToken()
	expiresAt := time.Now().Add(14 * 24 * time.Hour)
	db.Exec(`INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)`,
		sessionToken, userID, expiresAt)
	db.Exec(`DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP`)

	secureCookie := os.Getenv("COOKIE_SECURE") != "false"
	c.SetCookie("session_token", sessionToken, 14*24*3600, "/", "", secureCookie, true)
	c.Redirect(http.StatusTemporaryRedirect, frontendURL)
}

func handleAuthMe(c *gin.Context) {
	sessionToken, err := c.Cookie("session_token")
	if err != nil || sessionToken == "" {
		c.JSON(401, gin.H{"error": "Not authenticated"})
		return
	}
	var user User
	err = db.QueryRow(`
		SELECT u.id, u.github_id, u.login, COALESCE(u.name,''), u.avatar_url, u.created_at
		FROM sessions s JOIN users u ON s.user_id = u.id
		WHERE s.token = $1 AND s.expires_at > CURRENT_TIMESTAMP
	`, sessionToken).Scan(&user.ID, &user.GitHubID, &user.Login, &user.Name, &user.AvatarURL, &user.CreatedAt)
	if err != nil {
		c.JSON(401, gin.H{"error": "Session expired"})
		return
	}
	c.JSON(200, user)
}

func handleLogout(c *gin.Context) {
	sessionToken, _ := c.Cookie("session_token")
	if sessionToken != "" {
		db.Exec(`DELETE FROM sessions WHERE token=$1`, sessionToken)
	}
	secureCookie := os.Getenv("COOKIE_SECURE") != "false"
	c.SetCookie("session_token", "", -1, "/", "", secureCookie, true)
	c.JSON(200, gin.H{"ok": true})
}
