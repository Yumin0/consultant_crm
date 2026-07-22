# Consultant CRM

顧問公司內部 CRM 系統。用於集中儲存所有客戶（企業主）的完整資料，讓任何顧問都能查閱彼此負責客戶的歷史記錄。

## 專案定位

- **資料入口一**：本專案網頁介面 → https://consultant-crm-teal.vercel.app/（Vercel 部署）
- **資料入口二**：Maiagent AI 助理（已串聯同一個 Supabase 資料庫）
- 兩個入口的資料最終都彙整到 Supabase，顧問可自由切換使用

儲存的客戶資料包含：費用方案、上課狀況、顧問協助記錄等重要互動歷史。

## 技術棧

- **框架**：Next.js 13（Pages Router）
- **語言**：TypeScript
- **資料庫**：Supabase（PostgreSQL）
- **部署**：Vercel
- **套件管理**：npm
- **GAS 管理**：clasp（`~/.npm-global/bin/clasp`）

## 本機開發

```bash
npm install
npm run dev   # http://localhost:3000
```

## 環境變數（.env.local）

```env
NEXT_PUBLIC_SUPABASE_URL=       # Supabase 專案 URL（前端可見）
NEXT_PUBLIC_SUPABASE_ANON_KEY=  # anon 公開金鑰（前端可見）
SUPABASE_SERVICE_ROLE_KEY=      # service role 金鑰（僅伺服器端，可繞過 RLS）
```

## 檔案結構

```
pages/
  index.tsx          # 主介面：表格選擇、資料瀏覽、CRUD、欄位顯示切換
  _app.tsx
  api/
    tables.ts        # GET：列出所有 Supabase 表格（從 OpenAPI spec 取得）
    schema.ts        # GET：取得指定表格的欄位定義與主鍵
    data.ts          # GET/POST/PUT/DELETE：對任一表格做 CRUD
lib/
  supabase.ts        # Supabase 客戶端（anon key，供前端直接使用）
styles/
  globals.css
gas/
  bop-line-chat/     # GAS 專案：LINE 群對話紀錄 Webhook
    程式碼.js         # 主程式（clasp 管理）
    appsscript.json
```

## API 說明

所有 API 路由使用 `SUPABASE_SERVICE_ROLE_KEY`（繞過 RLS），前端資料流全部走 `/api/*`。

| 路由 | 方法 | 說明 |
|------|------|------|
| `/api/tables` | GET | 列出所有表格名稱 |
| `/api/schema?table=<表格名>` | GET | 回傳欄位清單與主鍵（`primaryKeys`, `columns`） |
| `/api/data?table=<表格名>` | GET | 讀取資料（最多 200 筆） |
| `/api/data?table=<表格名>` | POST | 新增一筆資料（空字串欄位自動略過，讓 DB 套用預設值） |
| `/api/data?table=<表格名>` | PUT | 依主鍵更新資料（body: `{ pkValues, row }`） |
| `/api/data?table=<表格名>` | DELETE | 依主鍵刪除資料（body: `{ pkValues }`） |

## 主要功能

- 下拉選單選擇表格，按「載入」讀取資料
- 表格支援新增、編輯、刪除（需有主鍵欄位）
- 欄位顯示/隱藏切換，設定值儲存於 localStorage（key: `crm_hidden_cols_<表格名>`）
- 主鍵欄位在新增時可留空（由 DB 自動產生），編輯時唯讀
- 表格名稱可能為中文（Supabase 支援 Unicode 表名）

## Google Apps Script（GAS）管理

LINE 群對話紀錄透過 GAS Webhook 同時寫入 Google Sheets 和 Supabase。

### GAS 修改後的部署原則

修改 `gas/` 下的程式碼後，**不需等使用者詢問**，應主動判斷是否執行 push 和 deploy：
- 若是功能修改或 bug fix → 直接 push + deploy，告知版本號
- 若只是結構調整、尚未確認邏輯 → 先說明，確認後再部署

### clasp 工作流程

```bash
cd gas/bop-line-chat

~/.npm-global/bin/clasp pull                          # 從 GAS 拉最新程式碼
~/.npm-global/bin/clasp push                          # 推本機修改到 GAS
~/.npm-global/bin/clasp deploy --deploymentId <id>    # 更新現有部署
~/.npm-global/bin/clasp deployments                   # 查看所有部署版本
```

### GAS 專案資訊

- **Script ID**：`1ALRNFypB8NSr_0AKapfm_WsHTDxQnNcUY5Ks-JbOhra9Wh9EYX14KRyj`
- **正式 Deployment ID**：`AKfycbxgPASWdupCXzguUhZjw1DP6mQf6vI4jatGPwth6O9bMm4kBmI9MMYc-zKDNyoi6B56mw`
- **目前版本**：@12

### GAS 寫入 Supabase 注意事項

- 表格名稱含中文與空格，URL 必須用 `encodeURIComponent(SUPABASE_TABLE)`
- 時間戳格式：`new Date(new Date(ts).getTime() + 8*3600000).toISOString().replace('T',' ').slice(0,19)` → `2026-06-26 15:08:38`（GMT+8 本地時間，無時區標記）

## Supabase 資料表說明

| 表格名稱 | 說明 | 主鍵 | 時間戳型別 |
|----------|------|------|-----------|
| `BOP LINE群對話紀錄` | LINE 群組對話紀錄，由 GAS Webhook 寫入 | 無（待補） | `timestamp`（GMT+8） |
| `customers` | 客戶基本資料 | - | - |
| `企業主別名對照表` | 企業主別名對照 | - | - |
| `線上All企業主總表` | 所有企業主彙整 | - | - |

### BOP LINE群對話紀錄 欄位

`時間戳`（timestamp）、`使用者ID`、`發送者`、`身份`（顧問/企業主/財務人員）、`訊息類型`、`訊息內容`、`備註`、`群組`

主鍵欄位 `id`（BIGINT IDENTITY）已存在。`時間戳` 有 DESC 索引加速查詢。

## 注意事項

- `lib/supabase.ts` 使用 anon key，目前主程式的 CRUD 操作都走 `/api/*` 而非直接呼叫此 client
- 修改 API 路由時須確保仍使用 `SUPABASE_SERVICE_ROLE_KEY`，不要改成 anon key（會被 RLS 擋住）
- 不要新增會將 `SUPABASE_SERVICE_ROLE_KEY` 暴露到前端的程式碼
- 資料筆數上限為 200（`/api/data` 的 `.limit(200)`），如需調整請修改 `pages/api/data.ts`
- **任何 UI／LINE Flex Message 選色前，先讀 `docs/brand-colors.md` 的公司用色規範**，不要用不在清單內的顏色（例如常見 Tailwind 鮮豔藍 `#1d4ed8`、`#2563eb`）
