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

##### macOS
1. Download the `.dmg` file from [GitHub Releases](https://github.com/Iktahana/illusions/releases/latest)
2. Open the DMG and drag illusions to your Applications folder
3. Launch the app and start writing!

##### Windows
1. Download the `.exe` installer from [GitHub Releases](https://github.com/Iktahana/illusions/releases/latest)
2. Run the installer
3. **Important**: You may see a Windows SmartScreen warning saying "Unknown Publisher"
   - This is normal for unsigned applications
   - Click **"More info"** → **"Run anyway"** to proceed with installation
4. Launch the app and start writing!

**Why does Windows show this warning?**
- illusions is currently distributed without a Windows code signing certificate
- Code signing certificates cost $200-400/year for individual developers
- The app is completely safe and open-source - you can review the code on GitHub
- We plan to add code signing in the future as the project grows

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

GNU Affero General Public License v3.0 - See [LICENSE](LICENSE) file for details.

See also: [利用規約 / Terms of Service](TERMS.md) | [Online Policy Page](https://www.illusions.app/policy)

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

## ❓ FAQ / よくある質問

### Windows: "不明な発行元" / "Unknown Publisher" 警告について

**Q: Windows でインストール時に「不明な発行元」と表示されます。安全ですか？**

**A:** はい、安全です。この警告は、アプリケーションが Microsoft の認証を受けた署名がないために表示されます。

**原因**:
- コード署名証明書は年間 $200-400 の費用がかかります
- 個人開発プロジェクトのため、現時点では署名を購入していません
- すべてのソースコードは GitHub で公開されており、誰でも確認できます

**インストール方法**:
1. インストーラーをダブルクリック
2. 「Windows によって PC が保護されました」と表示される
3. 「詳細情報」をクリック
4. 「実行」ボタンをクリック
5. インストールが開始されます

**セキュリティについて**:
- ✅ オープンソース（コードは GitHub で公開）
- ✅ GitHub Actions で自動ビルド
- ✅ マルウェアスキャン済み
- ✅ コミュニティによるコードレビュー

将来的には、プロジェクトの成長に伴いコード署名証明書を取得する予定です。

---

**Q: Windows shows "Unknown Publisher" warning during installation. Is it safe?**

**A:** Yes, it's completely safe. This warning appears because the app doesn't have a Microsoft-verified signature.

**Why this happens**:
- Code signing certificates cost $200-400/year
- As an individual developer project, we haven't purchased signing yet
- All source code is public on GitHub and can be reviewed by anyone

**How to install**:
1. Double-click the installer
2. When you see "Windows protected your PC", click **"More info"**
3. Click **"Run anyway"**
4. Installation will proceed normally

**Security**:
- ✅ Open source (code publicly available on GitHub)
- ✅ Built automatically with GitHub Actions
- ✅ Malware scanned
- ✅ Community code reviewed

We plan to obtain a code signing certificate as the project grows.

---

**Made with ❤️ for Japanese novelists**
