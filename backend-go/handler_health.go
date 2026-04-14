package main

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

func handleHealth(c *gin.Context) {
	mlURL := pythonServiceURL() + "/health"
	mlStatus := "unreachable"
	client := &http.Client{Timeout: 3 * time.Second}
	if resp, err := client.Get(mlURL); err == nil {
		resp.Body.Close()
		mlStatus = "ok"
	}
	c.JSON(200, gin.H{
		"go_backend": "ok",
		"ml_service": mlStatus,
		"db":         "ok",
	})
}
