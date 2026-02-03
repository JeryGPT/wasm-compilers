FROM golang:1.23-alpine

WORKDIR /src

ENV GOOS=js
ENV GOARCH=wasm
ENV CGO_ENABLED=0
ENV GOCACHE=/tmp/go-cache

# Pre-warm the Go build cache with a simple program
RUN printf 'package main\nimport "fmt"\nfunc main() { fmt.Println("warmup") }' > /tmp/warmup.go && \
    go build -p 4 -o /tmp/warmup.wasm /tmp/warmup.go && \
    rm /tmp/warmup.*

CMD ["sh", "-c", "go build -p 4 -o output.wasm main.go && cp /usr/local/go/misc/wasm/wasm_exec.js wasm_exec.js"]
