package main

import (
	"log"

	"github.com/gin-gonic/gin"
)

func rateLimitMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		if !limiter.allow(ip) {
			if c.GetHeader("Accept") == "text/event-stream" {
				c.Header("Content-Type", "text/event-stream")
				writeSSE(c.Writer, "error", gin.H{"message": "Слишком много запросов. Подождите минуту и попробуйте снова."})
			} else {
				c.JSON(429, gin.H{"error": "Слишком много запросов. Подождите минуту и попробуйте снова."})
			}
			c.Abort()
			return
		}
		c.Next()
	}
}

func authMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		sessionToken, err := c.Cookie("session_token")
		if err != nil || sessionToken == "" {
			c.JSON(401, gin.H{"error": "Authentication required"})
			c.Abort()
			return
		}
		var userID int64
		var encryptedToken string
		err = db.QueryRow(`
			SELECT u.id, u.access_token FROM sessions s
			JOIN users u ON s.user_id = u.id
			WHERE s.token = $1 AND s.expires_at > CURRENT_TIMESTAMP
		`, sessionToken).Scan(&userID, &encryptedToken)
		if err != nil {
			c.JSON(401, gin.H{"error": "Session expired"})
			c.Abort()
			return
		}
		ghToken, err := decryptToken(encryptedToken)
		if err != nil {
			log.Printf("authMiddleware decryptToken error: %v (token prefix: %.20s)", err, encryptedToken)
			c.JSON(500, gin.H{"error": "Token decryption failed"})
			c.Abort()
			return
		}
		c.Set("user_id", userID)
		c.Set("github_token", ghToken)
		c.Next()
	}
}
