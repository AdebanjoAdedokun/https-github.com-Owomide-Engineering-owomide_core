module github.com/owomide/bus-interop-test

go 1.23.1

require github.com/owomide/bus v0.0.0

require (
	github.com/klauspost/compress v1.17.11 // indirect
	github.com/owomide/proto v0.0.0 // indirect
	github.com/pierrec/lz4/v4 v4.1.22 // indirect
	github.com/twmb/franz-go v1.18.1 // indirect
	github.com/twmb/franz-go/pkg/kmsg v1.9.0 // indirect
	google.golang.org/protobuf v1.36.11 // indirect
)

replace (
	github.com/owomide/bus => ../go
	github.com/owomide/proto => ../../proto/gen/go
)
