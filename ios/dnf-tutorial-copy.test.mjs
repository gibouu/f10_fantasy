import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const iosRoot = fileURLToPath(new URL("./", import.meta.url));
const featuresRoot = path.join(iosRoot, "FXRacing", "Features");
const deckSource = await readFile(
  new URL("./FXRacing/Features/Races/RaceDeckView.swift", import.meta.url),
  "utf8",
);
const pickPanelSource = await readFile(
  new URL("./FXRacing/Features/Races/RacePickPanel.swift", import.meta.url),
  "utf8",
);

async function collectSwiftFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectSwiftFiles(entryPath);
      }
      return entry.isFile() && entry.name.endsWith(".swift") ? [entryPath] : [];
    }),
  );

  return files.flat();
}

test("DNF tutorial copy describes any non-classified driver", () => {
  assert.match(
    deckSource,
    /Choose P1, P10, and one driver who won't be classified\./,
  );
  assert.match(pickPanelSource, /case \.dnf: "Non-classified driver"/);
});

test("iOS product UI source no longer says first DNF or first retirement", async () => {
  const productSources = await Promise.all(
    (await collectSwiftFiles(featuresRoot)).map(async (filePath) => ({
      filePath,
      source: await readFile(filePath, "utf8"),
    })),
  );

  for (const { filePath, source } of productSources) {
    assert.doesNotMatch(source, /first DNF/i, filePath);
    assert.doesNotMatch(source, /first retirement/i, filePath);
  }
});
