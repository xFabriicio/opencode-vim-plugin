import type { Context } from "@opencode/plugin/tui/context"

type LegacyBinding = { key: string | Record<string, unknown>; cmd: string; desc?: string }
type LegacyCommand = {
  name: string
  title?: string
  desc?: string
  category?: string
  namespace?: string
  slashName?: string
  hidden?: boolean
  enabled?: boolean | (() => boolean)
  run: (context: { event?: unknown }) => unknown
}

function bindingKey(value: LegacyBinding["key"], tokens: ReadonlyMap<string, string>) {
  if (typeof value === "string") {
    for (const [name, key] of tokens) value = value.replaceAll(`<${name}>`, `${key} `)
    return value.trim()
  }
  const name = value.name === "," ? "comma" : value.name
  return [...("ctrl" in value && value.ctrl ? ["ctrl"] : []),
    ...(value.shift ? ["shift"] : []),
    ...(value.meta ? ["meta"] : []),
    ...(value.super ? ["super"] : []),
    name,
  ].join("+")
}

/** Adapts the former TUI plugin surface to OpenCode 2's supported CLI API. */
export function createV2Adapter(context: Context) {
  const cleanups: Array<() => void> = []
  const [storage, updateStorage] = context.storage.store("vim-plugin", {
    initial: { enabled: context.options.enabled !== false },
  })
  const commandsByID = new Map<string, LegacyCommand["run"]>()
  const tokens = new Map<string, string>()
  let layerSequence = 0
  const storageKey = (key: string) => key === "ocv-plugin.enabled" ? "enabled" : key

  const route = () => {
    const current = context.ui.router.current()
    return { name: current.type, ...(current.type === "session" ? { sessionID: current.sessionID } : {}) }
  }

  const legacyCommands = (commands: LegacyCommand[] = []) =>
    commands.map((command) => ({
      id: command.name,
      title: command.title,
      description: command.desc,
      group: command.category,
      enabled: command.enabled,
      bind: false as const,
      ...(command.namespace === "palette" ? { palette: true as const } : {}),
      slash: command.slashName ? { name: command.slashName } : undefined,
      run: (_input?: string, event?: unknown) => {
        const result = command.run({ event })
        return result === false ? false : undefined
      },
    }))

  const legacyBindings = (bindings: LegacyBinding[] = [], layerID: number) =>
    bindings.map((binding, index) => ({
      id: `vim-plugin.binding.${layerID}.${index}`,
      title: binding.desc ?? "Vim key",
      bind: bindingKey(binding.key, tokens),
      run: (input?: string, event?: unknown) => {
        const run = commandsByID.get(binding.cmd)
        if (run) {
          const result = run({ event })
          return result === false ? false : undefined
        }
        context.keymap.dispatch(binding.cmd, input)
      },
    }))

  const api = {
    renderer: context.renderer as any,
    get theme() {
      const theme = context.theme
      return {
        current: {
          background: theme.background.base,
          secondary: theme.background.raised.base,
          text: theme.text.base,
          textMuted: theme.text.muted,
        },
      }
    },
    route: { get current() { return route() } },
    ui: {
      dialog: { open: false, clear: () => context.ui.dialog.clear() },
      toast: (options: { title?: string; message: string; variant?: "info" | "success" | "warning" | "error"; duration?: number }) =>
        context.ui.toast.show(options),
    },
    keymap: {
      dispatchCommand: (id: string) => context.keymap.dispatch(id),
      registerToken: (token: { name: string; key: string }) => {
        tokens.set(token.name, token.key)
      },
      registerLayer: (layer: {
        mode?: string
        priority?: number
        enabled?: boolean | (() => boolean)
        commands?: LegacyCommand[]
        bindings?: LegacyBinding[]
      }) => {
        for (const command of layer.commands ?? []) commandsByID.set(command.name, command.run)
        const commands = [
          ...legacyCommands(layer.commands),
          ...legacyBindings(layer.bindings ?? [], layerSequence++),
        ]
        context.keymap.layer(() => ({
          mode: layer.mode,
          priority: layer.priority,
          enabled: layer.enabled,
          commands,
        }))
      },
    },
    kv: {
      get: <Value>(key: string, fallback: Value): Value => ((storage as Record<string, unknown>)[storageKey(key)] as Value | undefined) ?? fallback,
      set: (key: string, value: unknown) => updateStorage((draft) => Object.assign(draft, { [storageKey(key)]: value })),
    },
    lifecycle: { onDispose: (cleanup: () => void) => cleanups.push(cleanup) },
    slots: {
      register: (registration: { slots?: Record<string, () => unknown> }) => {
        const render = registration.slots?.home_prompt_right ?? registration.slots?.session_prompt_right
        if (!render) return
        cleanups.push(context.ui.slot({ append: "prompt.footer.status", render: () => render() as any }))
      },
    },
  }

  return {
    api: api as any,
    dispose() {
      for (const cleanup of cleanups.splice(0).reverse()) cleanup()
    },
  }
}
