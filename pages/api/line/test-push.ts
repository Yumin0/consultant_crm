// 臨時測試用端點，測試完請刪除此檔案
// 使用方式：
//   GET /api/line/test-push?name=Yumin
//     → 直接推播測試通知給指定顧問
//   GET /api/line/test-push?simulate=1&clientId=<id>&addedBy=<consultantId>
//     → 模擬 notifyClientLog（用真實邏輯推播）
//   GET /api/line/test-push?preview=profile&name=<顧問名>
//     → 推播「企業主介紹卡」4張主題卡原型（假資料，樣式確認用）

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { pushMessage, buildLogNotificationFlex, buildClientProfileCarousel } from '../../../lib/line-reply'
import { notifyClientLog } from '../../../lib/notify'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { name, simulate, clientId, addedBy, preview } = req.query

  // ── 企業主介紹卡原型預覽：推播 4 張主題卡假資料，供樣式確認 ────────────────
  if (preview === 'profile') {
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: '請加 &name=<顧問名稱>' })
    }
    const { data: consultant } = await supabase
      .from('consultants')
      .select('name, line_user_id')
      .ilike('name', `%${name}%`)
      .not('line_user_id', 'is', null)
      .maybeSingle()

    if (!consultant?.line_user_id) {
      return res.status(404).json({ error: `找不到已綁定 LINE 的顧問「${name}」` })
    }

    const msg = buildClientProfileCarousel('陳慕珊', 'OO食品', [
      {
        icon: '📅',
        title: '基礎背景與學習頻率',
        color: '#4F5E72',
        lines: [
          '・合約期間：2026/01/01 - 12/31',
          '・本週學習：上線 3 次／閱讀 1.5 小時',
          '・最新課程：BOP 模組四【溝通系統】',
        ],
      },
      {
        icon: '🎉',
        title: '最近的好消息',
        color: '#7E96B9',
        lines: [
          '・司機團隊正式開始使用職務說明書。',
          '・同仁「芝芝」讀書會表現主動具潛力。',
        ],
      },
      {
        icon: '🚨',
        title: '最近的公司狀態',
        color: '#ADCFFF',
        textOnLight: true,
        lines: [
          '・新採購助理 7/6 已順利就任。',
          '・司機酒駕吊照轉倉管，目前急缺一司機。',
        ],
      },
      {
        icon: '🎯',
        title: '最近的行動計畫',
        color: '#CEE2FF',
        textOnLight: true,
        lines: [
          '・☐ 8/10前：公告並籌備組織圖會議。',
          '・☐ 8月前：要求 Nelson 提報 KPI 方案。',
        ],
        newLogClientId: 0,
      },
    ])

    await pushMessage(consultant.line_user_id, [msg])
    return res.status(200).json({ ok: true, sentTo: consultant.name })
  }

  // ── 模擬模式：直接呼叫 notifyClientLog（與正式流程完全相同）──────────────
  if (simulate === '1') {
    if (!clientId) {
      const { data: clients } = await supabase
        .from('線上All企業主總表')
        .select('id, "1. 企業主名", consultant_id')
        .order('id').limit(30)
      return res.status(200).json({ hint: '請加 &clientId=<id>&addedBy=<consultantId>', clients })
    }

    await notifyClientLog(
      Number(clientId),
      { content: '[模擬測試] 淑雯新增了一筆互動紀錄', priority: 'normal' },
      typeof addedBy === 'string' ? addedBy : null,
    )
    return res.status(200).json({ ok: true, message: '已執行 notifyClientLog，請查看 LINE' })
  }

  // ── 直接推播模式 ─────────────────────────────────────────────────────────
  if (!name || typeof name !== 'string') {
    const { data } = await supabase
      .from('consultants')
      .select('name, line_user_id')
      .not('line_user_id', 'is', null)
      .order('name')
    return res.status(200).json({
      usage: '?name=<顧問名稱> 或 ?simulate=1&clientId=<id>&addedBy=<consultantId>',
      boundConsultants: (data ?? []).map(c => c.name),
    })
  }

  const { data: consultant } = await supabase
    .from('consultants')
    .select('name, line_user_id')
    .ilike('name', `%${name}%`)
    .not('line_user_id', 'is', null)
    .maybeSingle()

  if (!consultant?.line_user_id) {
    return res.status(404).json({ error: `找不到已綁定 LINE 的顧問「${name}」` })
  }

  const fakeClient = { id: 0, '1. 企業主名': '測試企業主', '2. 公司名稱': '測試股份有限公司' }
  const fakeLog = { content: '這是一則測試推播，確認新互動紀錄通知功能正常運作。', priority: 'normal' }
  await pushMessage(consultant.line_user_id, [buildLogNotificationFlex(fakeClient, fakeLog, '另一位顧問')])
  res.status(200).json({ ok: true, sentTo: consultant.name })
}
