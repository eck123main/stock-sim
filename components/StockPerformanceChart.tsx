'use client'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

interface StockPerformanceChartProps {
  holdings: { ticker: string; gain: number | null; shares: number }[]
  darkMode: boolean
}

export default function StockPerformanceChart({ holdings, darkMode }: StockPerformanceChartProps) {
  const formatCurrency = (value: number) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const gridColor = darkMode ? 'rgba(102, 126, 234, 0.1)' : '#e2e8f0'
  const textColor = darkMode ? '#9ca3af' : '#64748b'
  const positiveColor = '#10b981'
  const negativeColor = '#ef4444'

  const data = holdings
    .filter(h => h.gain !== null && h.shares > 0)
    .map(h => ({
      ticker: h.ticker,
      gain: h.gain || 0
    }))
    .sort((a, b) => b.gain - a.gain)

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64" style={{
        color: textColor,
        background: darkMode ? 'rgba(30, 41, 59, 0.3)' : '#f8fafc',
        borderRadius: '16px',
        border: `2px dashed ${gridColor}`
      }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 48, margin: '0 0 12px 0' }}>📊</p>
          <p style={{ margin: 0, fontWeight: 600 }}>No holdings yet</p>
          <p style={{ margin: '8px 0 0 0', fontSize: 14, opacity: 0.7 }}>Buy some stocks to see performance breakdown!</p>
        </div>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} strokeOpacity={0.5} />
        <XAxis
          dataKey="ticker"
          stroke={textColor}
          style={{ fontSize: '13px', fontWeight: 700 }}
          tick={{ fill: textColor }}
        />
        <YAxis
          tickFormatter={(val) => `$${val}`}
          stroke={textColor}
          style={{ fontSize: '12px', fontWeight: 600 }}
          tick={{ fill: textColor }}
        />
        <Tooltip
          formatter={(value) => [formatCurrency(value as number), 'Gain/Loss']}
          contentStyle={{
            backgroundColor: darkMode ? 'rgba(26, 26, 46, 0.95)' : '#ffffff',
            border: `2px solid ${darkMode ? 'rgba(102, 126, 234, 0.3)' : '#e2e8f0'}`,
            borderRadius: '12px',
            color: darkMode ? '#e8e8f0' : '#1a202c',
            boxShadow: darkMode ? '0 8px 32px rgba(0, 0, 0, 0.6)' : '0 4px 20px rgba(0, 0, 0, 0.1)',
            padding: '12px 16px',
            fontWeight: 600
          }}
          labelStyle={{ fontWeight: 700, marginBottom: '4px' }}
        />
        <Bar dataKey="gain" radius={[10, 10, 0, 0]}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.gain >= 0 ? positiveColor : negativeColor} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}