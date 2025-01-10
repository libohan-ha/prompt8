import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    
    const response = await fetch("https://api.302.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GPT4O_API_KEY}` // 使用同一个key
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        messages: body.messages,
        stream: true
      })
    })

    // Handle non-OK responses
    if (!response.ok) {
      const error = await response.json()
      return NextResponse.json(
        { error: error.error?.message || 'API request failed' },
        { status: response.status }
      )
    }

    // Set up streaming response
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader()
        
        try {
          while (reader) {
            const { done, value } = await reader.read()
            if (done) break
            
            const chunk = decoder.decode(value)
            controller.enqueue(encoder.encode(chunk))
          }
        } catch (error) {
          controller.error(error)
        } finally {
          controller.close()
          reader?.releaseLock()
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })

  } catch (error) {
    console.error('API Route Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 