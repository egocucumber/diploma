package main

import (
	"database/sql"
	"os"

	_ "github.com/lib/pq"
)

var db *sql.DB

func initDB() error {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://postgres:postgres@localhost:5432/postgres?sslmode=disable"
	}
	var err error
	db, err = sql.Open("postgres", dsn)
	if err != nil {
		return err
	}
	if err = db.Ping(); err != nil {
		return err
	}

	stmts := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id           SERIAL PRIMARY KEY,
			github_id    BIGINT UNIQUE NOT NULL,
			login        TEXT NOT NULL,
			name         TEXT DEFAULT '',
			avatar_url   TEXT DEFAULT '',
			access_token TEXT NOT NULL DEFAULT '',
			created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
			updated_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS sessions (
			token      TEXT PRIMARY KEY,
			user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			expires_at TIMESTAMPTZ NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS analyses (
			id           SERIAL PRIMARY KEY,
			repo_url     TEXT    NOT NULL,
			user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
			started_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
			finished_at  TIMESTAMPTZ,
			total_files  INTEGER DEFAULT 0,
			result_count INTEGER DEFAULT 0,
			status       TEXT    DEFAULT 'running'
		)`,
		`CREATE TABLE IF NOT EXISTS results (
			id                SERIAL PRIMARY KEY,
			analysis_id       INTEGER NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
			file_name         TEXT    NOT NULL,
			pattern           TEXT    NOT NULL,
			confidence        REAL    NOT NULL,
			original_code     TEXT    NOT NULL,
			refactored_code   TEXT    NOT NULL,
			explanation       TEXT    DEFAULT '',
			language          TEXT    DEFAULT '',
			lines_original    INTEGER DEFAULT 0,
			lines_refactored  INTEGER DEFAULT 0,
			complexity_before INTEGER DEFAULT 0,
			complexity_after  INTEGER DEFAULT 0
		)`,
	}
	for _, s := range stmts {
		if _, err := db.Exec(s); err != nil {
			return err
		}
	}
	return nil
}
