Packaging the Network Mapper

This project can be packaged two ways for a Windows standalone:

1) Quick single-executable with `pkg` (fast)
2) Full desktop app with UI wrapper using `Electron` + `electron-builder` (richer UX, installer)

Option A — pkg (single EXE)

- Installs a single executable that includes Node and your app files. The executable will run the bundled `server.js` and serve the static files. This is the quickest way to produce a standalone.

Steps (PowerShell):

# Install dev dependency
npm install
# Build the exe for Windows x64 (node18)
npm run build:pkg

The built executable will be at `dist/network-mapper.exe`.

Notes:
- `pkg` bundles files listed under `pkg.assets` in `package.json`. Ensure any JSON data your app needs is included.
- Some dynamic file access (like writing JSON to the same directory) may fail because the exe's internal filesystem is read-only. For persistence use an external folder (e.g., on first run copy default files to `%APPDATA%\\network-mapper` and write there).

Data directory
-------------
When running normally or from the packaged exe, property files are saved under your OS data directory:

- Windows: %APPDATA%\\network-mapper
- Linux: $XDG_DATA_HOME/network-mapper or ~/.local/share/network-mapper

You can inspect or copy JSON files from there to backup or edit manually.

Option B — Electron + electron-builder (recommended for installers)

- This produces a native Windows installer (MSI or NSIS) and a nicer desktop experience. It's more setup but provides auto-update and native behavior.

High-level steps:
1. Add Electron and electron-builder dependencies.
2. Create a simple Electron main process that spawns your `server.js` and opens a BrowserWindow to `http://localhost:3000` or loads the static files.
3. Configure `electron-builder` and run the build to produce an installer.

If you'd like, I can scaffold the Electron wrapper and `electron-builder` config for you.

Which option do you prefer? If you want the quick route, I will run the necessary edits to make persistence location safe and show exact commands to build the EXE.
 
Quick run of the packaged exe (PowerShell):

```powershell
# After running `npm run build:pkg` you'll have dist/network-mapper.exe
.\dist\network-mapper.exe
```

If you'd like, I can scaffold the Electron wrapper and `electron-builder` config for you next.

Electron development and build (Windows)
--------------------------------------

1. Install dependencies (this will install Electron and electron-builder):

```powershell
npm install
```

2. Run in development (this will start the server and open the app window):

```powershell
npm run start:electron
```

3. Build an installer for Windows (NSIS) — this produces an installer in `dist`:

```powershell
npm run dist:win
```

Note: Building an installer requires the Windows build tools available on the host. If you run into build issues, I can help set up a GitHub Actions workflow to build releases in CI and upload the installer.

CI build (recommended if local build fails)
-----------------------------------------
If the Windows build fails locally (common due to permissions or missing dependencies), you can use the included GitHub Actions workflow to build on GitHub's Windows runners.

1. Commit and push your changes to the `main` branch (or open a PR).
2. Go to the repository's Actions tab on GitHub and run the "Build Windows Installer" workflow manually or wait for the push.
3. After the workflow completes, download the artifact named `network-mapper-installer` from the workflow run.

I included a sample workflow `.github/workflows/build-windows.yml` in the repo. If you'd like, I can also configure automatic GitHub Releases publishing and attach the installer to a release.