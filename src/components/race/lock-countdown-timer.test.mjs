import test from "node:test"
import assert from "node:assert/strict"

import { createLockCountdownTimer } from "./lock-countdown-timer.js"

function fakeTimers(nowRef) {
  let nextId = 1
  const callbacks = new Map()
  const cleared = []

  return {
    callbacks,
    cleared,
    setIntervalFn(callback, delay) {
      const id = nextId++
      callbacks.set(id, { callback, delay })
      return id
    },
    clearIntervalFn(id) {
      cleared.push(id)
      callbacks.delete(id)
    },
    fire(id) {
      callbacks.get(id)?.callback()
    },
    now() {
      return nowRef.value
    },
  }
}

test("createLockCountdownTimer ticks until cutoff and locks once", () => {
  const nowRef = { value: 0 }
  const timers = fakeTimers(nowRef)
  const ticks = []
  let lockedCalls = 0

  const cleanup = createLockCountdownTimer({
    cutoff: 2_500,
    now: timers.now,
    setIntervalFn: timers.setIntervalFn.bind(timers),
    clearIntervalFn: timers.clearIntervalFn.bind(timers),
    onTick: (remaining) => ticks.push(remaining),
    onLocked: () => {
      lockedCalls += 1
    },
  })

  assert.deepEqual(ticks, [2_500])
  const [intervalId] = timers.callbacks.keys()
  assert.equal(timers.callbacks.get(intervalId).delay, 1_000)

  nowRef.value = 1_000
  timers.fire(intervalId)
  assert.deepEqual(ticks, [2_500, 1_500])
  assert.equal(lockedCalls, 0)

  nowRef.value = 3_000
  timers.fire(intervalId)
  assert.deepEqual(ticks, [2_500, 1_500, -500])
  assert.equal(lockedCalls, 1)
  assert.deepEqual(timers.cleared, [intervalId])

  cleanup()
  assert.equal(lockedCalls, 1)
})

test("createLockCountdownTimer locks immediately when cutoff already passed", () => {
  const nowRef = { value: 10_000 }
  const timers = fakeTimers(nowRef)
  const ticks = []
  let lockedCalls = 0

  createLockCountdownTimer({
    cutoff: 9_000,
    now: timers.now,
    setIntervalFn: timers.setIntervalFn.bind(timers),
    clearIntervalFn: timers.clearIntervalFn.bind(timers),
    onTick: (remaining) => ticks.push(remaining),
    onLocked: () => {
      lockedCalls += 1
    },
  })

  assert.deepEqual(ticks, [-1_000])
  assert.equal(lockedCalls, 1)
  assert.deepEqual([...timers.callbacks.keys()], [])
})

test("createLockCountdownTimer cleanup stops future ticks before cutoff", () => {
  const nowRef = { value: 0 }
  const timers = fakeTimers(nowRef)
  let lockedCalls = 0

  const cleanup = createLockCountdownTimer({
    cutoff: 10_000,
    now: timers.now,
    setIntervalFn: timers.setIntervalFn.bind(timers),
    clearIntervalFn: timers.clearIntervalFn.bind(timers),
    onTick: () => {},
    onLocked: () => {
      lockedCalls += 1
    },
  })
  const [intervalId] = timers.callbacks.keys()

  cleanup()
  nowRef.value = 20_000
  timers.fire(intervalId)

  assert.equal(lockedCalls, 0)
  assert.deepEqual(timers.cleared, [intervalId])
})
