import { expect, test } from "bun:test"
import { dispatchRemap } from "./remap"
import type { VimEvent } from "./handler"

function key(name: string, modifiers: Partial<VimEvent & { option?: boolean }> = {}) {
  let prevented = false
  return {
    event: { name, ...modifiers, preventDefault() { prevented = true } },
    prevented: () => prevented,
  }
}

test("VSCode-style normal motions replay counts without modifiers", () => {
  const pressed: VimEvent[] = []
  const source = key("j", { option: true })
  expect(dispatchRemap(source.event, { "alt+j": "5j" }, "", (event) => {
    pressed.push(event)
    return true
  })).toBe(true)
  expect(source.prevented()).toBe(true)
  expect(pressed.map((event) => event.name)).toEqual(["5", "j"])
  expect(pressed.every((event) => !event.meta && !event.ctrl)).toBe(true)
})

test("shift remap and redo respect mode/pending operator", () => {
  const pressed: VimEvent[] = []
  const handle = (event: VimEvent) => { pressed.push(event); return true }
  expect(dispatchRemap(key("j", { shift: true }).event, { J: "10j" }, "", handle)).toBe(true)
  expect(pressed.map((event) => event.name).join("")).toBe("10j")
  expect(dispatchRemap(key("r", { shift: true }).event, { R: "ctrl+r" }, "", handle)).toBe(true)
  expect(pressed.at(-1)).toMatchObject({ name: "r", ctrl: true, shift: false })
  expect(dispatchRemap(key("j", { shift: true }).event, { J: "10j" }, "d", handle)).toBe(false)
  expect(pressed).toHaveLength(4)
})
