import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { message, portfolio } = await req.json()

    const apiKey = process.env.GROQ_API_KEY
    console.log('API KEY:', apiKey ? 'found' : 'MISSING')
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
    }

    const systemPrompt = `You are a helpful stock market advisor for a paper trading simulator. 
The user is practicing with virtual money, not real money.

Here is the user's current portfolio:
- Cash available: $${portfolio.cash.toFixed(2)}
- Total portfolio value: $${portfolio.totalValue.toFixed(2)}
- Holdings: ${portfolio.holdings.length === 0 ? 'No holdings yet' : portfolio.holdings.map((h: any) =>
  `${h.ticker}: ${h.shares.toFixed(4)} shares, avg price $${h.avgPrice.toFixed(2)}${h.currentPrice ? ', current price $' + h.currentPrice.toFixed(2) : ''}${h.gain !== null ? ', gain/loss $' + h.gain.toFixed(2) : ''}`
).join('; ')}

Give concise, helpful advice. You can comment on their current holdings, suggest stocks to look at, explain market concepts, or answer general investing questions. Always remind them this is a simulator for learning purposes. Keep responses to 2-4 sentences unless they ask for more detail.`

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: 'user', content: message }],
      }),
    })

    const data = await response.json()
    console.log('RESPONSE:', JSON.stringify(data))
    const text = data.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.'
    return NextResponse.json({ reply: text })
  } catch (err) {
    console.error('Advisor error:', err)
    return NextResponse.json({ error: 'Failed to get advice' }, { status: 500 })
  }
}