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

  const chartColor = darkMode ? '#667eea' : '#764ba2'
  const gridColor = darkMode ? '#2a2a4a' : '#e0e7ed'
  const textColor = darkMode ? '#9ca3af' : '#64748b'

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64" style={{ color: textColor }}>
        <p>No portfolio history yet. Make some trades to see your performance over time!</p>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={chartColor} stopOpacity={0.3}/>
            <stop offset="95%" stopColor={chartColor} stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
        <XAxis
          dataKey="timestamp"
          tickFormatter={formatDate}
          stroke={textColor}
          style={{ fontSize: '12px' }}
        />
        <YAxis
          tickFormatter={(val) => `$${val.toLocaleString()}`}
          stroke={textColor}
          style={{ fontSize: '12px' }}
        />
        <Tooltip
          formatter={(value) => [formatCurrency(Number(value || 0)), 'Portfolio Value']}
          labelFormatter={(timestamp) => new Date(Number(timestamp)).toLocaleString()}
          contentStyle={{
            backgroundColor: darkMode ? '#1a1a2e' : '#ffffff',
            border: `1px solid ${gridColor}`,
            borderRadius: '8px',
            color: darkMode ? '#e8e8f0' : '#1a202c'
          }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={chartColor}
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#colorValue)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
