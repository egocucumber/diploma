package main

import (
	"fmt"
	"os"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	if err := initDB(); err != nil {
		fmt.Fprintf(os.Stderr, "DB init error: %v\n", err)
		os.Exit(1)
	}
	defer db.Close()

	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()
	frontendURL := getEnvOrDefault("FRONTEND_URL", "http://localhost:3000")
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{frontendURL},
		AllowMethods:     []string{"GET", "POST", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept"},
		ExposeHeaders:    []string{"Content-Disposition"},
		AllowCredentials: true,
	}))

	r.GET("/api/auth/github", handleGitHubLogin)
	r.GET("/api/auth/github/callback", handleGitHubCallback)
	r.GET("/api/auth/me", handleAuthMe)
	r.POST("/api/auth/logout", handleLogout)
	r.GET("/api/health", handleHealth)

	protected := r.Group("/api")
	protected.Use(authMiddleware())
	{
		analyze := protected.Group("/analyze")
		analyze.Use(rateLimitMiddleware())
		{
			analyze.GET("/stream", handleAnalyzeStream)
			analyze.POST("/upload", handleUpload)
		}

		protected.POST("/push", handlePush)
		protected.GET("/history", handleGetHistory)
		protected.GET("/history/:id/results", handleGetHistoryResults)
		protected.DELETE("/history/:id", handleDeleteHistory)
		protected.GET("/export/:id", handleExport)
	}

	fmt.Println("Go Backend started on :8080")
	r.Run(":8080")
}
