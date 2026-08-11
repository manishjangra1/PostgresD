# PostgresD 🐘

PostgresD is a modern, lightweight, and blazingly fast desktop PostgreSQL client and database viewer. Built with **Tauri**, **React (TypeScript)**, and **Rust**, it combines the safety and speed of a native desktop application with the rich user experience of a modern web interface.

---

## ✨ Features

### 🔍 Interactive Data Grid (Prisma Studio Style)
* **Full CRUD Operations**: Create, update, and delete rows in place with a clear, visual pending changes checklist before committing.
* **Foreign Key Previews**: Outgoing foreign keys are rendered as interactive badges. Clicking them launches a custom **Reference Viewer** showing the parent record details.
* **Sub-Relation Lists**: Virtual columns show counts of incoming references (e.g., `User` has `Account []` or `AuditLog []`). Clicking them queries and loads all related records in a scrollable table detail sheet.
* **Multi-Select & Bulk Operations**: Checkboxes on rows allow selecting specific rows to perform batch actions.
* **Stretchable Columns & Programmatic Chevrons**: Easily stretch columns to inspect large data values, and scroll tab items with arrow indicators.

### 📊 Flexible Multi-Format Exports
* Export selected rows or the entire table to **JSON** or **Excel / CSV** format.
* Export files include a **UTF-8 Byte Order Mark (BOM)** to guarantee Microsoft Excel renders foreign characters and encodings correctly.

### 📝 SQL Query Editor Workspace
* Open clean, multi-tab SQL Query Editor workspaces directly next to the grid.
* Write custom SQL with syntax highlighting, run queries asynchronously, and cancel active queries on demand.
* Detailed stats showing affected rows and execution times.

### 🔐 Secure Password Storage
* Integrates directly with your operating system's native keychain (Keychain on macOS, Credential Manager on Windows, Secret Service on Linux) to store connection passwords securely.

### 🎨 Visual & Layout Excellence
* **Themes**: Instantly switch between Light and Dark mode with a single toggle button in the footer.
* **Symmetry & Alignment**: Clean double-row top header bars (tab-bar and table-detail header) and bottom pagination footer align perfectly with the explorer sidebar rows.
* **Minimalist Sidebar**: Keep explorer clean with database selector dropdowns at the top and environment indicator dot / disconnect button in the footer.

---

## 🛠️ Technology Stack

* **Frontend**: React, TypeScript, Vite, TanStack Query, TailwindCSS, Monaco Editor (SQL Query UI), Lucide Icons.
* **Backend**: Rust, Tauri (Desktop shell & IPC wrapper), SQLx (High-performance asynchronous PostgreSQL pool), keyring-rs (Secure native password storage).

---

## 🚀 Getting Started

### Prerequisites
Make sure you have the following installed on your machine:
* **Node.js** (v18 or higher)
* **Rust & Cargo** (via [rustup](https://rustup.rs/))
* System dependencies for Tauri compilation (refer to the official [Tauri Setup Guide](https://tauri.app/v1/guides/getting-started/prerequisites)).

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/postgresd.git
   cd postgresd
   ```

2. **Install frontend dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment (Optional):**
   Create a `.env` file in the root folder if you need local environment variables for dev:
   ```env
   # Example
   DATABASE_URL="postgresql://username:password@localhost:5432/dbname"
   ```

---

## 💻 Development & Building

### Run the App in Development Mode
To launch the hot-reloading development app:
```bash
npm run tauri dev
```

### Build the Production Application Bundle
To build a highly optimized, single-executable production package (dmg, app, exe, or deb depending on your host OS):
```bash
npm run tauri build
```
Built binaries and installers are output to:
`src-tauri/target/release/bundle/`

---

## 📂 Project Structure

```text
├── src/                      # Vite + React + TypeScript Frontend
│   ├── components/           # Reusable UI components (DataGrid, Sidebar, Layout)
│   ├── features/             # App views (ConnectionManager, TableView, SQLEditor)
│   ├── lib/                  # API clients and Tauri command wrappers
│   └── stores/               # Zustand UI stores (active connection state, tabs, themes)
│
├── src-tauri/                # Tauri + Rust Desktop Backend
│   ├── src/
│   │   ├── commands/         # IPC bridge endpoints invoked by the frontend
│   │   ├── database/         # PostgreSQL connection pool and query helpers
│   │   └── credentials/      # Native keychain password managers
│   └── Cargo.toml            # Rust cargo package manifest
│
└── package.json              # NPM package configurations
```

---

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
