# illusions - 日本語小説エディタ

縦書き、ルビ、AI校正支援。Windows, macOS, Chromeで動作する執筆環境。文章分析から校正まで、小説家のための機能を凝縮。

A professional-grade Japanese novel editor with vertical writing, ruby notation, and AI proofreading support.

## 🌐 オンラインで試す / Try It Online

**🌍 ランディングページ**: https://www.illusions.app/
**Chrome版**: https://illusions.app/
(Works on latest Chrome/Edge/Safari)

**デスクトップ版**: [Download Latest Release](https://github.com/Iktahana/illusions/releases/latest)
Available for macOS (Intel & Apple Silicon) and Windows

---

## ✨ Key Features

### 📝 Editor
- **Milkdown-based Markdown editor** with real-time preview
- **Vertical writing mode** (縦書き) for traditional Japanese novels
- **Ruby notation support** (ルビ) - furigana for kanji
- **Tate-chu-yoko** (縦中横) - horizontal text in vertical writing
- **AI proofreading support** - grammar and style suggestions
- **Auto-save** every 2 seconds
- **Japanese NLP** integration for text analysis
- **POS (Part-of-Speech) highlighting** for Japanese grammar review
- **Word frequency analysis** for vocabulary insights

### 🎨 Interface
- **Three-column layout**: Explorer | Editor | Inspector
- **Activity Bar**: Quick access to Projects, GitHub, Settings
- **Theme system**: Automatic light/dark mode support
- **Responsive design**: Optimized for various screen sizes

### 💾 Storage & Sync
- **Dual-mode storage**:
  - **Electron**: SQLite (fast, unlimited)
  - **Web**: IndexedDB (browser-native)
- **GitHub integration**: Cloud sync with full version history
- **Recent files**: Quick access to last 10 documents
- **Crash recovery**: Auto-restore unsaved content

### 📊 Productivity
- **Statistics panel**: Character count, word count, manuscript pages (原稿用紙)
- **Composition settings**: Font, size, line height, spacing
- **Version history**: Browse and restore previous versions
- **Diff viewer**: Compare changes between versions

### 🔧 Advanced Features
- **GitHub OAuth**: Device flow authentication
- **Auto-commit & push**: Automatic version control
- **Branch & tag management**: Organize your writing milestones
- **Cross-platform**: Electron app works on macOS, Windows, Linux

---

## 🚀 Quick Start

### For Users

#### Chrome版 / Web Version
Simply visit https://illusions.app/ in your browser.

#### Desktop Version
1. Download the latest release from [GitHub Releases](https://github.com/Iktahana/illusions/releases/latest)
2. Install and launch the app
3. Start writing!

### For Developers

#### Prerequisites
- Node.js 18+ 
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
│   ├── Explorer.tsx          # Left sidebar
│   ├── Inspector.tsx         # Right sidebar
│   ├── ActivityBar.tsx       # Left activity bar
│   └── github/               # GitHub integration UI
├── lib/                      # Core libraries
│   ├── storage-service.ts    # Storage factory
│   ├── electron-storage.ts   # Electron storage provider
│   ├── web-storage.ts        # Web storage provider
│   ├── nlp-client/           # NLP client abstraction
│   ├── git/                  # Git service (isomorphic-git)
│   ├── github/               # GitHub API integration
│   └── hooks/                # React hooks
├── nlp-service/              # Electron NLP backend
├── types/                    # TypeScript type definitions
├── docs/                     # Documentation
└── main.js                   # Electron main process
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

### Storage & Sync
- **Dexie.js** - IndexedDB wrapper (Web)
- **better-sqlite3** - SQLite database (Electron)
- **isomorphic-git** - Git implementation in JavaScript
- **@octokit/rest** - GitHub API client

### Desktop
- **Electron 32** - Cross-platform desktop app
- **electron-builder** - Build and packaging
- **electron-updater** - Auto-update support

---

## 📖 Documentation

- **[Quick Start Guide](docs/guides/QUICKSTART.md)** - Get started in 5 minutes
- **[Storage Documentation](docs/STORAGE.md)** - Storage architecture and API
- **[NLP Backend Architecture](docs/architecture/nlp-backend-architecture.md)** - Japanese text processing
- **[Notification System](docs/architecture/notification-system.md)** - Toast notification API
- **[Theme Colors Guide](docs/guides/THEME_COLORS.md)** - Theming system

---

## 🎯 Features Roadmap

### Current Release (v0.1.0)
- ✅ Milkdown editor with vertical writing
- ✅ Ruby notation (ルビ) support
- ✅ Tate-chu-yoko (縦中横) support
- ✅ AI proofreading support
- ✅ Auto-save and crash recovery
- ✅ Storage abstraction (Electron + Web)
- ✅ GitHub integration with OAuth
- ✅ Version history and diff viewer
- ✅ Japanese NLP backend
- ✅ POS highlighting
- ✅ Word frequency analysis
- ✅ Landing page with SEO optimization

### Planned
- [ ] Real-time collaboration
- [ ] Advanced AI grammar and style checking
- [ ] Export to PDF/EPUB
- [ ] Custom themes and fonts
- [ ] Plugin system
- [ ] Mobile app (iOS/Android)

---

## 🔒 Security

- **Token encryption**: GitHub tokens encrypted with AES
- **Context isolation**: Electron preload with secure IPC
- **No hardcoded secrets**: All sensitive data stored securely
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

MIT License - See [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **Milkdown** - Excellent Markdown editor framework
- **Kuromoji.js** - Japanese text tokenization
- **isomorphic-git** - Pure JavaScript Git implementation
- **Electron** - Cross-platform desktop framework

---

## 📧 Contact

- **GitHub Issues**: https://github.com/Iktahana/illusions/issues
- **Website**: https://www.illusions.app
- **Chrome版**: https://illusions.app

---

**Made with ❤️ for Japanese novelists**
