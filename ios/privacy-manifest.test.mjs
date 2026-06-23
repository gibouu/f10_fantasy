import assert from "node:assert/strict"
import { readFile, readdir } from "node:fs/promises"
import { join, relative } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const iosDirectory = fileURLToPath(new URL("./", import.meta.url))
const manifestPath = join(iosDirectory, "FXRacing", "PrivacyInfo.xcprivacy")

async function findPrivacyManifests(directory = iosDirectory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const manifests = []

  for (const entry of entries) {
    const entryPath = join(directory, entry.name)

    if (entry.isDirectory()) {
      manifests.push(...(await findPrivacyManifests(entryPath)))
    } else if (entry.isFile() && entry.name === "PrivacyInfo.xcprivacy") {
      manifests.push(relative(iosDirectory, entryPath).replaceAll("\\", "/"))
    }
  }

  return manifests.sort()
}

function decodeXmlText(value) {
  return value
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
}

function tokenizePlist(xml) {
  const tokens = []
  const tokenPattern =
    /<key>([^<]*)<\/key>|<string>([^<]*)<\/string>|<(dict|array)>|<\/(dict|array)>|<(dict|array)\/>|<(true|false)\/>/g

  for (const match of xml.matchAll(tokenPattern)) {
    if (match[1] !== undefined) {
      tokens.push({ type: "key", value: decodeXmlText(match[1]) })
    } else if (match[2] !== undefined) {
      tokens.push({ type: "string", value: decodeXmlText(match[2]) })
    } else if (match[3] !== undefined) {
      tokens.push({ type: "open", value: match[3] })
    } else if (match[4] !== undefined) {
      tokens.push({ type: "close", value: match[4] })
    } else if (match[5] !== undefined) {
      tokens.push({ type: "empty", value: match[5] })
    } else if (match[6] !== undefined) {
      tokens.push({ type: "boolean", value: match[6] === "true" })
    }
  }

  return tokens
}

function parseValue(tokens, cursor) {
  const token = tokens[cursor.index]
  assert.ok(token, "privacy manifest plist ended unexpectedly")
  cursor.index += 1

  if (token.type === "string" || token.type === "boolean") {
    return token.value
  }

  if (token.type === "empty") {
    return token.value === "array" ? [] : {}
  }

  if (token.type === "open" && token.value === "array") {
    const values = []

    while (tokens[cursor.index]?.type !== "close") {
      values.push(parseValue(tokens, cursor))
    }

    assert.equal(tokens[cursor.index]?.value, "array")
    cursor.index += 1
    return values
  }

  if (token.type === "open" && token.value === "dict") {
    const value = {}

    while (tokens[cursor.index]?.type !== "close") {
      const key = tokens[cursor.index]
      assert.equal(key?.type, "key")
      cursor.index += 1
      value[key.value] = parseValue(tokens, cursor)
    }

    assert.equal(tokens[cursor.index]?.value, "dict")
    cursor.index += 1
    return value
  }

  assert.fail(`unsupported privacy manifest plist token: ${JSON.stringify(token)}`)
}

function parsePlist(xml) {
  const tokens = tokenizePlist(xml)
  const cursor = { index: 0 }
  const manifest = parseValue(tokens, cursor)

  assert.equal(cursor.index, tokens.length, "privacy manifest plist has trailing tokens")
  return manifest
}

async function readManifest() {
  return parsePlist(await readFile(manifestPath, "utf8"))
}

test("privacy manifest has a single authoritative file in the target directory", async () => {
  assert.deepEqual(await findPrivacyManifests(), ["FXRacing/PrivacyInfo.xcprivacy"])
})

test("privacy manifest declares expected collected data categories", async () => {
  const manifest = await readManifest()
  const collectedTypes = new Set(
    manifest.NSPrivacyCollectedDataTypes.map(({ NSPrivacyCollectedDataType }) => {
      return NSPrivacyCollectedDataType
    }),
  )

  assert.deepEqual(
    collectedTypes,
    new Set([
      "NSPrivacyCollectedDataTypeEmailAddress",
      "NSPrivacyCollectedDataTypeName",
      "NSPrivacyCollectedDataTypeUserID",
      "NSPrivacyCollectedDataTypeGameplayContent",
    ]),
  )
})

test("privacy collected data entries are linked, non-tracking, and used for app functionality", async () => {
  const manifest = await readManifest()

  for (const entry of manifest.NSPrivacyCollectedDataTypes) {
    assert.equal(entry.NSPrivacyCollectedDataTypeLinked, true)
    assert.equal(entry.NSPrivacyCollectedDataTypeTracking, false)
    assert.deepEqual(entry.NSPrivacyCollectedDataTypePurposes, [
      "NSPrivacyCollectedDataTypePurposeAppFunctionality",
    ])
  }
})

test("privacy manifest declares the UserDefaults required reason", async () => {
  const manifest = await readManifest()
  const userDefaultsEntry = manifest.NSPrivacyAccessedAPITypes.find(
    ({ NSPrivacyAccessedAPIType }) =>
      NSPrivacyAccessedAPIType === "NSPrivacyAccessedAPICategoryUserDefaults",
  )

  assert.ok(userDefaultsEntry, "UserDefaults accessed API entry should exist")
  assert.deepEqual(userDefaultsEntry.NSPrivacyAccessedAPITypeReasons, ["CA92.1"])
})
