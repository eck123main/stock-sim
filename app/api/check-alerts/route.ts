import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Use service role key for server-side
)

export async function POST(req: NextRequest) {
  try {
    // This route uses the service-role key (bypasses RLS), so the user must be
    // derived from a verified access token, never trusted from the body.
    // Otherwise anyone could trigger/deactivate alerts for any user id.
    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = authData.user.id

    const { currentPrices } = await req.json()

    if (!currentPrices || typeof currentPrices !== 'object') {
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
      const currentPrice = Number(currentPrices[alert.ticker])
      const targetPrice = Number(alert.target_price)

      if (!Number.isFinite(currentPrice) || currentPrice <= 0 || !Number.isFinite(targetPrice)) continue

      let shouldTrigger = false

      if (alert.alert_type === 'ABOVE' && currentPrice >= targetPrice) {
        shouldTrigger = true
      } else if (alert.alert_type === 'BELOW' && currentPrice <= targetPrice) {
        shouldTrigger = true
      }

      if (shouldTrigger) {
        // Create notification
        await supabase.from('notifications').insert({
          user_id: userId,
          type: 'PRICE_ALERT',
          title: `${alert.ticker} Price Alert`,
          message: `${alert.ticker} is now ${alert.alert_type === 'ABOVE' ? 'above' : 'below'} $${targetPrice.toFixed(2)} (Current: $${currentPrice.toFixed(2)})`
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
