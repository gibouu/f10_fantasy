import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"

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

const [chrome, styles] = await Promise.all([
  readSource("./site-chrome.tsx"),
  readSource("./site.module.css"),
])
const source = `${chrome}\n${styles}`

test("shared chrome is a server-only static shell", () => {
  assert.doesNotMatch(chrome, /["']use client["']/)
  assert.doesNotMatch(chrome, /from\s+["']next\/(?:image|link)["']/)
  assert.doesNotMatch(
    chrome,
    /@\/auth|@\/lib\/db|@\/lib\/services|fetch\s*\(|Providers|useEffect|useState/,
  )
  assert.match(chrome, /export function SiteHeader/)
  assert.match(chrome, /export function SiteFooter/)
})

test("shared chrome exposes review-stable navigation and store placements", () => {
  assert.match(chrome, /id=["']landing-navigation["']/)
  assert.match(chrome, /id=["']landing-app-store-navigation["']/)
  assert.match(chrome, /href=["']\/["']/)
  assert.match(chrome, /FX Racing home/)
  assert.match(chrome, /aria-label=["']Download FX Racing on the App Store["']/)
  assert.match(chrome, /navigationStoreLink/)
  assert.match(chrome, /heroStoreLink/)
  assert.match(chrome, /appStoreText/)
})

test("shared footer keeps legal links and attribution", () => {
  assert.match(chrome, /id=["']landing-footer["']/)
  assert.match(chrome, /href=["']\/privacy["']/)
  assert.match(chrome, /href=["']\/privacy#terms["']/)
  assert.match(chrome, /href=["']\/support["']/)
  assert.match(chrome, /unofficial[^<]*fan/i)
  assert.match(chrome, /Apple and the Apple logo are trademarks of Apple Inc\./)
  assert.match(chrome, /App Store is a service mark of Apple Inc\./)
})

test("official badge sizing preserves Apple clear space", () => {
  const badgeHeight = styles.match(/--app-store-badge-height:\s*([\d.]+)px/)

  assert.ok(badgeHeight, "missing --app-store-badge-height")
  assert.ok(Number(badgeHeight[1]) >= 40)
  assert.match(
    styles,
    /padding:\s*calc\(var\(--app-store-badge-height\)\s*\/\s*4\)/,
  )
})

test("official App Store badge stays byte-identical to the Apple download", async () => {
  const badge = await readFile(
    new URL("../../public/landing/download-on-the-app-store-black-en-us-v1.svg", import.meta.url),
  )

  assert.match(badge.toString("utf8", 0, 256), /<svg\b/)
  assert.equal(
    createHash("sha256").update(badge).digest("hex"),
    "a26fc5b38380272c92e9019a2eb8b45542a66814b3e2b203772db8904b9fb99f",
  )
})

test("Midnight Grid keeps the approved palette, shell, and badge breakpoint", () => {
  assert.match(styles, /--canvas:\s*#050506/)
  assert.match(styles, /--panel:\s*#111114/)
  assert.match(styles, /--hairline:\s*#2C2C30/)
  assert.match(styles, /--ink:\s*#F5F5F7/)
  assert.match(styles, /--muted:\s*#A1A1A8/)
  assert.match(styles, /--racing-red:\s*#E10600/)
  assert.doesNotMatch(styles, /--site-(?:asphalt|panel|grid|chalk|muted|signal)/)
  assert.match(
    styles,
    /\.shell\s*{[\s\S]*?width:\s*min\(calc\(100%\s*-\s*2rem\),\s*1240px\)/,
  )
  assert.doesNotMatch(styles, /72rem/)
  assert.match(styles, /@media\s*\(min-width:\s*48rem\)/)
  assert.match(
    styles,
    /@media\s*\(min-width:\s*48rem\)[\s\S]*?\.navigationStoreLink\s*{[\s\S]*?display:\s*inline-flex/,
  )
})

test("screenshot overlap stays centered with straight-on panels", () => {
  const raceDeckFrame = styles.match(/\.raceDeckFrame\s*{([\s\S]*?)}/)?.[1] ?? ""
  const driverPickerFrame = styles.match(/\.driverPickerFrame\s*{([\s\S]*?)}/)?.[1] ?? ""

  assert.match(raceDeckFrame, /transform:\s*translateX\(8%\)/)
  assert.match(driverPickerFrame, /transform:\s*translateX\(-8%\)\s*translateY\(5%\)/)
  assert.doesNotMatch(raceDeckFrame, /rotate\s*\(/)
  assert.doesNotMatch(driverPickerFrame, /rotate\s*\(/)
})

test("Midnight Grid keeps the approved typography weights", () => {
  assert.match(styles, /\.sitePage\s*{[^}]*font-weight:\s*450/)

  for (const selector of ["brand", "heroTitle", "scoreItem dt", "legalArticle h1"]) {
    const pattern = new RegExp(`\\.${selector.replace(" ", "\\s+")}\\s*{[^}]*font-weight:\\s*800`)
    assert.match(styles, pattern, `${selector} must use display weight 800`)
  }

  assert.match(styles, /\.eyebrow,\s*\.legalEyebrow\s*{[^}]*font-weight:\s*700/)
  assert.match(styles, /\.appStoreText\s*{[^}]*font-weight:\s*700/)
  assert.match(styles, /\.scoreItem dd\s*{[^}]*font-weight:\s*700/)
  assert.match(styles, /\.legalNavigation a,\s*\.legalLink\s*{[^}]*font-weight:\s*700/)
  assert.match(styles, /\.legalSection h2\s*{[^}]*font-weight:\s*700/)
  assert.match(styles, /\.supportAddress\s*{[^}]*font-weight:\s*700/)
  assert.match(styles, /\.heroLead\s*{[^}]*font-weight:\s*700/)
  assert.doesNotMatch(styles, /font-weight:\s*(?:850|900)\b/)
})

test("small timing labels keep AA contrast while red remains an accent", () => {
  const labels = styles.match(/\.eyebrow,\s*\.legalEyebrow\s*{([\s\S]*?)}/)?.[1] ?? ""

  assert.match(labels, /color:\s*var\(--(?:ink|muted)\)/)
  assert.doesNotMatch(labels, /color:\s*var\(--racing-red\)/)
  assert.match(styles, /\.eyebrow::before,\s*\.legalEyebrow::before\s*{[^}]*background:\s*var\(--racing-red\)/)
})

test("dark landing text selection keeps light foreground contrast", () => {
  assert.match(
    styles,
    /\.sitePage\s+::selection\s*{[^}]*background:\s*color-mix\(in srgb,\s*var\(--racing-red\)\s*35%,\s*var\(--canvas\)\)[^}]*color:\s*var\(--ink\)/,
  )
})
