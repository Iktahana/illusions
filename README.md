# illusions - 日本語小説エディタ

<div align="center" style="display: flex; flex-direction: column; gap: 12px; align-items: center; margin: 20px 0;">

![banner](/public/banner/github.png)


## ダウンロード / Downloads

<div style="display: flex; gap: 8px; height: 48px;">
  <a href="https://github.com/Iktahana/illusions/releases/latest" style="text-decoration: none; display: flex; align-items: center; border-radius: 4px; overflow: hidden;">
    <div style="background-color: #666; padding: 0 16px; height: 100%; display: flex; align-items: center; color: white; font-weight: bold; font-size: 14px; gap: 8px;">
      <img src="https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/apple.svg" width="20" height="20" alt="Apple" style="filter: brightness(0) invert(1);">
      Download For MacOS
    </div>
     </a>
</div>
<br>
<div style="display: flex; gap: 8px; height: 48px;">
  <a href="https://apps.microsoft.com/detail/9mtc0ct16xg1" style="text-decoration: none; display: flex; align-items: center; border-radius: 4px; overflow: hidden;">
    <div style="background-color: #666; padding: 0 16px; height: 100%; display: flex; align-items: center; color: white; font-weight: bold; font-size: 14px; gap: 8px;">
      <img src="https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/windows.svg" width="20" height="20" alt="Windows" style="filter: brightness(0) invert(1);">
      Download For Windows
    </div>
  </a>
</div>
<br>
<div style="display: flex; gap: 8px; height: 48px; ">
  <a href="https://illusions.app" target="_blank" style="text-decoration: none; display: flex; align-items: center; border-radius: 4px; overflow: hidden;">
    <div style="background-color: #666; padding: 0 16px; height: 100%; display: flex; align-items: center; color: white; font-weight: bold; font-size: 14px; gap: 8px;">
      <img src="https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/googlechrome.svg" width="20" height="20" alt="Chrome" style="filter: brightness(0) invert(1);">
      illusions on Chrome
    </div>
  </a>
</div>

</div>

---

### システム要件 / System Requirements

#### macOS
- **OS**: macOS 10.15 (Catalina) or later
- **Processor**: Intel または Apple Silicon
- **Memory**:  4 GB RAM 以上
- **Disk Space**: 1 GB 以上の空き容量

#### Windows
- **OS**: Windows 10 version 1909 以上 または Windows 11
- **Processor**: Intel または AMD (x64)
- **Memory**: 4 GB RAM 以上
- **Disk Space**: 1 GB 以上の空き容量
- **Note**: SmartScreen警告が表示される場合がありますが、これは署名なしアプリケーションの標準的な動作です

#### Chrome版 / Web Version
- **Browser**: Google Chrome 90+ (latest recommended)

---

## 🌐 公式サイト / Official Website

🌍 **Website**: https://www.illusions.app
📥 **Downloads**: https://www.illusions.app/downloads

