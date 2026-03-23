'use client'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

interface StockPerformanceChartProps {
  holdings: { ticker: string; gain: number | null; shares: number }[]
  darkMode: boolean
}

export default function StockPerformanceChart({ holdings, darkMode }: StockPerformanceChartProps) {
  const formatCurrency = (value: number) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const gridColor = darkMode ? '#2a2a4a' : '#e0e7ed'
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
      <div className="flex items-center justify-center h-64" style={{ color: textColor }}>
        <p>No holdings yet. Buy some stocks to see performance breakdown!</p>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
        <XAxis
          dataKey="ticker"
          stroke={textColor}
          style={{ fontSize: '12px' }}
        />
        <YAxis
          tickFormatter={(val) => `$${val}`}
          stroke={textColor}
          style={{ fontSize: '12px' }}
        />
        <Tooltip
          formatter={(value: number) => [formatCurrency(value), 'Gain/Loss']}
          contentStyle={{
            backgroundColor: darkMode ? '#1a1a2e' : '#ffffff',
            border: `1px solid ${gridColor}`,
            borderRadius: '8px',
            color: darkMode ? '#e8e8f0' : '#1a202c'
          }}
        />
        <Bar dataKey="gain" radius={[8, 8, 0, 0]}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.gain >= 0 ? positiveColor : negativeColor} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
