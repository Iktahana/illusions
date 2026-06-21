# Renderer platform adapters

`platform/` contains renderer-side implementations of environment-dependent contracts.

- `browser/`: browser APIs such as IndexedDB, File System Access API, and HTTP NLP routes.
- `electron-renderer/`: preload-backed IPC clients. These modules never import Electron main-process code directly.

Factories and feature contracts remain outside this directory. Browser and Electron implementations intentionally stay separate because they have different capability and trust models.
