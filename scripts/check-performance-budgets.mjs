import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = process.cwd();

const BUDGETS = {
  handlerRawBytes:
    Number.parseInt(process.env.MAX_CF_HANDLER_RAW_BYTES || "10485760", 10) ||
    10485760,
  handlerGzipBytes:
    Number.parseInt(process.env.MAX_CF_HANDLER_GZIP_BYTES || "3145728", 10) ||
    3145728,
  clientChunksBytes:
    Number.parseInt(process.env.MAX_NEXT_CLIENT_CHUNKS_BYTES || "900000", 10) ||
    900000,
};

function toRelative(filePath) {
  return path.relative(ROOT, filePath) || filePath;
}

function readFileBytes(filePath) {
  try {
    return fs.readFileSync(filePath);
  } catch {
    return null;
  }
}

function walkFiles(dirPath, predicate, output = []) {
  if (!fs.existsSync(dirPath)) return output;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, predicate, output);
      continue;
    }
    if (entry.isFile() && predicate(fullPath)) {
      output.push(fullPath);
    }
  }
  return output;
}

function sumFileSizes(paths) {
  let total = 0;
  for (const filePath of paths) {
    try {
      total += fs.statSync(filePath).size;
    } catch {
      // ignore transient/missing files
    }
  }
  return total;
}

function checkHandlerBudget() {
  const handlerPath = path.join(
    ROOT,
    ".open-next/server-functions/default/handler.mjs",
  );
  const bytes = readFileBytes(handlerPath);
  if (!bytes) {
    return {
      skipped: true,
      reason: "handler artifact missing",
    };
  }
  const rawBytes = bytes.byteLength;
  const gzipBytes = gzipSync(bytes, { level: 9 }).byteLength;
  return {
    skipped: false,
    file: toRelative(handlerPath),
    rawBytes,
    gzipBytes,
    rawWithinBudget: rawBytes <= BUDGETS.handlerRawBytes,
    gzipWithinBudget: gzipBytes <= BUDGETS.handlerGzipBytes,
  };
}

function checkClientChunkBudget() {
  const chunkDirs = [
    path.join(ROOT, ".next/static/chunks"),
    path.join(ROOT, ".next/build/chunks"),
  ];
  const chunkFiles = [];
  for (const dirPath of chunkDirs) {
    walkFiles(dirPath, (filePath) => filePath.endsWith(".js"), chunkFiles);
  }
  if (chunkFiles.length === 0) {
    return {
      skipped: true,
      reason: "no client chunk artifacts found",
    };
  }
  const unique = [...new Set(chunkFiles)];
  const totalBytes = sumFileSizes(unique);
  return {
    skipped: false,
    files: unique.length,
    totalBytes,
    withinBudget: totalBytes <= BUDGETS.clientChunksBytes,
  };
}

function main() {
  const handler = checkHandlerBudget();
  const client = checkClientChunkBudget();
  const failures = [];

  if (!handler.skipped) {
    if (!handler.rawWithinBudget) {
      failures.push(
        `handler raw size ${handler.rawBytes} exceeds MAX_CF_HANDLER_RAW_BYTES (${BUDGETS.handlerRawBytes})`,
      );
    }
    if (!handler.gzipWithinBudget) {
      failures.push(
        `handler gzip size ${handler.gzipBytes} exceeds MAX_CF_HANDLER_GZIP_BYTES (${BUDGETS.handlerGzipBytes})`,
      );
    }
  }

  if (!client.skipped && !client.withinBudget) {
    failures.push(
      `client chunk bytes ${client.totalBytes} exceeds MAX_NEXT_CLIENT_CHUNKS_BYTES (${BUDGETS.clientChunksBytes})`,
    );
  }

  const report = {
    budgets: BUDGETS,
    handler,
    client,
    ok: failures.length === 0,
    failures,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main();
