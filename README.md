# Supabase Checker (minimal)

簡單的 Next.js 前端，用來連線 Supabase 並在本機顯示指定表格的前幾筆資料。

快速開始

1. 複製檔案，安裝相依套件：

```bash
npm install
```

2. 建立本機環境變數檔案 `.env.local`，內容如下：

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

3. 啟動開發伺服器：

```bash
npm run dev
```

4. 開啟瀏覽器 `http://localhost:3000`，在輸入框輸入表格名稱（例如 `customers`）並按「載入」。

說明

- 主要檔案：`pages/index.tsx`（輸入表格名稱並顯示資料）、`lib/supabase.ts`（Supabase client）
- 先實作最基本的資料讀取與呈現功能，後續會再加入欄位篩選與缺漏檢查功能。
