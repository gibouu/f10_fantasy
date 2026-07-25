#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises"
import { basename, extname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export const DEFAULT_SCREENSHOT_DIR = ".artifacts/app-store"

export const REQUIRED_SCREENSHOT_IDS = [
  {
    id: "01-race-deck",
    description: "Race deck with the P1, P10, and DNF pick rows",
  },
  {
    id: "02-driver-picker",
    description: "Driver picker sheet",
  },
  {
    id: "03-rankings",
    description: "Post-race score or rankings screen",
  },
]

export const REQUIRED_DIMENSIONS = [
  {
    id: "iphone-6-9",
    label: "iPhone 6.9-inch",
    width: 1320,
    height: 2868,
  },
  {
    id: "iphone-6-7",
    label: "iPhone 6.7-inch",
    width: 1290,
    height: 2796,
  },
]

export const OPTIONAL_DIMENSIONS = [
  {
    id: "iphone-6-5",
    label: "iPhone 6.5-inch",
    width: 1284,
    height: 2778,
  },
  {
    id: "iphone-6-5-legacy",
    label: "iPhone 6.5-inch legacy",
    width: 1242,
    height: 2688,
  },
  {
    id: "iphone-5-5",
    label: "iPhone 5.5-inch",
    width: 1242,
    height: 2208,
  },
]

export const ACCEPTED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"])

const allDimensions = [...REQUIRED_DIMENSIONS, ...OPTIONAL_DIMENSIONS]
const requiredIds = new Set(REQUIRED_SCREENSHOT_IDS.map(({ id }) => id))

function dimensionKey({ width, height }) {
  return `${width}x${height}`
}

function expectedStem({ id }, dimensions) {
  return `${id}-${dimensionKey(dimensions)}`
}

function supportedExtensionsLabel() {
  return ".png, .jpg, or .jpeg"
}

export function requiredFilenameStems() {
  return REQUIRED_DIMENSIONS.flatMap((dimensions) =>
    REQUIRED_SCREENSHOT_IDS.map((screenshot) => expectedStem(screenshot, dimensions)),
  )
}

export function requiredFilenameSummary() {
  return requiredFilenameStems()
    .map((stem) => `${stem}.{png,jpg,jpeg}`)
    .join("\n")
}

function parseFilename(name) {
  const extension = extname(name).toLowerCase()
  if (!ACCEPTED_EXTENSIONS.has(extension)) {
    return { error: `${name}: unsupported format; use ${supportedExtensionsLabel()}` }
  }

  const stem = basename(name, extension)
  const match = stem.match(/^(.+)-(\d{3,4})x(\d{3,4})$/)
  if (!match) {
    return {
      error: `${name}: filename must match <canonical-id>-<width>x<height>${supportedExtensionsLabel()}`,
    }
  }

  return {
    canonicalId: match[1],
    extension,
    expectedWidth: Number(match[2]),
    expectedHeight: Number(match[3]),
    stem,
  }
}

function readPngMetadata(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(signature)) return null
  if (buffer.toString("ascii", 12, 16) !== "IHDR") return null

  const width = buffer.readUInt32BE(16)
  const height = buffer.readUInt32BE(20)
  const colorType = buffer.readUInt8(25)
  let hasAlpha = colorType === 4 || colorType === 6
  let offset = 8

  while (offset + 12 <= buffer.length) {
    const chunkLength = buffer.readUInt32BE(offset)
    const chunkType = buffer.toString("ascii", offset + 4, offset + 8)
    if (chunkType === "tRNS") hasAlpha = true
    offset += 12 + chunkLength
  }

  return { format: "png", hasAlpha, height, width }
}

function readJpegMetadata(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null

  let offset = 2
  while (offset + 4 <= buffer.length) {
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1
    if (offset >= buffer.length) break

    const marker = buffer[offset]
    offset += 1
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue
    if (offset + 2 > buffer.length) break

    const length = buffer.readUInt16BE(offset)
    if (length < 2 || offset + length > buffer.length) break

    const isStartOfFrame = (marker >= 0xc0 && marker <= 0xcf)
      && ![0xc4, 0xc8, 0xcc].includes(marker)
    if (isStartOfFrame) {
      if (length < 7) break
      return {
        format: "jpeg",
        hasAlpha: false,
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      }
    }

    offset += length
  }

  throw new Error("missing JPEG dimensions")
}

