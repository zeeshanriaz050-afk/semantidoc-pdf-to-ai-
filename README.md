# SemantiDoc - PDF to AI Structured JSON & Study Assistant 🚀

Transform unstructured PDFs into semantic, AI-ready JSON knowledge bases, 1-Line Bite-Sized Summaries, Study Flashcards, and Voice-Enabled Copilot.

---

## 📥 How to Run in VS Code (مرحلہ وار طریقہ / Step-by-Step Guide)

### 1️⃣ Prerequisites (ضروری چیزیں)
Make sure you have installed on your computer:
1. **Node.js** (v18, v20 or newer recommended):
   - Download from [https://nodejs.org](https://nodejs.org) (LTS version)
2. **VS Code** (Visual Studio Code):
   - Download from [https://code.visualstudio.com](https://code.visualstudio.com)

---

### 2️⃣ Step 1: Open Project in VS Code
1. Extract the downloaded `.zip` file if you downloaded a zip archive.
2. Open **VS Code**.
3. Click **File** -> **Open Folder...** (یا `Ctrl + K, Ctrl + O`).
4. Select the extracted project folder.

---

### 3️⃣ Step 2: Open Terminal in VS Code
- Open the built-in terminal:
  - Menu: **Terminal** -> **New Terminal** (یا شارٹ کٹ: `` Ctrl + ` ``)

---

### 4️⃣ Step 3: Install Dependencies
Run the following command in the terminal to install all required packages:
```bash
npm install
```

---

### 5️⃣ Step 4: Setup Environment Variables (`.env`)
1. Create a `.env` file in the root directory (or copy from `.env.example`):
```bash
cp .env.example .env
```
2. Open `.env` and add your **Google Gemini API Key**:
```env
GEMINI_API_KEY=AIzaSy...your_gemini_api_key_here
PORT=3000
```
> 💡 *Note: You can get a free Gemini API Key from [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey).*

---

### 6️⃣ Step 5: Start the Development Server
Run this command in the VS Code terminal:
```bash
npm run dev
```

---

### 7️⃣ Step 6: Open in Browser
Once running, open your web browser (Chrome, Edge, etc.) and go to:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 🛠️ Available NPM Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts full-stack server (Express backend + Vite React frontend on port 3000) |
| `npm run build` | Builds the React frontend production bundle into `dist` |
| `npm run lint` | Checks TypeScript compilation without emitting files |
| `npm run clean` | Cleans previous build artifacts |

---

## 💡 Troubleshooting (عام مسائل اور ان کا حل)

- **Port 3000 already in use?**
  - Change `PORT=3001` in your `.env` file or kill the existing process on port 3000.
- **Node version error?**
  - Verify your node version with `node -v`. Ensure it is Node 18 or 20+.
- **Missing modules?**
  - Delete `node_modules` and run `npm install` again.
