import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { query, execute } from '@/lib/db'
import { createToken } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const { username, email, password } = await request.json()
    if (!username || !email || !password) {
      return Response.json({ success: false, error: 'Missing required fields' }, { status: 400 })
    }
    if (password.length < 6) {
      return Response.json({ success: false, error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    const existing = await query('SELECT id FROM users WHERE username = ? OR email = ?', [username, email])
    if (existing.length > 0) {
      return Response.json({ success: false, error: 'Username or email already exists' }, { status: 409 })
    }

    const password_hash = bcrypt.hashSync(password, 10)
    const id = uuidv4()
    await execute(
      'INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)',
      [id, username, email, password_hash]
    )

    const token = await createToken({ userId: id, isAdmin: false })
    const response = Response.json({ success: true, data: { id, username, email } }, { status: 201 })
    response.headers.set('Set-Cookie', `token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`)
    return response
  } catch (err) {
    return Response.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
