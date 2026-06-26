-- Bot 對話狀態表（用於新增紀錄的多輪對話）
CREATE TABLE IF NOT EXISTS bot_sessions (
  line_user_id  text PRIMARY KEY,
  state         text NOT NULL,
  data          jsonb DEFAULT '{}',
  updated_at    timestamptz DEFAULT now()
);
