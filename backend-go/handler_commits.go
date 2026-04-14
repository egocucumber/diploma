package main

import (
	"path/filepath"
	"sort"
	"strings"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing/object"
	"github.com/go-git/go-git/v5/plumbing/storer"
)

type CommitFilePair struct {
	FileName string
	Before   string
	After    string
	Message  string
}

type FileChangeFreq struct {
	Name    string
	Count   int
	Commits []string
}

func extractCommitHistory(repo *git.Repository, maxCommits int) ([]CommitFilePair, []FileChangeFreq, error) {
	ref, err := repo.Head()
	if err != nil {
		return nil, nil, err
	}

	iter, err := repo.Log(&git.LogOptions{From: ref.Hash()})
	if err != nil {
		return nil, nil, err
	}

	type commitEntry struct {
		commit *object.Commit
		tree   *object.Tree
	}

	var commits []commitEntry
	iter.ForEach(func(c *object.Commit) error {
		if len(commits) >= maxCommits {
			return storer.ErrStop
		}
		tree, err := c.Tree()
		if err != nil {
			return nil
		}
		commits = append(commits, commitEntry{c, tree})
		return nil
	})

	freqMap := map[string][]string{}
	var pairs []CommitFilePair

	for i := 0; i < len(commits)-1; i++ {
		curr := commits[i]
		prev := commits[i+1]

		changes, err := prev.tree.Diff(curr.tree)
		if err != nil {
			continue
		}

		for _, change := range changes {
			name := change.To.Name
			if name == "" {
				name = change.From.Name
			}
			ext := filepath.Ext(name)
			if !allowedExts[ext] {
				continue
			}
			if containsSkipDir(name) {
				continue
			}

			freqMap[name] = append(freqMap[name], curr.commit.Hash.String()[:8])

			if len(pairs) < 30 {
				fromFile, toFile, err := change.Files()
				if err == nil && fromFile != nil && toFile != nil {
					beforeContent, err1 := fromFile.Contents()
					afterContent, err2 := toFile.Contents()
					if err1 == nil && err2 == nil &&
						len(beforeContent) < maxFileSize &&
						len(afterContent) < maxFileSize &&
						beforeContent != afterContent {
						pairs = append(pairs, CommitFilePair{
							FileName: name,
							Before:   sanitizeCode(beforeContent),
							After:    sanitizeCode(afterContent),
							Message:  strings.TrimSpace(curr.commit.Message),
						})
					}
				}
			}
		}
	}

	var freqs []FileChangeFreq
	for name, commitHashes := range freqMap {
		freqs = append(freqs, FileChangeFreq{
			Name:    name,
			Count:   len(commitHashes),
			Commits: commitHashes,
		})
	}
	sort.Slice(freqs, func(i, j int) bool {
		return freqs[i].Count > freqs[j].Count
	})
	if len(freqs) > 20 {
		freqs = freqs[:20]
	}

	return pairs, freqs, nil
}

func containsSkipDir(path string) bool {
	parts := strings.Split(filepath.ToSlash(path), "/")
	for _, part := range parts {
		if skipDirs[part] {
			return true
		}
	}
	return false
}
