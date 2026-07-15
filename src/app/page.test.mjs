import test from "node:test"
import assert from "node:assert/strict"
import { readFile, stat } from "node:fs/promises"

async function readSource(path) {
  try {
    return await readFile(new URL(path, import.meta.url), "utf8")
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return ""
    }

    throw error
  }
}

const [page, chrome] = await Promise.all([
  readSource("./page.tsx"),
  readSource("./site-chrome.tsx"),
])
const source = `${page}\n${chrome}`

test("landing stays static and presents the three-call game", () => {
  assert.doesNotMatch(source, /redirect\s*\(|["']use client["']/)
  assert.doesNotMatch(source, /@\/auth|@\/lib\/db|@\/lib\/services|fetch\s*\(|Providers/)
  assert.doesNotMatch(source, /from\s+["']next\/(?:image|link)["']/)
  assert.match(source, /https:\/\/apps\.apple\.com\/app\/id6762099290/)
  assert.match(source, /PICK THE GRID/)
  assert.match(source, /P1\. P10\. DNF\./)
  assert.match(source, /One race\. Three calls\. Global rankings\./)
  assert.match(source, /non-finisher/)
  assert.doesNotMatch(source, /first retirement/i)
  assert.equal((source.match(/<h1\b/g) ?? []).length, 1)
  assert.match(source, /href=["']\/privacy["']/)
  assert.match(source, /href=["']\/privacy#terms["']/)
  assert.match(source, /href=["']\/support["']/)
})

test("landing owns its canonical and social metadata", () => {
  assert.match(page, /alternates:\s*{\s*canonical:\s*["']\/["']\s*}/)
  assert.match(page, /openGraph:\s*{[\s\S]*?url:\s*["']\/["']/)
  assert.match(page, /siteName:\s*["']FX Racing["']/)
  assert.match(page, /twitter:\s*{\s*card:\s*["']summary_large_image["']/)
})

test("landing uses two local, dimensioned, lightweight screenshots", async () => {
  const imagePaths = [
    ...new Set(
      [...source.matchAll(/["'](\/landing\/fx-racing-[^"']+-v1\.jpg)["']/g)].map(
        ([, path]) => path,
      ),
    ),
  ]

  assert.equal(imagePaths.length, 2)

  const imageTags = source.match(/<img\b[\s\S]*?\/>/g) ?? []
  const sizes = []

  for (const imagePath of imagePaths) {
    const imageTag = imageTags.find((tag) => tag.includes(imagePath))

    assert.ok(imageTag, `missing img element for ${imagePath}`)
    assert.match(imageTag, /\bwidth=["']\d+["']/)
    assert.match(imageTag, /\bheight=["']\d+["']/)
    assert.match(imageTag, /\bsizes=["'][^"']+["']/)
    sizes.push((await stat(new URL(`../../public${imagePath}`, import.meta.url))).size)
  }

  assert.ok(sizes.reduce((total, size) => total + size, 0) <= 409_600)

  const raceDeck = imageTags.find((tag) => tag.includes("fx-racing-race-deck-v1.jpg"))
  const driverPicker = imageTags.find((tag) => tag.includes("fx-racing-driver-picker-v1.jpg"))

  assert.match(raceDeck ?? "", /\bfetchPriority=["']high["']/)
  assert.match(raceDeck ?? "", /\bloading=["']eager["']/)
  assert.match(driverPicker ?? "", /\bloading=["']lazy["']/)
  assert.doesNotMatch(driverPicker ?? "", /\bfetchPriority=["']high["']/)
})
