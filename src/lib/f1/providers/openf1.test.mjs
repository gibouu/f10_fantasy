import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import ts from "typescript"

async function loadOpenF1Module() {
  const source = await readFile(new URL("./openf1.ts", import.meta.url), "utf8")
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  })
  const encoded = Buffer.from(outputText).toString("base64")
  return import(`data:text/javascript;base64,${encoded}`)
}

const { OpenF1Provider } = await loadOpenF1Module()

function jsonResponse(data) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

test("getFinalResults distinguishes DNS drivers from DNF retirements", async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    const requestUrl = String(url)

    if (requestUrl.endsWith("/position?session_key=123")) {
      return jsonResponse([
        {
          session_key: 123,
          driver_number: 1,
          position: 1,
          date: "2026-06-21T15:00:00.000Z",
        },
        {
          session_key: 123,
          driver_number: 2,
          position: 2,
          date: "2026-06-21T15:00:00.000Z",
        },
        {
          session_key: 123,
          driver_number: 3,
          position: 3,
          date: "2026-06-21T15:00:00.000Z",
        },
        {
          session_key: 123,
          driver_number: 4,
          position: 4,
          date: "2026-06-21T15:00:00.000Z",
        },
      ])
    }

    if (requestUrl.endsWith("/stints?session_key=123")) {
      return jsonResponse([
        { session_key: 123, driver_number: 1, lap_start: 1, lap_end: 10 },
        { session_key: 123, driver_number: 2, lap_start: 1, lap_end: 9 },
        { session_key: 123, driver_number: 3, lap_start: 1, lap_end: 7 },
      ])
    }

    return new Response("not found", { status: 404, statusText: "Not Found" })
  }

  try {
    const provider = new OpenF1Provider()
    const results = await provider.getFinalResults(123)
    const byDriver = new Map(results.map((r) => [r.driverNumber, r]))

    assert.deepEqual(byDriver.get(1), {
      driverNumber: 1,
      position: 1,
      status: "CLASSIFIED",
    })
    assert.deepEqual(byDriver.get(2), {
      driverNumber: 2,
      position: 2,
      status: "CLASSIFIED",
    })
    assert.deepEqual(byDriver.get(3), {
      driverNumber: 3,
      position: null,
      status: "DNF",
    })
    assert.deepEqual(byDriver.get(4), {
      driverNumber: 4,
      position: null,
      status: "DNS",
    })
  } finally {
    globalThis.fetch = previousFetch
  }
})

test("getLiveClassification returns null when OpenF1 has no position rows", async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    const requestUrl = String(url)

    if (requestUrl.endsWith("/position?session_key=456")) {
      return jsonResponse([])
    }

    return new Response("not found", { status: 404, statusText: "Not Found" })
  }

  try {
    const provider = new OpenF1Provider()
    const classification = await provider.getLiveClassification(456)

    assert.equal(classification, null)
  } finally {
    globalThis.fetch = previousFetch
  }
})

test("getLiveClassification propagates OpenF1 provider failures", async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    const requestUrl = String(url)

    if (requestUrl.endsWith("/position?session_key=789")) {
      return new Response("upstream failed", {
        status: 500,
        statusText: "Internal Server Error",
      })
    }

    return new Response("not found", { status: 404, statusText: "Not Found" })
  }

  try {
    const provider = new OpenF1Provider()
    await assert.rejects(
      provider.getLiveClassification(789),
      /OpenF1 HTTP 500 Internal Server Error/,
    )
  } finally {
    globalThis.fetch = previousFetch
  }
})
