#!/usr/bin/env bash
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_DIR="${OCV_PLUGIN_TEST_DIR:-$HOME/dev/opencode-vim-plugin-test}"
TEST_CONFIG_HOME="${OCV_PLUGIN_TEST_CONFIG_HOME:-$TEST_DIR/.xdg-config}"
TEST_CONFIG_DIR="$TEST_CONFIG_HOME/opencode"
GLOBAL_CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
OPENCODE_BIN="${OPENCODE_BIN:-opencode}"

if ! command -v "$OPENCODE_BIN" >/dev/null 2>&1; then
  echo "error: opencode not found. Set OPENCODE_BIN=/path/to/opencode." >&2
  exit 1
fi

cd "$PLUGIN_DIR"
bun run build

mkdir -p "$TEST_DIR/.opencode" "$TEST_CONFIG_DIR"

# Keep the user's server configuration, but isolate cli.json so the test uses
# this local V2 TUI plugin and doesn't load unrelated CLI-only plugins.
if [[ "$GLOBAL_CONFIG_DIR" != "$TEST_CONFIG_DIR" && -d "$GLOBAL_CONFIG_DIR" ]]; then
  shopt -s dotglob nullglob
  for source in "$GLOBAL_CONFIG_DIR"/*; do
    name="$(basename "$source")"
    [[ "$name" == "cli.json" || "$name" == "cli.jsonc" ]] && continue
    [[ -e "$TEST_CONFIG_DIR/$name" || -L "$TEST_CONFIG_DIR/$name" ]] || ln -s "$source" "$TEST_CONFIG_DIR/$name"
  done
  shopt -u dotglob nullglob
fi

cat > "$TEST_CONFIG_DIR/cli.json" <<JSON
{
  "\$schema": "https://opencode.ai/v2/cli.json",
  "plugins": [
    {
      "package": "$PLUGIN_DIR",
      "options": {
        "enabled": true,
        "vim_initial_mode": "insert"
      }
    }
  ]
}
JSON

cat > "$TEST_DIR/README.md" <<'MD'
# OCV Plugin Local Test Workspace

This workspace loads the local OpenCode Vim Plugin package from `~/dev/opencode-vim-plugin` via `cli.json`.

Run from this directory with installed OpenCode:

```bash
opencode
```
MD

printf 'Test workspace: %s\n' "$TEST_DIR"
printf 'Plugin package: %s\n' "$PLUGIN_DIR"
printf 'Config home:    %s\n' "$TEST_CONFIG_HOME"
printf 'OpenCode:       %s (%s)\n' "$(command -v "$OPENCODE_BIN")" "$($OPENCODE_BIN --version 2>/dev/null || echo unknown)"
printf '\nLaunching installed OpenCode with global TUI plugins isolated...\n'
cd "$TEST_DIR"
exec env XDG_CONFIG_HOME="$TEST_CONFIG_HOME" "$OPENCODE_BIN"
