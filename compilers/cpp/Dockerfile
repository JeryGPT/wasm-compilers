FROM emscripten/emsdk:3.1.50

WORKDIR /src

# Install binaryen for wasm-opt
RUN apt-get update && apt-get install -y binaryen && rm -rf /var/lib/apt/lists/*

# Optimize Emscripten cache to reduce memory usage
ENV EM_CACHE=/emsdk/cache
ENV EM_CONFIG=/emsdk/.emscripten
ENV EMCC_CORES=1
ENV EMCC_DEBUG=0
ENV EMCC_SKIP_SANITY_CHECK=1

# Pre-build system libraries with optimizations to avoid runtime compilation
RUN emcc --clear-cache && \
    echo "int main() { return 0; }" > /tmp/warmup.c && \
    emcc /tmp/warmup.c -o /tmp/warmup.wasm -s STANDALONE_WASM=1 -s PURE_WASI=1 -O0 && \
    rm /tmp/warmup.* && \
    rm -rf /emsdk/upstream/emscripten/tests && \
    rm -rf /emsdk/upstream/emscripten/docs

# Compile to pure WASI, then apply wasm-opt Asyncify (same approach as Rust)
# This avoids Emscripten's broken Asyncify rewind behavior
# Use -O0 for fastest compilation, skip heavy optimizations
CMD ["bash", "-c", "emcc main.cpp -o temp.wasm -s STANDALONE_WASM=1 -s PURE_WASI=1 -O0 && wasm-opt temp.wasm -o output.wasm --asyncify --pass-arg=asyncify-imports@wasi_snapshot_preview1.fd_read -O1"]
