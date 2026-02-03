
Write-Host "Building C++ compiler image..." -ForegroundColor Cyan
docker build -t wasm-compiler-cpp ./compilers/cpp

Write-Host "Building Rust compiler image..." -ForegroundColor Cyan
docker build -t wasm-compiler-rust ./compilers/rust

Write-Host "Building Go compiler image..." -ForegroundColor Cyan
docker build -t wasm-compiler-go ./compilers/go

Write-Host "All Docker images built successfully!" -ForegroundColor Green
