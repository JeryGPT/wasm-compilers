FROM rust:latest

WORKDIR /src

# Add WASI target
RUN rustup target add wasm32-wasip1

# Install wasm-opt for Asyncify transformation
RUN apt-get update && apt-get install -y wget binaryen && rm -rf /var/lib/apt/lists/*

# Compile Rust to WASM and apply Asyncify transformation
# --asyncify-imports tells wasm-opt which imports can pause execution
# --pass-arg tells it which WASI functions to asyncify
# Use opt-level=0 for fastest compilation
CMD ["bash", "-c", "rustc --target wasm32-wasip1 --edition 2021 -C opt-level=0 -o temp.wasm main.rs && wasm-opt temp.wasm -o output.wasm --asyncify --pass-arg=asyncify-imports@env.invoke_*,wasi_snapshot_preview1.fd_read,wasi_snapshot_preview1.poll_oneoff -O1"]
