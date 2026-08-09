FROM golang:1.23-alpine AS builder

WORKDIR /workspace

COPY src/margin/go.mod src/margin/go.sum ./src/margin/
COPY src/lib/bus/go/go.mod src/lib/bus/go/go.sum ./src/lib/bus/go/
COPY src/lib/proto/gen/go/go.mod src/lib/proto/gen/go/go.sum ./src/lib/proto/gen/go/
RUN cd src/margin && go mod download

COPY src/margin ./src/margin
COPY src/lib/bus/go ./src/lib/bus/go
COPY src/lib/proto/gen/go ./src/lib/proto/gen/go
RUN cd src/margin \
    && CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/margin ./cmd/server

FROM gcr.io/distroless/static-debian12:nonroot

COPY --from=builder /out/margin /margin

EXPOSE 50053 8080
ENTRYPOINT ["/margin"]
