# Illusions - 日本語小説エディター

A professional-grade Japanese novel editor built with Next.js, Milkdown, and Tailwind CSS.

Web(Only work on latest version Chrome):
https://illusions.iktahana.com/

MacOS/Windows:
[Latest](https://github.com/Iktahana/illusions/releases/latest)

## Features

### 📝 Core Editor
- **Milkdown** - Powerful Markdown-based editor
- **Vertical Writing** - Native Japanese 縦書き support with `isVertical` state
- **Real-time Preview** - Instant markdown rendering
- **Auto-save** - Automatic document saving

### 🎨 Layout
- **Three-Column Design** - Explorer, Editor, Inspector
- **Navbar** - Logo, document title, save status, user avatar
- **Responsive** - Optimized for different screen sizes

### 📚 Explorer (Left Sidebar)
- Chapter management (tree structure)
- Novel settings (title, author, description)
- Style customization (font, size, line height)

### 🤖 Inspector (Right Sidebar)
- AI Assistant (placeholder for API integration)
- Real-time corrections (duplicates, typos)
- Statistics (word count, character count)
- **Manuscript Pages** - Japanese 原稿用紙 calculation (chars/400)

### 🔧 Architecture

#### Storage Adapter Interface
Extensible storage system with `StorageAdapter` interface:

```typescript
interface StorageAdapter {
  initialize(): Promise<void>;
  save(document: NovelDocument): Promise<void>;
  load(documentId: string): Promise<NovelDocument | null>;
  list(): Promise<NovelDocument[]>;
  delete(documentId: string): Promise<void>;
  isConnected(): boolean;
}
```

Future implementations:
- Google Drive integration
- Synology NAS sync
- Local file system

## Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Project Structure

```
illusions/
├── app/
│   ├── globals.css          # Global styles with vertical writing support
│   ├── layout.tsx           # Root layout
│   └── page.tsx             # Main editor page
├── components/
│   ├── Navbar.tsx           # Top navigation bar
│   ├── Explorer.tsx         # Left sidebar (chapters, settings, style)
│   ├── Inspector.tsx        # Right sidebar (AI, corrections, stats)
│   └── Editor.tsx           # Milkdown editor with vertical writing
├── lib/
│   ├── storage-adapter.ts   # Storage interface and mock implementation
│   └── storage-context.tsx  # React context for storage
└── package.json
```

## Technologies

- **Next.js 15** - App Router
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Milkdown 7** - Editor framework
- **Tailwind CSS 3** - Styling
- **Lucide React** - Icon library

## Vertical Writing Mode

The editor supports Japanese vertical writing (縦書き) through the `isVertical` state:

```tsx
<div className={isVertical ? "vertical-writing overflow-x-auto" : ""}>
  {/* Editor content */}
</div>
```

CSS implementation:
```css
.vertical-writing {
  writing-mode: vertical-rl;
  text-orientation: upright;
}
```

## Development

### Adding Storage Providers

Implement the `StorageAdapter` interface:

```typescript
export class GoogleDriveAdapter implements StorageAdapter {
  async initialize() { /* ... */ }
  async save(document: NovelDocument) { /* ... */ }
  async load(documentId: string) { /* ... */ }
  async list() { /* ... */ }
  async delete(documentId: string) { /* ... */ }
  isConnected() { /* ... */ }
}
```

### Customizing UI

The design uses a clean, minimal aesthetic similar to Notion:
- Slate-50 background
- Simple borders
- Focus on content
- Professional typography

## License

MIT License - See LICENSE file for details

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## Roadmap

- [ ] Google Drive integration
- [ ] Synology NAS support
- [ ] AI assistant API integration
- [ ] Advanced grammar checking
- [ ] Export to PDF/EPUB
- [ ] Collaborative editing
- [ ] Dark mode
- [ ] Mobile responsive design
