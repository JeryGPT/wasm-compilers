export interface LanguageConfig {
  id: string;
  name: string;
  defaultCode: string;
  filename: string;
  dockerImage: string;
  compileCmd: string;
  poolSize: number;
}

export const LANGUAGES: Record<string, LanguageConfig> = {
  cpp: {
    id: "cpp",
    name: "C++",
    filename: "main.cpp",
    dockerImage: "wasm-compiler-cpp",
    poolSize: 3,
    compileCmd: 'bash -c "emcc main.cpp -o temp.wasm -s STANDALONE_WASM=1 -s PURE_WASI=1 -O0 -s ERROR_ON_UNDEFINED_SYMBOLS=0 && wasm-opt temp.wasm -o output.wasm --asyncify"',
    defaultCode: `#include <stdio.h>

int main() {
    setbuf(stdout, NULL);
    int arr[] = {64, 34, 25, 12, 22, 11, 90};
    int n = sizeof(arr) / sizeof(arr[0]);
    printf("Original array: ");
    for (int i = 0; i < n; i++) printf("%d ", arr[i]);
    printf("\\n");
    for (int i = 0; i < n - 1; i++) {
        for (int j = 0; j < n - i - 1; j++) {
            if (arr[j] > arr[j + 1]) {
                int temp = arr[j];
                arr[j] = arr[j + 1];
                arr[j + 1] = temp;
            }
        }
    }
    printf("Sorted array: ");
    for (int i = 0; i < n; i++) printf("%d ", arr[i]);
    printf("\\n");
    return 0;
}
`
  },
  rust: {
    id: "rust",
    name: "Rust",
    filename: "main.rs",
    dockerImage: "wasm-compiler-rust",
    poolSize: 2,
    compileCmd: 'bash -c "rustc --target wasm32-wasip1 --edition 2021 -C opt-level=0 -o temp.wasm main.rs && wasm-opt temp.wasm -o output.wasm --asyncify --pass-arg=asyncify-imports@env.invoke_*,wasi_snapshot_preview1.fd_read,wasi_snapshot_preview1.poll_oneoff"',
    defaultCode: `fn main() {
    let mut arr = vec![64, 34, 25, 12, 22, 11, 90];
    let n = arr.len();
    print!("Original array: ");
    for num in &arr { print!("{} ", num); }
    println!();
    for i in 0..n {
        for j in 0..n - i - 1 {
            if arr[j] > arr[j + 1] { arr.swap(j, j + 1); }
        }
    }
    print!("Sorted array: ");
    for num in &arr { print!("{} ", num); }
    println!();
}
`
  },
  go: {
    id: "go",
    name: "Go",
    filename: "main.go",
    dockerImage: "wasm-compiler-go",
    poolSize: 3,
    compileCmd: 'sh -c "go build -p 4 -o output.wasm main.go && cp /usr/local/go/misc/wasm/wasm_exec.js wasm_exec.js"',
    defaultCode: `package main
import "fmt"
func main() {
    arr := []int{64, 34, 25, 12, 22, 11, 90}
    n := len(arr)
    fmt.Print("Original array: ")
    for _, num := range arr { fmt.Printf("%d ", num) }
    fmt.Println()
    for i := 0; i < n-1; i++ {
        for j := 0; j < n-i-1; j++ {
            if arr[j] > arr[j+1] { arr[j], arr[j+1] = arr[j+1], arr[j] }
        }
    }
    fmt.Print("Sorted array: ")
    for _, num := range arr { fmt.Printf("%d ", num) }
    fmt.Println()
}
`
  }
};

export type LanguageId = keyof typeof LANGUAGES;
