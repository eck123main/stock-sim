'use client'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'

interface PortfolioCompositionProps {
  holdings: { ticker: string; currentValue: number }[]
  cash: number
  darkMode: boolean
}

const COLORS = ['#667eea', '#764ba2', '#f093fb', '#4facfe', '#43e97b', '#fa709a', '#fee140', '#30cfd0', '#a8edea', '#fed6e3']

export default function PortfolioComposition({ holdings, cash, darkMode }: PortfolioCompositionProps) {
  const textColor = darkMode ? '#9ca3af' : '#64748b'

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
      <div className="flex items-center justify-center h-64" style={{ color: textColor }}>
        <p>No holdings yet. Buy stocks to see portfolio composition!</p>
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
          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
          outerRadius={80}
          fill="#8884d8"
          dataKey="value"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number) => formatCurrency(value)}
          contentStyle={{
            backgroundColor: darkMode ? '#1a1a2e' : '#ffffff',
            border: `1px solid ${darkMode ? '#2a2a4a' : '#e0e7ed'}`,
            borderRadius: '8px',
            color: darkMode ? '#e8e8f0' : '#1a202c'
          }}
        />
        <Legend
          wrapperStyle={{
            color: textColor,
            fontSize: '12px'
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
