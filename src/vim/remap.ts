import type { VimEvent } from "./handler"

/** Replay a configured non-recursive remap through the same Vim handler. */
export function dispatchRemap(
  event: VimEvent & { option?: boolean },
  mapping: Record<string, string> | undefined,
  pending: string,
  handleKey: (event: VimEvent) => boolean,
) {
  if (!mapping || pending) return false
  const name = event.name ?? ""
  const key = `${event.meta || event.option ? "alt+" : ""}${event.ctrl ? "ctrl+" : ""}${event.shift && /[a-z]/.test(name) ? name.toUpperCase() : name}`
  const sequence = mapping[key]
  if (!sequence) return false
  event.preventDefault()
  for (const char of sequence === "ctrl+r" ? ["ctrl+r"] : [...sequence]) {
    handleKey({
      name: char === "ctrl+r" ? "r" : char,
      sequence: char,
      raw: char,
      ctrl: char === "ctrl+r",
      shift: /[A-Z]/.test(char),
      meta: false,
      super: false,
      preventDefault: () => event.preventDefault(),
    })
  }
  return true
}
