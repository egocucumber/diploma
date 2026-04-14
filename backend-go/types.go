package main

type FileResult struct {
	ID              int     `json:"id"`
	FileName        string  `json:"fileName"`
	Pattern         string  `json:"pattern"`
	Confidence      float64 `json:"confidence"`
	OriginalCode    string  `json:"originalCode"`
	RefactoredCode  string  `json:"refactoredCode"`
	Explanation     string  `json:"explanation"`
	Language        string  `json:"language"`
	LinesOriginal   int     `json:"linesOriginal"`
	LinesRefactored int     `json:"linesRefactored"`
	ComplexityBefore int    `json:"complexityBefore"`
	ComplexityAfter  int    `json:"complexityAfter"`
}

type PythonPayload struct {
	Filename string `json:"filename"`
	Code     string `json:"code"`
}

type PythonResponse struct {
	Pattern          string  `json:"pattern"`
	Confidence       float64 `json:"confidence"`
	RefactoredCode   string  `json:"refactored_code"`
	Explanation      string  `json:"explanation"`
	Language         string  `json:"language"`
	ComplexityBefore int     `json:"complexity_before"`
	ComplexityAfter  int     `json:"complexity_after"`
}

type DetectPayload struct {
	Filename string `json:"filename"`
	Code     string `json:"code"`
}

type DetectResponse struct {
	Pattern           string `json:"pattern"`
	Explanation       string `json:"explanation"`
	Language          string `json:"language"`
	Fragment          string `json:"fragment"`
	FragmentOffset    int    `json:"fragment_offset"`
	FragmentLineCount int    `json:"fragment_line_count"`
	ComplexityBefore  int    `json:"complexity_before"`
}

type RefactorPayload struct {
	Language          string `json:"language"`
	Pattern           string `json:"pattern"`
	Fragment          string `json:"fragment"`
	OriginalCode      string `json:"original_code"`
	FragmentOffset    int    `json:"fragment_offset"`
	FragmentLineCount int    `json:"fragment_line_count"`
}

type RefactorResponse struct {
	RefactoredCode string  `json:"refactored_code"`
	Confidence     float64 `json:"confidence"`
	ComplexityAfter int    `json:"complexity_after"`
}

type AnalysisRecord struct {
	ID          int64  `json:"id"`
	RepoURL     string `json:"repoUrl"`
	StartedAt   string `json:"startedAt"`
	FinishedAt  string `json:"finishedAt,omitempty"`
	TotalFiles  int    `json:"totalFiles"`
	ResultCount int    `json:"resultCount"`
	Status      string `json:"status"`
}

type GitHubUser struct {
	ID        int    `json:"id"`
	Login     string `json:"login"`
	Name      string `json:"name"`
	AvatarURL string `json:"avatar_url"`
}

type GitHubTokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	Scope       string `json:"scope"`
}

type User struct {
	ID        int64  `json:"id"`
	GitHubID  int    `json:"github_id"`
	Login     string `json:"login"`
	Name      string `json:"name"`
	AvatarURL string `json:"avatar_url"`
	CreatedAt string `json:"created_at"`
}
