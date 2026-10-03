# BranchManager

BranchManager is a Visual Studio Code extension that provides a Visual Studio–style experience for viewing and managing Git branches inside the Explorer sidebar.

Use the Branch Manager view to inspect branches, and run the provided commands to open the commits for a branch.

Key design goals:
- Make branch operations discoverable inside the Explorer view.
- Expose convenient commands for inspecting branch history.
- Keep the UX lightweight and focused on day-to-day branch tasks.


## Features

- Explorer view named "Branch Manager" (appears in the Explorer activity pane).
- Command: "Open Branch Commits" — opens the commit list for a selected branch (see Commands below).
- Visual, lightweight management of branches (create/merge/delete/checkout workflows are supported by the extension UI when available).

Note: The extension surface is defined in the extension manifest; see [package.json](C:/code/utils/branchmanager/package.json) for the contributed views and commands.


## Requirements

- Visual Studio Code version >= 1.138.0 (as declared in package.json engines).
- Git installed and available in your PATH (required for branch operations).


## Installation

Install the extension from the Visual Studio Marketplace or by building and installing the VSIX locally:

- From Marketplace: search for "BranchManager" in the Extensions view in VS Code.
- From source (developer):
  1. Clone the repository.
  2. Run `npm install`.
  3. Run `npm run compile` to build the extension.
  4. Run the Extension Development Host from VS Code (F5) or package with `vsce package` and install the generated .vsix.


## Usage

- Open the Explorer activity pane in VS Code and find the "Branch Manager" view.
- Use the view to browse branches and interact with the branch UI provided by the extension.
- To open the commits for a branch from the Command Palette, run the command:
  - `Open Branch Commits` (command id: `branchmanager.openBranchCommits`).

If the view is not visible, open the Command Palette (Ctrl+Shift+P on Windows/Linux, Cmd+Shift+P on macOS) and run "View: Toggle Explorer" or search for the command by name.


## Commands

The following command(s) are contributed by this extension (see [package.json](C:/code/utils/branchmanager/package.json)):

- `branchmanager.openBranchCommits` — "Open Branch Commits"

These commands are available in the Command Palette and (where applicable) in the view or the editor context menus.


## Extension Settings

No user-configurable extension settings are contributed at this time. If you need a configuration option added, please open an issue or a pull request.


## Development

Helpful npm scripts (defined in package.json):

- `npm run compile` — compile TypeScript sources
- `npm run watch` — run the TypeScript compiler in watch mode
- `npm run lint` — run ESLint on `src`
- `npm test` — run extension tests

Dev dependencies and versions are declared in [package.json](C:/code/utils/branchmanager/package.json).


## Troubleshooting

- If the Branch Manager view does not appear, check that the extension is installed and enabled and that your VS Code version meets the `engines.vscode` requirement.
- Ensure Git is installed and available in your PATH.
- Use the Developer Tools (Help → Toggle Developer Tools) to view errors from the extension host.


## Known Issues

No known issues are listed. If you find a bug or unexpected behavior, please open an issue in the repository.


## Contributing

Contributions are welcome. Suggested ways to contribute:

- Open an issue describing the problem or feature request.
- Send a pull request with a focused, well-tested change.

Development checklist:
- Follow the existing code style and lint rules (`npm run lint`).
- Add tests where appropriate and keep changes small and focused.


## Release Notes

See the changelog or Releases page for a complete history. Short summary of existing release headings:

- 1.0.0 — Initial public release
- 1.0.1 — Minor fixes
- 1.1.0 — Improvements and updates


## License

No license file detected in the repository. Add a LICENSE file to state the terms under which the project is distributed.


## Further reading

* [VS Code extension guidelines](https://code.visualstudio.com/api/references/extension-guidelines)
* [Writing a VS Code extension](https://code.visualstudio.com/api/get-started/your-first-extension)


---

If any specific examples, screenshots, or additional sections are desired (for example a quick-start GIF, a list of supported Git operations, or detailed screenshots of the Branch Manager view), indicate which assets and preferred wording and those will be added.