Available for **macOS** (Intel & Apple Silicon) and **Windows** (installer or Microsoft Store).
Also runs in Chrome — visit [illusions.app](https://www.illusions.app) to try it online.

---

## ✨ Key Features

### エディタ / Editor
- **縦書き・横書き対応** — 日本語小説に最適なレイアウトを切り替え可能
- **Flexible panel layout** — Dockview-based multi-panel workspace; drag, split, and rearrange panels freely
- **Pop-out editor windows** — Detach any editor tab into a separate window for multi-monitor workflows
- **File diff view** — Side-by-side comparison of file versions directly in the editor
- **Multi-tab editing** — Work on multiple files simultaneously with persistent tab state
- **Empty editor placeholder** — Guided empty state when no file is open

### ターミナル / Terminal
- **Integrated terminal panel** — Full xterm.js terminal embedded in the editor (desktop only)
- **Multiple terminal tabs** — Open and manage several terminal sessions in parallel

### キーボード / Keyboard
- **Customizable keybindings** — Remap any command via the Keymap settings tab; bindings persist across sessions
- **Shortcut registry** — Centralized command-ID system for consistent shortcut management

### 校正・設定 / Linting & Settings
- **Japanese text linting** — Configurable rule-based linting with JSON-defined rule sets; preset support
- **Settings tabs**: Keymap, Linting, Typography, Vertical layout, Speech, Terminal, Position highlight, Power

### デスクトップ / Desktop
- **Desktop-only feature guards** — `DesktopOnlyDialog` gracefully blocks web-unsupported features
- **Download button component** — In-app prompt to download the desktop build when a desktop-only feature is accessed

---

## 🚀 Quick Start

### macOS
1. Download the `.dmg` file from [illusions.app/downloads](https://www.illusions.app/downloads)
2. Open the DMG and drag illusions to your Applications folder
3. Launch the app and start writing!

### Windows
1. Download the `.exe` installer from [illusions.app/downloads](https://www.illusions.app/downloads)
2. Run the installer
3. **Important**: You may see a Windows SmartScreen warning saying "Unknown Publisher"
   - This is normal for unsigned applications
   - Click **"More info"** → **"Run anyway"** to proceed with installation
4. Launch the app and start writing!

> **Tip**: To skip the SmartScreen warning, install from the **Microsoft Store** instead (search "illusions novel editor"). The Store listing is automatically published with every stable release, so it is always up-to-date.

**Why does Windows show this warning?**
- illusions is currently distributed without a Windows code signing certificate
- Code signing certificates cost $200-400/year for individual developers
- The app is completely safe and open-source - you can review the code on GitHub
- We plan to add code signing in the future as the project grows

---

## 🛠️ For Developers

#### Prerequisites
- Node.js 22+
- npm or yarn

#### Installation

```bash
# Clone the repository
git clone https://github.com/Iktahana/illusions.git
cd illusions

# Install dependencies
npm install

# Set up environment variables (for GitHub OAuth)
cp .env.local.example .env.local
# Edit .env.local and add your GitHub OAuth Client ID

# Run web development server
npm run dev
```

Open http://localhost:3000 in your browser.

#### GitHub OAuth Setup (Optional)

To enable GitHub authentication and cloud sync:

1. Create a GitHub OAuth App at https://github.com/settings/applications/new
2. Configure the OAuth App:
   - **Application name**: `illusions Novel Editor` (or your preferred name)
   - **Homepage URL**: `http://localhost:3000`
   - **Authorization callback URL**: `http://localhost:3000`
3. Copy the **Client ID** from the OAuth App page
4. Create a `.env.local` file in the project root:
   ```bash
   cp .env.local.example .env.local
   ```
5. Edit `.env.local` and replace `your_client_id_here` with your actual Client ID:
   ```
   GITHUB_CLIENT_ID=your_actual_client_id
   ```
6. Restart the development server

The GitHub avatar will appear at the bottom of the left sidebar, allowing you to log in and sync your work.

#### Electron Development

```bash
# Run Electron app in development mode
npm run electron:dev

# Build Electron app for production
npm run electron:build
```

#### Generate Dependency Credits

```bash
# Generate credits.json (list of production dependency licenses)
npm run generate:credits
```

The generated file is used in the "About illusions" page in Settings.

---

## 📂 Project Structure

```
illusions/
├── app/                      # Next.js App Router pages
│   ├── api/                  # API routes (NLP endpoints)
│   ├── globals.css           # Global styles & theme variables
│   └── page.tsx              # Main editor page
├── components/               # React components
│   ├── Editor.tsx            # Milkdown editor
│   ├── Explorer.tsx          # Left sidebar (file tree)
│   ├── Inspector.tsx         # Right sidebar (stats & tools)
│   ├── ActivityBar.tsx       # Left activity bar
│   └── explorer/             # Explorer sub-components
├── contexts/                 # React context providers
├── electron/                 # Electron main process
│   ├── main.js               # Main process entry
│   ├── preload.js            # Preload script (secure IPC)
│   ├── nlp/                  # NLP backend (kuromoji)
│   └── storage-ipc-handlers.js
├── lib/                      # Core libraries
│   ├── storage/              # Storage abstraction layer
│   ├── services/             # App services (history, notifications, etc.)
│   ├── linting/              # Japanese text linting framework
│   ├── keymap/               # Keyboard shortcut customization
│   ├── nlp-client/           # NLP client abstraction
│   ├── nlp-backend/          # NLP backend logic
│   ├── export/               # PDF/EPUB/DOCX export
│   ├── dockview/             # Panel layout (dockview-react adapter)
│   ├── hooks/                # React hooks
│   ├── project/              # Project management
│   ├── tab-manager/          # Multi-tab management
│   ├── vfs/                  # Virtual file system
│   └── utils/                # Utility functions
├── packages/                 # Internal packages
│   └── milkdown-plugin-japanese-novel/
├── www/                      # Landing page (Vite)
├── types/                    # TypeScript type definitions
├── scripts/                  # Build and utility scripts
└── docs/                     # Documentation
```

---

## 🛠️ Tech Stack

### Core
- **Next.js 16** - React framework with App Router
- **React 18** - UI library
- **TypeScript** - Type-safe development
- **Tailwind CSS 3** - Utility-first styling

### Editor
- **Milkdown 7** - WYSIWYG Markdown editor
- **ProseMirror** - Editor foundation
- **Kuromoji.js** - Japanese morphological analysis

### Storage
- **Dexie.js** - IndexedDB wrapper (Web)
- **better-sqlite3** - SQLite database (Electron)

### Layout & Terminal
- **dockview-react** - Flexible panel layout system
- **xterm.js + node-pty** - Integrated terminal panel

### Testing
- **Vitest** - Unit testing framework

### Desktop
- **Electron 32** - Cross-platform desktop app
- **electron-builder** - Build and packaging
- **electron-updater** - Auto-update support

---

## 🔒 Security

- **Token encryption**: OS-level encryption via Electron safeStorage (macOS Keychain / Windows DPAPI)
- **Context isolation**: Electron preload with secure IPC, sandbox enabled
- **IPC input validation**: Type and size checks on security-sensitive IPC handlers (VFS, NLP, file operations, context-menu)
- **Save-file path validation**: Directory traversal prevention, system path denylist, extension allowlist, and dialog-approval enforcement
- **Content Security Policy**: CSP headers enforced; `unsafe-eval` disabled in production
- **Navigation guards**: Blocks unexpected navigation and new-window creation
- **VFS sandboxing**: File system access restricted to approved project directories
- **HTTPS only**: All network requests use HTTPS

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please follow the code review standards in [CLAUDE.md](CLAUDE.md).

---

## 📝 License

GNU Affero General Public License v3.0 - See [LICENSE](LICENSE) file for details.

See also: [利用規約 / Terms of Service](TERMS.md) | [Online Policy Page](https://www.illusions.app/policy)

---

## 🙏 Acknowledgments

- **Milkdown** - Excellent Markdown editor framework
- **Kuromoji.js** - Japanese text tokenization
- **Electron** - Cross-platform desktop framework

---

## 📧 Contact

- **GitHub Issues**: https://github.com/Iktahana/illusions/issues
- **Website**: https://www.illusions.app

---

**Made with ❤️ for Japanese novelists**
