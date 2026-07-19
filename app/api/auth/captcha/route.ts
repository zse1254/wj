import { generateCaptcha } from '@/lib/captcha'

export async function POST() {
  try {
    const data = await generateCaptcha()
    return Response.json({ success: true, ...data })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}
