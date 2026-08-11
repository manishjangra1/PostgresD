# PostgresD Release Notes 🐘

## Version 0.1.1 (Stable Release)

This release focuses on pixel-perfect layout alignments, auto-stretching components, theme control integration, and native compilation pipelines for cross-platform releases.

### 🌟 New Features & Enhancements

* **Double-Row Header & Footer Alignment**:
  * The Database selector height matches the Tab Bar height (`36px`).
  * The explorer Schemas list header matches the Workspace title header (`68px`).
  * The connection status bar matches the DataGrid pagination row (`48px`).
* **Auto-Stretching Explorer**: Refactored the tables list container to use dynamic CSS flexbox layouts, removing hardcoded heights so the table nodes list expands fully to cover empty space.
* **Connection Bar Theme Switcher**: Integrated a Light/Dark theme switcher (Sun/Moon button) directly inside the sidebar connection footer.
* **App Shell Branding**: Replaced default index.html metadata title and shortcut icon references with `PostgresD` and the custom squircle logo asset.
* **GitHub Release Pipelines**: Created a CI/CD build pipeline (`.github/workflows/release.yml`) to automatically compile and package the app for macOS, Windows, and Linux.

---

## Version 0.1.0 Stable

We are excited to announce the initial release of **PostgresD**, a modern, lightweight desktop client for PostgreSQL built with Tauri, React, and Rust. This release focuses on high-performance database browsing, Prisma Studio-style relational previews, secure storage, and pixel-perfect design alignment.

---

### 🚀 Key Features

#### 1. Interactive Data Grid & CRUD (Prisma Studio Style)
* **Double-Click Cell Editing**: Edit cell values inline with change accumulation and a clear pending changes drawer.
* **Selection Checkboxes**: Row selection checkboxes with a master select-all header for page-level actions.
* **Fast Row Deletion**: Mark and execute row deletions directly from the grid controls.

#### 2. Relational Previews & Navigation
* **Outgoing Foreign Key Badges**: Physical foreign key values render as primary links with `FK` markers. Clicking them queries the database and shows the parent record details.
* **Incoming Sub-Relation Counters**: Virtual columns render row counts of child records referencing the target row. Clicking the badge queries all referencing child rows.
* **Dual-Layout Overlay Modal**: 
  * If a query returns a **single record**, it displays as a structured vertical key-value list.
  * If a query returns **multiple records**, it renders as a horizontal data table with scroll controls.

#### 3. Flexible Multi-Format Exports
* Replaced simple exports with an **Export dropdown menu**.
* **Target Scopes**: Export only selected rows or the entire database table.
* **Supported Formats**: Export directly to **JSON** or **Excel/CSV** format.
* **Excel Compatibility**: Automatically prefixes a UTF-8 BOM (`\uFEFF`) to prevent special character corruption inside Microsoft Excel.

#### 4. Right-Click Context Menu
* Added context-aware options when right-clicking on any grid data cell:
  * **Copy Cell Value**: Copies the exact string or JSON value to the clipboard.
  * **Copy Entire Row (JSON)**: Serializes the entire row object (omitting virtual count fields) to clipboard.

#### 5. Layout Symmetry & Alignment
* **Pixel-Aligned Header Rows**:
  * The top database selector matches the height of the tab bar (`36px`).
  * The schemas list section header matches the height of the table title header bar (`68px`).
* **Symmetrical Status Bar Footer**: The connection details banner matches the height of the DataGrid pagination row (`48px`), aligning all top and bottom boundaries.
* **Compact, Scroll-Free forms**: The edit connection managers sit flat on the workspace page, using tight layouts to prevent unnecessary vertical scrollbars.
* **Auto-Stretching Explorer**: The tables list stretching handles empty space automatically and goes all the way to the footer.

#### 6. Theme Change Support
* Added a dedicated Sun/Moon theme switcher button in the connection status footer to instantly switch between **Light Mode** and **Dark Mode** across the entire app.

---

### 🔧 Tech Stack
* **Frontend**: React 19, TypeScript, Vite, Monaco Editor, TailwindCSS.
* **Backend**: Rust 1.75+, Tauri v1, SQLx, keyring-rs, rfd (save dialogs).
