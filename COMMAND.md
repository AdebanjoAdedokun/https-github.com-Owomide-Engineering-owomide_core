# Commands

## Go module tidy

Run tidy in each Go module:

```sh
cd src/lib/bus/go
go mod tidy
```

```sh
cd src/lib/bus/tests
go mod tidy
```

```sh
cd src/lib/proto/gen/go
go mod tidy
```

## Gazelle

Run Gazelle from the workspace root:

```sh
bazel run //:gazelle
```

The root `//:gazelle` target is configured for Gazelle's default languages, which cover Go and proto, plus the Python Gazelle plugin. It excludes Bazel output directories, `node_modules`, and `src/lib/proto/gen`.

Current JS/TS status: `bazel run //:gazelle` runs successfully, but JS/TS target generation is not configured. The repository currently uses manual JS/TS Bazel targets such as `ts_project`, `js_binary`, and test runner targets.

Useful checks after Gazelle changes:

```sh
bazel build //src/lib/bus/py/...
bazel build //src/lib/bus/tests:interop_py
bazel test //...
```
