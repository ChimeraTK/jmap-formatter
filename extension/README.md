# ChimeraTK jmap Formatter

Language support and formatting for ChimeraTK `.jmap` files.

## Features

- Syntax highlighting for `.jmap` files (JSON grammar).
- Schema validation and completion for `.jmap` files.
- Formatting via `jmapfmt.py`.
- **Outline, breadcrumbs, sticky scroll, and Go to Symbol** — a structured view of
  `addressSpace`/registers, `channels`, and `interruptHandler` (see below).
- **Hover** showing the schema description of the key under the cursor.

## Symbol navigation

The extension provides a symbol tree that powers four VS Code features at once:

- **Outline view** — symbol tree of the active `.jmap` file (Explorer → Outline).
- **Breadcrumbs** — symbol path above the editor (`Ctrl+Shift+.`).
- **Sticky Scroll** — nested-scope headers pinned to the top while scrolling.
- **Go to Symbol** — quick pick of symbols in the file (`Ctrl+Shift+O`).

The tree is derived from the file structure. Icons distinguish the element roles:

| Element | Icon |
|---|---|
| `addressSpace`, `interruptHandler`, `channels` | namespace (folder) |
| register (plain) | object |
| module (has `children`) | struct |
| 2D register (has `channels`) | array |
| interrupt register (`triggeredByInterrupt`) | event |
| mux-selected register (`selectedBy`) | key |
| bit-field child | field |
| channel (plain) | class |
| mux-selected channel | key |
| channel with bit-field children | struct |
| interrupt controller (`interruptHandler.<id>`) | event |

Sticky Scroll is configured with `editor.stickyScroll.*` (for example
`editor.stickyScroll.maxLineCount`, `editor.stickyScroll.defaultModel`).

## Usage

Open a `.jmap` file and run **Format Document** (`Shift+Alt+F`), or enable format on save:

```json
"[jmap]": { "editor.formatOnSave": true }
```

## Requirements

- `python3` available on `PATH`.

## Standalone use

The formatter is a standalone Python script and does not require this extension:

```
python3 jmapfmt.py fix <files...>
python3 jmapfmt.py check <files...>
```
