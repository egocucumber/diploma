FROM golang:1.25-alpine AS builder

WORKDIR /app

# ca-certificates нужны для HTTPS клонирования репозиториев
RUN apk add --no-cache ca-certificates git

COPY go.mod go.sum ./
RUN go mod download

COPY *.go .
RUN CGO_ENABLED=0 GOOS=linux go build -o server .

# ---

FROM alpine:latest

RUN apk add --no-cache ca-certificates git

WORKDIR /app
COPY --from=builder /app/server .

EXPOSE 8080

CMD ["./server"]
