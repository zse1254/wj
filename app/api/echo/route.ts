import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const text = await request.text()
    let parsed: any = null
    let parseError: string | null = null
    try {
      parsed = JSON.parse(text)
    } catch (e: any) {
      parseError = e.message
    }
    return Response.json({
      success: true,
      rawLength: text.length,
      rawFirst50: text.substring(0, 50),
      rawByteArray: Array.from(new TextEncoder().encode(text)).slice(0, 20),
      parseError,
      parsed,
    })
  } catch (e: any) {
    return Response.json({ success: false, error: e.message }, { status: 500 })
  }
}
