'use client'

import { useEffect, useState } from 'react'

export default function AdminSettingsPage() {
  const [inviteRequired, setInviteRequired] = useState(false)
  const [maxFavorites, setMaxFavorites] = useState(10)
  const [slogan, setSlogan] = useState('')
  const [footerText, setFooterText] = useState('')
  const [seoTitle, setSeoTitle] = useState('')
  const [seoDescription, setSeoDescription] = useState('')
  const [seoKeywords, setSeoKeywords] = useState('')
  const [memberQuota, setMemberQuota] = useState(10)
  const [contactText, setContactText] = useState('')
  const [contactQrcode, setContactQrcode] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetch('/api/admin/settings').then(r => r.json()).then(d => {
      if (d.success) {
        setInviteRequired(d.data.invite_required === '1')
        const mf = parseInt(d.data.max_favorites, 10)
        if (Number.isFinite(mf) && mf > 0) setMaxFavorites(mf)
        if (d.data.site_slogan) setSlogan(d.data.site_slogan)
        if (d.data.footer_text) setFooterText(d.data.footer_text)
        if (d.data.seo_title) setSeoTitle(d.data.seo_title)
        if (d.data.seo_description) setSeoDescription(d.data.seo_description)
        if (d.data.seo_keywords) setSeoKeywords(d.data.seo_keywords)
        const mq = parseInt(d.data.member_quota, 10)
        if (Number.isFinite(mq) && mq > 0) setMemberQuota(mq)
        if (d.data.contact_text) setContactText(d.data.contact_text)
        if (d.data.contact_qrcode) setContactQrcode(d.data.contact_qrcode)
      }
    })
  }, [])

  const save = async () => {
    setSaving(true)
    setMsg('')
    try {
      const posts = [
        { key: 'invite_required', value: inviteRequired ? '1' : '0' },
        { key: 'max_favorites', value: String(maxFavorites) },
        { key: 'site_slogan', value: slogan },
        { key: 'footer_text', value: footerText },
        { key: 'seo_title', value: seoTitle },
        { key: 'seo_description', value: seoDescription },
        { key: 'seo_keywords', value: seoKeywords },
        { key: 'member_quota', value: String(memberQuota) },
        { key: 'contact_text', value: contactText },
        { key: 'contact_qrcode', value: contactQrcode },
      ]
      for (const p of posts) {
        await fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(p),
        })
      }
      setMsg('已保存')
    } catch {
      setMsg('保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">系统设置</h1>

      <div className="bg-white rounded-xl border p-6 space-y-6 max-w-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-800">邀请码注册</p>
            <p className="text-sm text-gray-500">开启后，新用户注册必须填写有效邀请码</p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={inviteRequired} onChange={e => setInviteRequired(e.target.checked)} />
            <span className="text-sm text-gray-600">开启</span>
          </label>
        </div>

        <div>
          <label className="block font-medium text-gray-800 mb-1">用户收藏上限（个）</label>
          <input type="number" min={1} max={200} value={maxFavorites}
            onChange={e => setMaxFavorites(parseInt(e.target.value) || 10)}
            className="w-32 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1a73e8] outline-none" />
          <p className="text-sm text-gray-500 mt-1">每个用户最多可收藏的内容数量</p>
        </div>

        <div className="border-t border-gray-100 pt-5">
          <p className="font-medium text-gray-800 mb-3">站点文案（页脚 / 介绍）</p>
          <label className="block text-sm text-gray-500 mb-1">页脚简介 / 站点标语</label>
          <textarea value={slogan} onChange={e => setSlogan(e.target.value)} rows={2}
            placeholder="在波动的时代里，把不确定性变成可学习的技能……"
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1a73e8] outline-none text-sm" />
          <label className="block text-sm text-gray-500 mb-1 mt-3">页脚免责声明</label>
          <textarea value={footerText} onChange={e => setFooterText(e.target.value)} rows={2}
            placeholder="本站内容仅供学习与交流，不构成任何投资建议……"
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1a73e8] outline-none text-sm" />
        </div>

        <div className="border-t border-gray-100 pt-5">
          <p className="font-medium text-gray-800 mb-3">SEO 搜索引擎优化</p>
          <label className="block text-sm text-gray-500 mb-1">网站标题 (Title)</label>
          <input value={seoTitle} onChange={e => setSeoTitle(e.target.value)} placeholder="经济危机生存指南 - 系统化的应对方法与实战策略"
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1a73e8] outline-none text-sm" />
          <label className="block text-sm text-gray-500 mb-1 mt-3">描述 (Description)</label>
          <textarea value={seoDescription} onChange={e => setSeoDescription(e.target.value)} rows={2}
            placeholder="我们不预测市场，也不给投资建议……"
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1a73e8] outline-none text-sm" />
          <label className="block text-sm text-gray-500 mb-1 mt-3">关键词 (Keywords，逗号分隔)</label>
          <input value={seoKeywords} onChange={e => setSeoKeywords(e.target.value)} placeholder="经济危机,应对方法,资产保护,风险应对,学习"
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1a73e8] outline-none text-sm" />
        </div>

        <div className="border-t border-gray-100 pt-5">
          <p className="font-medium text-gray-800 mb-3">VIP 空间 & 联系客服</p>
          <label className="block font-medium text-gray-800 mb-1">VIP 空间发布条数上限（每人）</label>
          <input type="number" min={1} max={500} value={memberQuota}
            onChange={e => setMemberQuota(parseInt(e.target.value) || 10)}
            className="w-32 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1a73e8] outline-none" />
          <p className="text-sm text-gray-500 mt-1">仅 VIP 可创建空间并分享 B 站视频，达到上限后无法继续添加</p>

          <label className="block text-sm text-gray-500 mb-1 mt-4">联系客服文字</label>
          <input value={contactText} onChange={e => setContactText(e.target.value)}
            placeholder="如：加群领资料 / 商务合作请加微信"
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1a73e8] outline-none text-sm" />
          <label className="block text-sm text-gray-500 mb-1 mt-3">联系客服二维码图片 URL</label>
          <input value={contactQrcode} onChange={e => setContactQrcode(e.target.value)}
            placeholder="https://.../qrcode.png"
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1a73e8] outline-none text-sm" />
          <p className="text-sm text-gray-500 mt-1">页脚「联系客服」按钮将展示该文字与二维码弹窗</p>
        </div>

        <button onClick={save} disabled={saving}
          className="bg-[#1a4a7a] text-white px-6 py-2 rounded-lg text-sm hover:bg-[#0d2b4a] disabled:opacity-50 font-medium">
          {saving ? '保存中...' : '保存设置'}
        </button>
        {msg && <p className="text-sm text-green-600">{msg}</p>}
      </div>
    </div>
  )
}
