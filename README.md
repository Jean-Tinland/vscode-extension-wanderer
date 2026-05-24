# <img src="https://raw.githubusercontent.com/Jean-Tinland/vscode-extension-wanderer/main/media/logo.png" width="24" height="24" alt="Wanderer Logo" /> Wanderer

> « Not all those who wander are lost... »\
> _J.R.R. Tolkien_

Wanderer is a VS Code extension for spatial code navigation on an infinite canvas. Open files as draggable editors, move around freely, zoom and de-zoom as needed and follow definitions or project usages without losing context.

![Preview](https://raw.githubusercontent.com/Jean-Tinland/vscode-extension-wanderer/main/media/preview.jpeg)

Inspired by [Haystack](https://github.com/haystackeditor/haystack-editor).

## Feature overview

- Spatial canvas with drag-to-move nodes, minimap, viewport controls, zoom, and pan.
- Fast opening of files from a path-first picker with recent-file ranking.
- Definition and usage navigation with Cmd/Ctrl-click inside editors.
- Canvas following user custom theme.
- Copilot integration with inline completions and inline chat. _You must allow the extension to sync with Copilot in order to use these features._

## Quick start

### Prerequisites

- VS Code 1.90+

### Installation

Launch VS Code Quick Open (⌘+P), paste the following command, and press enter.

```
ext install jean.wanderer
```

Or install this theme from the extension panel : search for "_Wanderer_".

You can find this extension in the Visual Studio Code Marketplace.

### Run locally

```bash
npm install
npm run build
```

1. Press F5 in VS Code (Extension Development Host).
2. Run `Wanderer: Open Canvas` from the command palette.
3. Add files with `Wanderer: Open Current File on Canvas` or the canvas toolbar.
4. Cmd/Ctrl-click symbols to traverse definitions or project usages.

If the panel shows the fallback page, rebuild first with `npm run build`.

<!-- ## Commands

### Main commands

| Command                                 | Description                                                |
| --------------------------------------- | ---------------------------------------------------------- |
| `Wanderer: Open Canvas`                 | Open the main infinite-canvas panel.                       |
| `Wanderer: Open Current File on Canvas` | Add the active editor file as a node.                      |
| `Wanderer: Reveal Definition on Canvas` | Resolve definition at cursor and open target(s) on canvas. |
| `Wanderer: Zoom to Fit`                 | Fit all visible nodes in view.                             |
| `Wanderer: Save Layout`                 | Save the current graph as a named layout.                  |
| `Wanderer: Reset Layout`                | Clear the auto-saved workspace layout.                     |

### Canvas commands

| Command                                             | Description                                                           |
| --------------------------------------------------- | --------------------------------------------------------------------- |
| `Wanderer: Canvas Open File`                        | Open a single file picker from canvas context.                        |
| `Wanderer: Canvas Open Multiple Files`              | Open multiple files in one action.                                    |
| `Wanderer: Canvas Open Node Switcher`               | Search and jump across currently open nodes.                          |
| `Wanderer: Canvas Focus Previous Node`              | Cycle focus backward through nodes.                                   |
| `Wanderer: Canvas Focus Next Node`                  | Cycle focus forward through nodes.                                    |
| `Wanderer: Canvas Open Focused Node in Side Editor` | Open focused node file in native side editor.                         |
| `Wanderer: Canvas Close Focused Node`               | Close focused node.                                                   |
| `Wanderer: Canvas Toggle Focused Node Size`         | Expand or restore focused node size.                                  |
| `Wanderer: Canvas Toggle Snap to Grid`              | Toggle grid snapping for node movement.                               |
| `Wanderer: Canvas Toggle Reference Click Mode`      | Toggle Cmd/Ctrl-click behavior between definition and project usages. |
| `Wanderer: Canvas Toggle Problems Panel`            | Show or hide aggregated diagnostics panel.                            |
| `Wanderer: Canvas Toggle Keyboard Cheatsheet`       | Show or hide shortcuts modal.                                         |

### Saved layout actions

| Command             | Description                                      |
| ------------------- | ------------------------------------------------ |
| `Load Layout`       | Load a named layout from the Saved Layouts view. |
| `Rename Layout`     | Rename a saved layout.                           |
| `Duplicate Layout`  | Clone a saved layout.                            |
| `Toggle Layout Pin` | Pin or unpin a layout for visibility.            |
| `Delete Layout`     | Remove a saved layout.                           |

## Keyboard Shortcuts

| Action                               | macOS                    | Windows/Linux            |
| ------------------------------------ | ------------------------ | ------------------------ |
| Open canvas                          | Cmd+Alt+W                | Ctrl+Alt+W               |
| Open current file on canvas (editor) | Cmd+Alt+Shift+O          | Ctrl+Alt+Shift+O         |
| Reveal definition on canvas (editor) | Cmd+Alt+Shift+D          | Ctrl+Alt+Shift+D         |
| Open file on canvas                  | Cmd+Alt+O                | Ctrl+Alt+O               |
| Open many files                      | Cmd+Alt+Shift+O          | Ctrl+Alt+Shift+O         |
| Open node switcher                   | Cmd+Ctrl+K or Cmd+Ctrl+J | Ctrl+Alt+K or Ctrl+Alt+J |
| Save named layout                    | Cmd+Alt+S                | Ctrl+Alt+S               |
| Load named layout                    | Cmd+Alt+L                | Ctrl+Alt+L               |
| Focus previous node                  | Cmd+Alt+P                | Ctrl+Alt+P               |
| Focus next node                      | Cmd+Alt+N                | Ctrl+Alt+N               |
| Open focused node in side editor     | Cmd+Alt+E                | Ctrl+Alt+E               |
| Close focused node                   | Cmd+W                    | Ctrl+W                   |
| Toggle focused node size             | Cmd+Alt+B                | Ctrl+Alt+B               |
| Zoom to fit                          | Cmd+Alt+0                | Ctrl+Alt+0               |
| Toggle snap to grid                  | Cmd+Alt+G                | Ctrl+Alt+G               |
| Toggle reference click mode          | Cmd+Alt+R                | Ctrl+Alt+R               |
| Toggle problems panel                | Cmd+Alt+M                | Ctrl+Alt+M               |
| Toggle keyboard cheatsheet           | Cmd+Alt+/                | Ctrl+Alt+/               |
| Inline chat in editor node           | Cmd+I                    | Ctrl+I                   |

## Interaction Model

| Input                        | Result                                                  |
| ---------------------------- | ------------------------------------------------------- |
| Drag node header             | Move node                                               |
| Mouse wheel/pinch            | Zoom                                                    |
| Middle-click drag            | Pan canvas                                              |
| Drag selection on background | Multi-select nodes                                      |
| Cmd/Ctrl-click symbol        | Follow definition or open project usages (toolbar mode) |
| Node header actions          | Expand/restore, open in side editor, close              |
| Escape                       | Clear focus or close active modal/panel                 |

## Views

- Activity bar view container: Wanderer
- Sidebar launcher view: open canvas, open current file on canvas
- Saved Layouts tree view: load, rename, duplicate, pin, and delete layouts

## Configuration

| Setting                          | Default | Description                                                                              |
| -------------------------------- | ------- | ---------------------------------------------------------------------------------------- |
| `wanderer.spatial.horizontalGap` | `120`   | Horizontal gap in pixels when placing definition/reference targets next to source nodes. |
| `wanderer.spatial.verticalStack` | `40`    | Vertical offset in pixels for stacked target placement.                                  |
| `wanderer.node.defaultWidth`     | `520`   | Default node width in pixels.                                                            |
| `wanderer.node.defaultHeight`    | `360`   | Default node height in pixels.                                                           | -->

## Development

```bash
npm install
npm run build
```

Watch mode:

```bash
npm run watch:webview
npm run watch:extension
```

Type checking:

```bash
npm run typecheck
```

## Code Quality

```bash
npm run format
npm run format:check
npm run lint
npm run lint:fix
npm run knip
npm run knip:strict
```

## Notice

**This extension's logo is a simple reproduction of the Gandalf's glyph left on the door of Bag End in The Hobbit, it is absolutely not an original creation of mine.**