export function readImageMetadata(buffer) {
  const png = readPngMetadata(buffer)
  if (png) return png

  const jpeg = readJpegMetadata(buffer)
  if (jpeg) return jpeg

  throw new Error("unsupported image data")
}

function pushToSet(groups, key, canonicalId, fileName) {
  const group = groups.get(key) ?? new Map()
  const files = group.get(canonicalId) ?? []
  files.push(fileName)
  group.set(canonicalId, files)
  groups.set(key, group)
}

export async function validateScreenshotDirectory(rawDirectory = DEFAULT_SCREENSHOT_DIR) {
  const directory = resolve(rawDirectory)
  const errors = []
  const files = []
  const groups = new Map()
  const acceptedDimensionKeys = new Set(allDimensions.map(dimensionKey))

  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return {
        directory,
        errors: [`${rawDirectory}: screenshot directory does not exist`],
        files,
        ok: false,
      }
    }
    throw error
  }

  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith(".")) continue

    const parsed = parseFilename(entry.name)
    if (parsed.error) {
      errors.push(parsed.error)
      continue
    }

    const filePath = join(directory, entry.name)
    let metadata
    try {
      metadata = readImageMetadata(await readFile(filePath))
    } catch (error) {
      errors.push(`${entry.name}: ${error.message}`)
      continue
    }

    const extensionFormat = parsed.extension === ".png" ? "png" : "jpeg"
    if (metadata.format !== extensionFormat) {
      errors.push(`${entry.name}: file contents are ${metadata.format}, not ${extensionFormat}`)
    }
    if (metadata.hasAlpha) {
      errors.push(`${entry.name}: alpha channel is not allowed`)
    }
    if (metadata.width !== parsed.expectedWidth || metadata.height !== parsed.expectedHeight) {
      errors.push(
        `${entry.name}: image is ${metadata.width}x${metadata.height}, `
          + `but filename declares ${parsed.expectedWidth}x${parsed.expectedHeight}`,
      )
    }

    const declaredKey = `${parsed.expectedWidth}x${parsed.expectedHeight}`
    if (!acceptedDimensionKeys.has(declaredKey)) {
      errors.push(`${entry.name}: unsupported dimensions ${declaredKey}`)
    }
    if (!requiredIds.has(parsed.canonicalId)) {
      errors.push(`${entry.name}: unknown canonical ID ${parsed.canonicalId}`)
    }

    pushToSet(groups, declaredKey, parsed.canonicalId, entry.name)
    files.push({ ...parsed, fileName: entry.name, ...metadata })
  }

  for (const [key, group] of groups) {
    for (const [canonicalId, names] of group) {
      if (names.length > 1) {
        errors.push(`${key}: duplicate canonical ID ${canonicalId}: ${names.join(", ")}`)
      }
    }
  }

  for (const dimensions of REQUIRED_DIMENSIONS) {
    const key = dimensionKey(dimensions)
    const group = groups.get(key) ?? new Map()
    for (const screenshot of REQUIRED_SCREENSHOT_IDS) {
      if (!group.has(screenshot.id)) {
        errors.push(
          `missing required filename ${expectedStem(screenshot, dimensions)}.{png,jpg,jpeg}`,
        )
      }
    }
  }

  for (const dimensions of allDimensions) {
    const key = dimensionKey(dimensions)
    const group = groups.get(key)
    if (!group) continue

    const missingIds = REQUIRED_SCREENSHOT_IDS
      .map(({ id }) => id)
      .filter((id) => !group.has(id))
    if (missingIds.length > 0) {
      errors.push(`${key}: incomplete screenshot set; missing ${missingIds.join(", ")}`)
    }
  }

  return { directory, errors, files, ok: errors.length === 0 }
}

async function main() {
  const directory = process.argv[2] ?? DEFAULT_SCREENSHOT_DIR
  const result = await validateScreenshotDirectory(directory)

  if (result.ok) {
    console.log(`Validated ${result.files.length} App Store screenshots in ${result.directory}`)
    return
  }

  console.error("App Store screenshot validation failed.")
  console.error("")
  console.error(`Directory: ${result.directory}`)
  console.error("")
  console.error("Required filenames, with one supported extension each:")
  console.error(requiredFilenameSummary())
  console.error("")
  console.error("Errors:")
  for (const error of result.errors) {
    console.error(`- ${error}`)
  }
  process.exitCode = 1
}

const isMain = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) await main()
