#!/bin/bash

# Build script for WASM compiler Docker images

# Colors for output
CYAN='\033[0;36m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo -e "${CYAN}Building C++ compiler image...${NC}"
docker build -t wasm-compiler-cpp ./compilers/cpp

echo -e "${CYAN}Building Rust compiler image...${NC}"
docker build -t wasm-compiler-rust ./compilers/rust

echo -e "${CYAN}Building Go compiler image...${NC}"
docker build -t wasm-compiler-go ./compilers/go

echo -e "${GREEN}All Docker images built successfully!${NC}"
