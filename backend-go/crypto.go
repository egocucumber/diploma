package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
)

func encryptionKey() []byte {
	raw := os.Getenv("TOKEN_ENCRYPTION_KEY")
	if raw == "" {
		fmt.Fprintln(os.Stderr, "WARNING: TOKEN_ENCRYPTION_KEY not set, using insecure dev key")
		raw = "dev-only-insecure-key-set-TOKEN_ENCRYPTION_KEY-in-prod"
	}
	h := sha256.Sum256([]byte(raw))
	return h[:]
}

func encryptToken(plaintext string) (string, error) {
	key := encryptionKey()
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return hex.EncodeToString(ciphertext), nil
}

func decryptToken(encoded string) (string, error) {
	key := encryptionKey()
	data, err := hex.DecodeString(encoded)
	if err != nil {
		return encoded, nil
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	if len(data) < gcm.NonceSize() {
		return encoded, nil
	}
	nonce, ciphertext := data[:gcm.NonceSize()], data[gcm.NonceSize():]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return encoded, nil
	}
	return string(plaintext), nil
}
