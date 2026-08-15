# NMSH Dispatch Docs

Standalone documentation site for `nmsh_dispatch`. It is intentionally separate from the FiveM resource and does not change the resource files.

## Run locally

From `D:\FiveM-Stuff\qbox-server`:

```powershell
python -m http.server 8773
```

Open `http://127.0.0.1:8773/nmsh_dispatch-docs/`.

The docs are dependency-free HTML/CSS/JS so they can be hosted on GitBook, a static host, or copied into a lightweight web server without a build step. The local font references point at the bundled NMSH Dispatch fonts; copy the font files into `assets/fonts` when deploying outside the workspace.

## Content source

The pages were written from the current `nmsh_dispatch` `config.lua`, `API.md`, `client.lua`, `server.lua`, and React frontend contracts. Browser-preview behavior is documented separately from FiveM runtime behavior.

## Navigation

- Start here: Overview, Getting started
- Configure: Configuration
- Core systems: Calls, Units
- Operations: Dispatcher, Patrol Groups, TAC/Waves, History/Heatmap, Tactical Tools
- Interface: Small HUD, Full Dispatch
- Integrate: CreateDispatch, predefined dispatches, exports/events
- Reference: Troubleshooting
