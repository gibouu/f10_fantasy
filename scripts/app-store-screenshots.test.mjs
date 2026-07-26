import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  REQUIRED_DIMENSIONS,
  REQUIRED_SCREENSHOT_IDS,
  requiredFilenameSummary,
  validateScreenshotDirectory,
} from "./app-store-screenshots.mjs"

function pngChunk(type, data = Buffer.alloc(0)) {
  const chunk = Buffer.alloc(12 + data.length)
  chunk.writeUInt32BE(data.length, 0)
  chunk.write(type, 4, 4, "ascii")
  data.copy(chunk, 8)
  return chunk
}

function makePng({ colorType = 2, height, transparent = false, width }) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr.writeUInt8(8, 8)
  ihdr.writeUInt8(colorType, 9)

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    ...(transparent ? [pngChunk("tRNS", Buffer.from([0, 0, 0, 0, 0, 0]))] : []),
    pngChunk("IEND"),
  ])
}

function makeJpeg({ height, width }) {
  const app0 = Buffer.from([
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46,
    0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01,
    0x00, 0x00,
  ])
  const sof0 = Buffer.from([
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03,
    0x01, 0x11, 0x00,
    0x02, 0x11, 0x00,
    0x03, 0x11, 0x00,
  ])

  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof0, Buffer.from([0xff, 0xd9])])
}

async function withTempDir(callback) {
  const directory = await mkdtemp(join(tmpdir(), "fx-app-store-screenshots-"))
  try {
    await callback(directory)
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
}

async function writeCompleteRequiredSet(directory) {
  for (const dimensions of REQUIRED_DIMENSIONS) {
    for (const screenshot of REQUIRED_SCREENSHOT_IDS) {
      const extension = screenshot.id === "02-driver-picker" ? "jpg" : "png"
      const data = extension === "jpg" ? makeJpeg(dimensions) : makePng(dimensions)
      await writeFile(
        join(directory, `${screenshot.id}-${dimensions.width}x${dimensions.height}.${extension}`),
        data,
      )
    }
  }
}

test("documents the required App Store screenshot filenames", () => {
  const summary = requiredFilenameSummary()

  assert.match(summary, /01-race-deck-1320x2868\.\{png,jpg,jpeg\}/)
  assert.match(summary, /02-driver-picker-1320x2868\.\{png,jpg,jpeg\}/)
  assert.match(summary, /03-rankings-1320x2868\.\{png,jpg,jpeg\}/)

  // 6.9-inch is the only size App Store Connect requires; smaller sizes are
  // optional, so the whole set can come from a single simulator.
  assert.doesNotMatch(summary, /1290x2796/)
})

test("accepts complete required PNG and JPEG screenshot sets", async () => {
  await withTempDir(async (directory) => {
    await writeCompleteRequiredSet(directory)

    const result = await validateScreenshotDirectory(directory)

    assert.equal(result.ok, true)
    assert.deepEqual(result.errors, [])
    assert.equal(result.files.length, REQUIRED_DIMENSIONS.length * REQUIRED_SCREENSHOT_IDS.length)
  })
})

test("rejects wrong dimensions, alpha, and unsupported formats", async () => {
  await withTempDir(async (directory) => {
    await writeCompleteRequiredSet(directory)
    await writeFile(join(directory, "01-race-deck-1320x2868.png"), makePng({
      height: 2796,
      width: 1290,
    }))
    await writeFile(join(directory, "02-driver-picker-1320x2868.png"), makePng({
      colorType: 6,
      height: 2868,
      width: 1320,
    }))
    await writeFile(join(directory, "unsupported-1320x2868.webp"), "not a screenshot")

    const result = await validateScreenshotDirectory(directory)
    const errors = result.errors.join("\n")

    assert.equal(result.ok, false)
    assert.match(errors, /image is 1290x2796, but filename declares 1320x2868/)
    assert.match(errors, /02-driver-picker-1320x2868\.png: alpha channel is not allowed/)
    assert.match(errors, /unsupported-1320x2868\.webp: unsupported format/)
  })
})

test("rejects duplicate canonical IDs within the same size set", async () => {
  await withTempDir(async (directory) => {
    await writeCompleteRequiredSet(directory)
    await writeFile(join(directory, "01-race-deck-1320x2868.jpeg"), makeJpeg({
      height: 2868,
      width: 1320,
    }))

    const result = await validateScreenshotDirectory(directory)
    const errors = result.errors.join("\n")

    assert.equal(result.ok, false)
    assert.match(errors, /1320x2868: duplicate canonical ID 01-race-deck:/)
    assert.match(errors, /01-race-deck-1320x2868\.png/)
    assert.match(errors, /01-race-deck-1320x2868\.jpeg/)
  })
})

test("rejects missing required filenames and incomplete optional sets", async () => {
  await withTempDir(async (directory) => {
    await writeCompleteRequiredSet(directory)
    await rm(join(directory, "03-rankings-1320x2868.png"))
    await writeFile(join(directory, "01-race-deck-1284x2778.png"), makePng({
      height: 2778,
      width: 1284,
    }))

    const result = await validateScreenshotDirectory(directory)
    const errors = result.errors.join("\n")

    assert.equal(result.ok, false)
    assert.match(errors, /missing required filename 03-rankings-1320x2868\.\{png,jpg,jpeg\}/)
    assert.match(errors, /1320x2868: incomplete screenshot set; missing 03-rankings/)
    assert.match(
      errors,
      /1284x2778: incomplete screenshot set; missing 02-driver-picker, 03-rankings/,
    )
  })
})

test("package wires screenshot validation into static script checks", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"))

  assert.equal(
    pkg.scripts["validate:app-store-screenshots"],
    "node scripts/app-store-screenshots.mjs",
  )
  assert.match(pkg.scripts["test:scripts:static"], /scripts\/app-store-screenshots\.test\.mjs/)
})
