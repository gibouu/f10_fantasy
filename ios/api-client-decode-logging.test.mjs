import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(
  new URL("./FXRacing/Core/Networking/APIClient.swift", import.meta.url),
  "utf8",
)

const successStatusBlock = source.match(/case 200\.\.\.299:[\s\S]*?(?=\n        case 401:)/)?.[0]
const decodeCatchBlock = successStatusBlock?.match(/catch \{[\s\S]*?throw APIError\.decodingFailed\(error\)\s*\}/)?.[0]
const decodeLogCall = decodeCatchBlock?.match(/fxError\(\.network,\s*"[^"]+"\)/)?.[0]

test("APIClient decode failures do not log raw response bodies", () => {
  assert.ok(decodeCatchBlock, "APIClient should catch successful-response decode failures")
  assert.ok(decodeLogCall, "decode failures should be logged once")
  assert.match(
    decodeLogCall,
    /^fxError\(\.network,\s*"\\\(pathTag\) → \\\(http\.statusCode\) decode \\\(T\.self\) failed \(\\\(ms\)ms, \\\(data\.count\)B, \\\(auth\)\): \\\(error\.localizedDescription\)"\)$/,
    "decode-failure log should use only endpoint, status, type, timing, byte-count, auth marker, and decode error",
  )
  assert.doesNotMatch(decodeCatchBlock, /String\s*\(\s*data\s*:/)
  assert.doesNotMatch(decodeCatchBlock, /String\s*\(\s*decoding\s*:\s*data/)
  assert.doesNotMatch(decodeCatchBlock, /data\.prefix/)
  assert.doesNotMatch(decodeCatchBlock, /body\[/)
  assert.doesNotMatch(decodeCatchBlock, /\bpreview\b/)
})

test("APIClient decode failure logs keep non-payload diagnostics", () => {
  assert.ok(decodeLogCall, "decode failures should be logged once")
  assert.match(decodeLogCall, /pathTag/)
  assert.match(decodeLogCall, /http\.statusCode/)
  assert.match(decodeLogCall, /T\.self/)
  assert.match(decodeLogCall, /ms/)
  assert.match(decodeLogCall, /data\.count/)
  assert.match(decodeLogCall, /auth/)
  assert.match(decodeLogCall, /error\.localizedDescription/)
})
