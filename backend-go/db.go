package main

import (
	"database/sql"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

var db *sql.DB

func initDB() error {
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "./history.db"
	}
	if dir := filepath.Dir(dbPath); dir != "." {
		os.MkdirAll(dir, 0755)
	}
	var err error
	db, err = sql.Open("sqlite", dbPath)
	if err != nil {
		return err
	}
	db.SetMaxOpenConns(1)
	migrations := []string{
		`ALTER TABLE analyses ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL`,
		`ALTER TABLE users ADD COLUMN access_token TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE users ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
	}
	for _, m := range migrations {
		db.Exec(m)
	}

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS users (
			id           INTEGER PRIMARY KEY AUTOINCREMENT,
			github_id    INTEGER UNIQUE NOT NULL,
			login        TEXT NOT NULL,
			name         TEXT DEFAULT '',
			avatar_url   TEXT DEFAULT '',
			access_token TEXT NOT NULL,
			created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE TABLE IF NOT EXISTS sessions (
			token      TEXT PRIMARY KEY,
			user_id    INTEGER NOT NULL,
			expires_at DATETIME NOT NULL,
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
		);
		CREATE TABLE IF NOT EXISTS analyses (
			id           INTEGER PRIMARY KEY AUTOINCREMENT,
			repo_url     TEXT    NOT NULL,
			user_id      INTEGER,
			started_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
			finished_at  DATETIME,
			total_files  INTEGER DEFAULT 0,
			result_count INTEGER DEFAULT 0,
			status       TEXT    DEFAULT 'running',
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
		);
		CREATE TABLE IF NOT EXISTS results (
			id                INTEGER PRIMARY KEY AUTOINCREMENT,
			analysis_id       INTEGER NOT NULL,
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
			complexity_after  INTEGER DEFAULT 0,
			FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE
		);
	`)
	return err
}
