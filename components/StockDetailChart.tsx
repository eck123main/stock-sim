'use client'
import { useState, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Bar } from 'recharts'
import { calculateAllIndicators, getIndicatorSignals } from '../../lib/indicators'

interface StockDetailChartProps {
  ticker: string
  trades: any[]
  darkMode: boolean
}

export default function StockDetailChart({ ticker, trades, darkMode }: StockDetailChartProps) {
  const [showSMA, setShowSMA] = useState(true)
  const [showRSI, setShowRSI] = useState(true)
  const [showBB, setShowBB] = useState(false)
  const [showMACD, setShowMACD] = useState(false)

  const indicatorData = useMemo(() => {
    const stockTrades = trades.filter(t => t.ticker === ticker)
    return calculateAllIndicators(stockTrades)
  }, [ticker, trades])

  const signals = useMemo(() => getIndicatorSignals(indicatorData), [indicatorData])

  const colors = {
    text: darkMode ? '#9ca3af' : '#64748b',
    grid: darkMode ? 'rgba(102, 126, 234, 0.1)' : '#e2e8f0',
    price: darkMode ? '#8b5cf6' : '#a78bfa',
    sma20: '#06b6d4',
    sma50: '#f59e0b',
    rsi: '#ec4899',
    bbUpper: 'rgba(99, 102, 241, 0.3)',
    bbMiddle: '#6366f1',
    macd: '#10b981'
  }

  if (indicatorData.length === 0) {
    return (
      <div style={{
        background: darkMode ? 'rgba(30, 41, 59, 0.3)' : '#f8fafc',
        borderRadius: '16px',
        padding: '24px',
        textAlign: 'center',
        color: colors.text,
        marginTop: '20px'
      }}>
        <p style={{ margin: 0, fontWeight: 600 }}>Not enough data</p>
        <p style={{ margin: '8px 0 0 0', fontSize: 14 }}>Make more trades in {ticker} to see technical indicators</p>
      </div>
    )
  }

  return (
    <div style={{
      background: darkMode ? 'linear-gradient(145deg, #1a1a2e 0%, #16213e 100%)' : '#ffffff',
      border: `1px solid ${colors.grid}`,
      borderRadius: '16px',
      padding: '20px',
      marginTop: '20px'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px'
      }}>
        <h3 style={{ margin: 0, color: colors.text, fontSize: 18, fontWeight: 700 }}>
          {ticker} Technical Analysis
        </h3>
      </div>

      {/* Signals Display */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '12px',
        marginBottom: '16px'
      }}>
        <SignalBox label="RSI" signal={signals.rsiSignal} color={colors.rsi} />
        <SignalBox label="MACD" signal={signals.macdSignal} color={colors.macd} />
        <SignalBox label="Bollinger" signal={signals.bollingerSignal} color={colors.bbMiddle} />
      </div>

      {/* Toggle Buttons */}
      <div style={{
        display: 'flex',
        gap: '8px',
        flexWrap: 'wrap',
        marginBottom: '16px',
        paddingBottom: '12px',
        borderBottom: `1px solid ${colors.grid}`
      }}>
        <ToggleButton active={showSMA} onChange={setShowSMA} label="Moving Averages" />
        <ToggleButton active={showRSI} onChange={setShowRSI} label="RSI" />
        <ToggleButton active={showBB} onChange={setShowBB} label="Bollinger Bands" />
        <ToggleButton active={showMACD} onChange={setShowMACD} label="MACD" />
      </div>

      {/* Price Chart with Indicators */}
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={indicatorData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} strokeOpacity={0.5} />
          <XAxis
            dataKey="date"
            stroke={colors.text}
            style={{ fontSize: '12px', fontWeight: 600 }}
            tick={{ fill: colors.text }}
          />
          <YAxis
            stroke={colors.text}
            style={{ fontSize: '12px', fontWeight: 600 }}
            tick={{ fill: colors.text }}
            yAxisId="left"
          />
          {showRSI && <YAxis yAxisId="right" orientation="right" domain={[0, 100]} stroke={colors.rsi} style={{ fontSize: '12px' }} />}
          <Tooltip
            contentStyle={{
              backgroundColor: darkMode ? 'rgba(26, 26, 46, 0.95)' : '#ffffff',
              border: `2px solid ${darkMode ? 'rgba(102, 126, 234, 0.3)' : '#e2e8f0'}`,
              borderRadius: '12px',
              color: darkMode ? '#e8e8f0' : '#1a202c'
            }}
          />
          <Legend wrapperStyle={{ color: colors.text, fontSize: '13px' }} />

          {/* Price Line */}
          <Line yAxisId="left" type="monotone" dataKey="close" stroke={colors.price} strokeWidth={2.5} dot={false} name="Price" />

          {/* Moving Averages */}
          {showSMA && (
            <>
              <Line yAxisId="left" type="monotone" dataKey="sma20" stroke={colors.sma20} strokeWidth={2} dot={false} name="SMA 20" strokeDasharray="5 5" />
              <Line yAxisId="left" type="monotone" dataKey="sma50" stroke={colors.sma50} strokeWidth={2} dot={false} name="SMA 50" strokeDasharray="5 5" />
            </>
          )}

          {/* RSI */}
          {showRSI && (
            <>
              <Line yAxisId="right" type="monotone" dataKey="rsi" stroke={colors.rsi} strokeWidth={2} dot={false} name="RSI (14)" opacity={0.7} />
              <Line yAxisId="right" type="step" dataKey={() => 70} stroke="rgba(239, 68, 68, 0.3)" strokeWidth={1} dot={false} name="Overbought" isAnimationActive={false} />
              <Line yAxisId="right" type="step" dataKey={() => 30} stroke="rgba(34, 197, 94, 0.3)" strokeWidth={1} dot={false} name="Oversold" isAnimationActive={false} />
            </>
          )}

          {/* Bollinger Bands */}
          {showBB && (
            <>
              <Line yAxisId="left" type="monotone" dataKey="bollingerUpper" stroke={colors.bbUpper} strokeWidth={1} dot={false} name="BB Upper" isAnimationActive={false} />
              <Line yAxisId="left" type="monotone" dataKey="bollingerMiddle" stroke={colors.bbMiddle} strokeWidth={1} dot={false} name="BB Middle" strokeDasharray="3 3" isAnimationActive={false} />
              <Line yAxisId="left" type="monotone" dataKey="bollingerLower" stroke={colors.bbUpper} strokeWidth={1} dot={false} name="BB Lower" isAnimationActive={false} />
            </>
          )}
        </LineChart>
      </ResponsiveContainer>

      {/* MACD Chart */}
      {showMACD && (
        <div style={{ marginTop: '24px' }}>
          <h4 style={{ margin: '0 0 12px 0', color: colors.text, fontSize: 14, fontWeight: 600 }}>MACD</h4>
          <ResponsiveContainer width="100%" height={150}>
            <ComposedChart data={indicatorData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} strokeOpacity={0.5} />
              <XAxis dataKey="date" stroke={colors.text} style={{ fontSize: '12px' }} tick={{ fill: colors.text }} />
              <YAxis stroke={colors.text} style={{ fontSize: '12px' }} tick={{ fill: colors.text }} />
              <Tooltip contentStyle={{ backgroundColor: darkMode ? 'rgba(26, 26, 46, 0.95)' : '#ffffff', borderRadius: '12px' }} />
              <Bar dataKey="macd" fill={colors.macd} opacity={0.6} name="MACD Histogram" />
              <Line type="monotone" dataKey="macd" stroke={colors.macd} strokeWidth={2} dot={false} name="MACD" />
              <Line type="monotone" dataKey="macdSignal" stroke="#f59e0b" strokeWidth={2} dot={false} name="Signal Line" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Legend */}
      <div style={{
        marginTop: '16px',
        padding: '12px',
        background: darkMode ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.02)',
        borderRadius: '8px',
        fontSize: '12px',
        color: colors.text
      }}>
        <p style={{ margin: '0 0 8px 0', fontWeight: 600 }}>Indicator Guide:</p>
        <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: 1.6 }}>
          <li><strong>SMA:</strong> Trend direction (faster = more responsive)</li>
          <li><strong>RSI:</strong> Momentum (70+ = overbought, 30- = oversold)</li>
          <li><strong>Bollinger Bands:</strong> Volatility and support/resistance</li>
          <li><strong>MACD:</strong> Trend and momentum (crossover = signal)</li>
        </ul>
      </div>
    </div>
  )
}

function SignalBox({ label, signal, color }: { label: string; signal: string; color: string }) {
  const isBullish = signal.includes('Bullish') || signal === 'Oversold'
  const isBearish = signal.includes('Bearish') || signal.includes('Overbought')
  const bgColor = isBullish ? 'rgba(16, 185, 129, 0.1)' : isBearish ? 'rgba(239, 68, 68, 0.1)' : 'rgba(100, 100, 100, 0.1)'

  return (
    <div style={{
      padding: '12px',
      background: bgColor,
      border: `1px solid ${color}`,
      borderRadius: '8px',
      textAlign: 'center'
    }}>
      <div style={{ fontSize: '11px', fontWeight: 600, color: color, marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '12px', fontWeight: 700, color: color }}>{signal}</div>
    </div>
  )
}

function ToggleButton({ active, onChange, label }: { active: boolean; onChange: (val: boolean) => void; label: string }) {
  return (
    <button
      onClick={() => onChange(!active)}
      style={{
        padding: '6px 12px',
        background: active ? '#667eea' : '#cbd5e1',
        color: active ? '#ffffff' : '#64748b',
        border: 'none',
        borderRadius: '6px',
        fontSize: '12px',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.2s'
      }}
    >
      {label}
    </button>
  )
}
