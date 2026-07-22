-- ================================================================
-- Phase 2-B: 快速紀錄 5 大類改版 + 顧問角色欄位（敏感資料權限用）
-- 依 2026-07-22 與 Chloe Yang 需求文件對齊後的決策彙整，詳見 docs/project-spec.md
-- 請在 Supabase Dashboard > SQL Editor 執行此檔案（尚未執行，先供 Yumin 確認）
-- ================================================================

-- ----------------------------------------------------------------
-- 1. 顧問角色欄位（敏感資料查詢權限用，先做兩層：顧問／專家）
-- ----------------------------------------------------------------
ALTER TABLE consultants
    ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT '顧問'
        CHECK (role IN ('顧問', '專家'));

-- 依現有 expert_id 關聯，把曾經被指派為某客戶「專家」的顧問，角色標記為「專家」
-- （這只是初始值，之後角色異動請直接改 consultants.role，不需要靠 expert_id 反推）
UPDATE consultants c
SET role = '專家'
WHERE EXISTS (
    SELECT 1 FROM "線上All企業主總表" t WHERE t.expert_id = c.id
);

-- ----------------------------------------------------------------
-- 2. log_categories 改版：新增 5 大類，舊 6 類標記封存（不刪除，歷史紀錄照舊可查）
-- ----------------------------------------------------------------
ALTER TABLE log_categories
    ADD COLUMN IF NOT EXISTS is_archived  boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_sensitive boolean NOT NULL DEFAULT false;

-- 舊 6 類封存：不再出現在「新增紀錄」選單，但歷史紀錄的 category_id 不變、名稱照樣查得到
UPDATE log_categories
SET is_archived = true
WHERE name IN ('心理狀態', '員工狀況', '公司狀況', '上課狀況', '財務狀況', '其他');

-- 新增 5 大類（sort_order 接續在後面）
INSERT INTO log_categories (name, icon, sort_order, is_sensitive) VALUES
    ('現在課程進度',           '📚', 11, false),
    ('診斷與顧問觀點',         '🩺', 12, false),
    ('核心行動計畫－客戶端',   '🎯', 13, false),
    ('長期追蹤與顧問待辦',     '🗂️', 14, false),
    ('敏感資料（不公開）',     '🔒', 15, true)
ON CONFLICT (name) DO NOTHING;

-- ----------------------------------------------------------------
-- 驗證：執行後應看到 5 個新分類（is_archived = false）+ 6 個舊分類（is_archived = true）
-- ----------------------------------------------------------------
SELECT id, name, is_archived, is_sensitive, sort_order
FROM log_categories
ORDER BY is_archived, sort_order;

-- 驗證：各顧問的角色分佈
SELECT role, COUNT(*) FROM consultants GROUP BY role;

-- ================================================================
-- 應用層待辦 — 已於 2026-07-22 完成，此區塊保留作為紀錄：
--   1. ✅ pages/api/line/webhook.ts「新增紀錄」流程改為先選類別（buildCategoryQuickReply），
--      只列 is_archived = false 的類別；pages/api/crm/categories.ts（獨立網頁版）仍列全部，未改
--   2. ✅ webhook.ts 的 'view' case：category.is_sensitive = true 的紀錄，
--      非 role = '專家' 的顧問查看時整條不顯示
--   3. ✅ lib/notify.ts（notifyClientLog / notifyNewClient）
--      已改成只通知該客戶的 consultant_id／expert_id，不再廣播給全部已綁定顧問
-- ================================================================
