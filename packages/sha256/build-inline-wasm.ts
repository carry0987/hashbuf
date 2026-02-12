import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAME = 'hashbuf_sha256';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 1. Read WASM binary and encode as base64
const wasmPath = join(__dirname, 'src', 'wasm-bundler', `${NAME}_bg.wasm`);
const wasmBase64 = readFileSync(wasmPath).toString('base64');

const wasmJsCode = `
import * as ${NAME}_bg from './${NAME}_bg.js';
const wasmBase64 = "${wasmBase64}";
const wasmBinary = Uint8Array.from(atob(wasmBase64), c => c.charCodeAt(0));
const wasmModule = new WebAssembly.Module(wasmBinary);
const importObject = { './${NAME}_bg.js': ${NAME}_bg };
const wasm = new WebAssembly.Instance(wasmModule, importObject).exports;
export { wasm };
`;

const wasmJsOutputPath = join(__dirname, 'src', 'wasm-inline', `${NAME}_bg.wasm.js`);
writeFileSync(wasmJsOutputPath, wasmJsCode);
console.log(`Written: ${wasmJsOutputPath}`);

// 2. Write .d.ts for the WASM JS file
const wasmDTsCode = `declare const wasm: string;
export { wasm };
`;

const wasmDTsOutputPath = join(__dirname, 'src', 'wasm-inline', `${NAME}_bg.wasm.d.ts`);
writeFileSync(wasmDTsOutputPath, wasmDTsCode);
console.log(`Written: ${wasmDTsOutputPath}`);

// 3. Rewrite the entry JS to use the inline WASM module
const originalFilePath = join(__dirname, 'src', 'wasm-bundler', `${NAME}.js`);
const originalCode = readFileSync(originalFilePath, 'utf-8');

const expectedImport = `import * as wasm from "./${NAME}_bg.wasm";`;

if (!originalCode.includes(expectedImport)) {
    throw new Error(`Expected JS file to contain '${expectedImport}', got:\n${originalCode.slice(0, 200)}`);
}

// Ensure no other .wasm imports exist
const wasmImportRegex = /import .* from ['"].*\.wasm['"];?/g;
const matches = originalCode.match(wasmImportRegex);
if (matches?.some((line) => line !== expectedImport)) {
    throw new Error(
        `Unexpected .wasm import detected:\n${matches.filter((line) => line !== expectedImport).join('\n')}`
    );
}

const modifiedCode = originalCode.replace(expectedImport, `import { wasm } from "./${NAME}_bg.wasm.js";`);

const outputFilePath = join(__dirname, 'src', 'wasm-inline', `${NAME}.js`);
writeFileSync(outputFilePath, modifiedCode);
console.log(`Written: ${outputFilePath}`);
