'use client'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts'

interface PortfolioChartProps {
  data: { date: string; value: number; timestamp: number }[]
  darkMode: boolean
}

export default function PortfolioChart({ data, darkMode }: PortfolioChartProps) {
  const formatCurrency = (value: number) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const chartColor = darkMode ? '#8b5cf6' : '#a78bfa'
  const gridColor = darkMode ? 'rgba(102, 126, 234, 0.1)' : '#e2e8f0'
  const textColor = darkMode ? '#9ca3af' : '#64748b'

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64" style={{
        color: textColor,
        background: darkMode ? 'rgba(30, 41, 59, 0.3)' : '#f8fafc',
        borderRadius: '16px',
        border: `2px dashed ${gridColor}`
      }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 48, margin: '0 0 12px 0' }}>📊</p>
          <p style={{ margin: 0, fontWeight: 600 }}>No portfolio history yet</p>
          <p style={{ margin: '8px 0 0 0', fontSize: 14, opacity: 0.7 }}>Make some trades to see your performance over time!</p>
        </div>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={darkMode ? '#8b5cf6' : '#a78bfa'} stopOpacity={0.6}/>
            <stop offset="95%" stopColor={darkMode ? '#6366f1' : '#c4b5fd'} stopOpacity={0.05}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} strokeOpacity={0.5} />
        <XAxis
          dataKey="timestamp"
          tickFormatter={formatDate}
          stroke={textColor}
          style={{ fontSize: '12px', fontWeight: 600 }}
          tick={{ fill: textColor }}
        />
        <YAxis
          tickFormatter={(val) => `$${val.toLocaleString()}`}
          stroke={textColor}
          style={{ fontSize: '12px', fontWeight: 600 }}
          tick={{ fill: textColor }}
        />
        <Tooltip
          formatter={(value) => [formatCurrency(Number(value || 0)), 'Portfolio Value']}
          labelFormatter={(timestamp) => new Date(Number(timestamp)).toLocaleString()}
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
        <Area
          type="monotone"
          dataKey="value"
          stroke={darkMode ? '#8b5cf6' : '#a78bfa'}
          strokeWidth={3}
          fillOpacity={1}
          fill="url(#colorValue)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
