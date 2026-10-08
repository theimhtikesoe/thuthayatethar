import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(projectRoot, "node_modules/pdfjs-dist/build/pdf.worker.min.js");
const destination = resolve(projectRoot, "public/pdf.worker.min.js");

await mkdir(dirname(destination), { recursive: true });
await copyFile(source, destination);
console.log("Copied the pinned PDF.js worker to public/pdf.worker.min.js");
