import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Use service role key for server-side
)

export async function POST(req: NextRequest) {
  try {
    const { userId, currentPrices } = await req.json()

    if (!userId || !currentPrices) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
    }

    // Get active price alerts for user
    const { data: alerts, error: alertsError } = await supabase
      .from('price_alerts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)

    if (alertsError) {
      return NextResponse.json({ error: 'Failed to fetch alerts' }, { status: 500 })
    }

    const triggeredAlerts = []

    // Check each alert
    for (const alert of alerts || []) {
      const currentPrice = currentPrices[alert.ticker]

      if (!currentPrice) continue

      let shouldTrigger = false

      if (alert.alert_type === 'ABOVE' && currentPrice >= alert.target_price) {
        shouldTrigger = true
      } else if (alert.alert_type === 'BELOW' && currentPrice <= alert.target_price) {
        shouldTrigger = true
      }

      if (shouldTrigger) {
        // Create notification
        await supabase.from('notifications').insert({
          user_id: userId,
          type: 'PRICE_ALERT',
          title: `${alert.ticker} Price Alert`,
          message: `${alert.ticker} is now ${alert.alert_type === 'ABOVE' ? 'above' : 'below'} $${alert.target_price.toFixed(2)} (Current: $${currentPrice.toFixed(2)})`
        })

        // Deactivate alert
        await supabase
          .from('price_alerts')
          .update({ is_active: false })
          .eq('id', alert.id)

        triggeredAlerts.push(alert)
      }
    }

    return NextResponse.json({
      success: true,
      triggeredCount: triggeredAlerts.length
    })
  } catch (err) {
    console.error('Check alerts error:', err)
    return NextResponse.json({ error: 'Failed to check alerts' }, { status: 500 })
  }
}
