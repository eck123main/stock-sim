'use client'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'

interface PortfolioCompositionProps {
  holdings: { ticker: string; currentValue: number }[]
  cash: number
  darkMode: boolean
}

const COLORS = ['#8b5cf6', '#a78bfa', '#c4b5fd', '#6366f1', '#818cf8', '#a5b4fc', '#06b6d4', '#67e8f9', '#f59e0b', '#fbbf24']

export default function PortfolioComposition({ holdings, cash, darkMode }: PortfolioCompositionProps) {
  const textColor = darkMode ? '#9ca3af' : '#64748b'
  const gridColor = darkMode ? 'rgba(102, 126, 234, 0.1)' : '#e2e8f0'

  const data = [
    ...holdings
      .filter(h => h.currentValue > 0)
      .map(h => ({
        name: h.ticker,
        value: h.currentValue
      })),
    ...(cash > 0 ? [{ name: 'Cash', value: cash }] : [])
  ]

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64" style={{
        color: textColor,
        background: darkMode ? 'rgba(30, 41, 59, 0.3)' : '#f8fafc',
        borderRadius: '16px',
        border: `2px dashed ${gridColor}`
      }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 48, margin: '0 0 12px 0' }}>🥧</p>
          <p style={{ margin: 0, fontWeight: 600 }}>No holdings yet</p>
          <p style={{ margin: '8px 0 0 0', fontSize: 14, opacity: 0.7 }}>Buy stocks to see portfolio composition!</p>
        </div>
      </div>
    )
  }

  const formatCurrency = (value: number) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(1)}%`}
          outerRadius={90}
          fill="#8884d8"
          dataKey="value"
          stroke={darkMode ? '#1a1a2e' : '#ffffff'}
          strokeWidth={2}
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value) => formatCurrency(value as number)}
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
        <Legend
          wrapperStyle={{
            color: textColor,
            fontSize: '13px',
            fontWeight: 600
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}