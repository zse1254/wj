import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { query, execute } from '@/lib/db'
import { createToken } from '@/lib/auth'
import { verifyCaptchaToken } from '@/lib/captcha'

export async function POST(request: NextRequest) {
  try {
    const { username, password, captchaToken, captchaAnswer, inviteCode } = await request.json()

    if (!username || !password || !captchaToken || captchaAnswer === undefined || captchaAnswer === null) {
      return Response.json({ success: false, error: '请填写完整信息' }, { status: 400 })
    }
    if (password.length < 6) {
      return Response.json({ success: false, error: '密码至少6位' }, { status: 400 })
    }
    if (!/^[a-zA-Z0-9_一-龥]{2,20}$/.test(username)) {
      return Response.json({ success: false, error: '用户名需为2-20位字母数字或中文' }, { status: 400 })
    }

    // Verify captcha (signed token, answer checked server-side)
    const okCaptcha = await verifyCaptchaToken(captchaToken, Number(captchaAnswer))
    if (!okCaptcha) {
      return Response.json({ success: false, error: '验证码错误' }, { status: 400 })
    }

    // Check invite requirement setting
    const setting = await query("SELECT value FROM settings WHERE key = 'invite_required'")
    const inviteRequired = setting.length > 0 && setting[0].value === '1'

    let invitedBy: string | null = null
    if (inviteRequired) {
      if (!inviteCode) {
        return Response.json({ success: false, error: '当前需要邀请码才能注册' }, { status: 400 })
      }
      const codes = await query(
        'SELECT * FROM invite_codes WHERE code = ? AND enabled = 1',
        [inviteCode]
      )
      if (codes.length === 0) {
        return Response.json({ success: false, error: '邀请码无效或已禁用' }, { status: 400 })
      }
      const code = codes[0]
      const maxUses = Number(code.max_uses) || 1
      const usedCount = Number(code.used_count) || 0
      if (usedCount >= maxUses) {
        return Response.json({ success: false, error: '邀请码使用次数已用尽' }, { status: 400 })
      }
      if (code.expires_at && new Date(String(code.expires_at)).getTime() < Date.now()) {
        return Response.json({ success: false, error: '邀请码已过期' }, { status: 400 })
      }
      invitedBy = String(code.id)
    }

    const existing = await query('SELECT id FROM users WHERE username = ?', [username])
    if (existing.length > 0) {
      return Response.json({ success: false, error: '用户名已存在' }, { status: 409 })
    }

    const password_hash = bcrypt.hashSync(password, 10)
    const id = uuidv4()
    const placeholderEmail = `${username}@local`
    try { await execute('ALTER TABLE users ADD COLUMN invited_by TEXT') } catch {}
    await execute(
      'INSERT INTO users (id, username, email, password_hash, invited_by) VALUES (?, ?, ?, ?, ?)',
      [id, username, placeholderEmail, password_hash, invitedBy]
    )

    if (invitedBy) {
      await execute(
        'UPDATE invite_codes SET used_count = used_count + 1 WHERE id = ?',
        [invitedBy]
      )
    }

    const token = await createToken({ userId: id, isAdmin: false })
    const response = Response.json({ success: true, data: { id, username } }, { status: 201 })
    response.headers.set('Set-Cookie', `token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`)
    return response
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}
