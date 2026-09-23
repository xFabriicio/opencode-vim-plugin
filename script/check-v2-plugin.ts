#!/usr/bin/env bun

import { createRoot } from "solid-js"
import { RGBA } from "@opentui/core"

const plugin = (await import("../dist/tui.js" as string)).default as {
  id: string
  setup: (context: any) => void | (() => void) | Promise<void | (() => void)>
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

assert(plugin.id === "ocv-plugin", "the V2 TUI plugin must expose its stable id")
assert(typeof plugin.setup === "function", "the V2 TUI plugin must expose setup(context)")

const layers: Array<() => any> = []
const slots: any[] = []
const toasts: any[] = []
const editor: any = {
  plainText: "abc",
  cursorOffset: 0,
  focused: true,
  visualCursor: { visualRow: 0, visualCol: 0 },
  width: 80,
  height: 1,
  x: 0,
  y: 0,
  editBuffer: {},
  editorView: { getSelection: () => undefined, resetSelection() {}, setSelection() {} },
  getLayoutNode: () => ({ markDirty() {} }),
  insertText() {},
  deleteRange() {},
  setText() {},
  render() {},
  clear() {},
  requestRender() {},
}
const context = {
  options: {
    enabled: true,
    initial_mode: "normal",
    normal_leader: "space",
    normal_keybinds: { "<leader>s": "session.list" },
  },
  renderer: { currentFocusedEditor: editor, requestRender() {} },
  theme: {
    background: { base: RGBA.fromInts(0, 0, 0), raised: { base: RGBA.fromInts(24, 24, 24) } },
    text: { base: RGBA.fromInts(255, 255, 255), muted: RGBA.fromInts(128, 128, 128) },
  },
  storage: {
    store(_key: string, input: { initial: Record<string, unknown> }) {
      const state = { ...input.initial }
      return [state, (mutate: (draft: Record<string, unknown>) => void) => mutate(state)]
    },
  },
  keymap: {
    layer(input: () => any) {
      layers.push(input)
    },
    dispatch() {},
  },
  ui: {
    router: { current: () => ({ type: "home" }) },
    toast: { show: (toast: any) => toasts.push(toast) },
    dialog: { clear() {} },
    slot(claim: any) {
      slots.push(claim)
      return () => {}
    },
  },
}

let dispose = () => {}
createRoot((close) => {
  const cleanup = plugin.setup(context)
  if (typeof cleanup === "function") dispose = cleanup
  close()
})

const resolved = layers.map((layer) => layer())
const toggle = resolved.flatMap((layer) => layer.commands ?? []).find((command: any) => command.id === "ocv-plugin.toggle")
const keyHandler = resolved.flatMap((layer) => layer.commands ?? []).find((command: any) => command.id === "ocv-plugin.key")
assert(toggle?.slash?.name === "vim", "the migrated toggle command must be exposed as /vim")
assert(toggle?.palette === true, "the migrated toggle command must be available in the palette")
assert(typeof keyHandler?.run === "function", "the Vim key handler must be registered in a V2 keymap layer")
assert(resolved.some((layer) => layer.commands?.some((command: any) => command.bind)), "Vim keys must be translated to V2 bindings")
assert(resolved.some((layer) => layer.commands?.some((command: any) => command.bind === "comma")), "literal comma keys must survive V2 key binding conversion")
assert(resolved.some((layer) => layer.commands?.some((command: any) => command.bind === "shift+comma")), "shifted comma keys must survive V2 key binding conversion")
assert(resolved.some((layer) => layer.commands?.some((command: any) => command.bind === "space s")), "custom leader sequences must translate to V2 key bindings")
assert(slots.some((slot) => slot.append === "prompt.footer.status"), "the Vim indicator must use the V2 prompt footer slot")

const right = resolved.flatMap((layer) => layer.commands ?? []).find((command: any) => command.bind === "l")
let propagationStopped = false
const event = {
  name: "l",
  sequence: "l",
  raw: "l",
  shift: false,
  ctrl: false,
  meta: false,
  super: false,
  preventDefault() {},
  stopPropagation() { propagationStopped = true },
}
right?.run(undefined, event)
assert(editor.cursorOffset === 1, "the V2 keymap binding must deliver its event to the Vim motion engine")
assert(propagationStopped, "handled Vim key events must stop propagating to host bindings")

dispose()
console.log(`ok: OpenCode 2 TUI plugin adapter (${layers.length} keymap layers, ${slots.length} slot)`)
