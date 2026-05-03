interface PricePoint {
  date: string
  close: number
  timestamp: number
}

interface IndicatorData {
  date: string
  close: number
  timestamp: number
  sma20?: number
  sma50?: number
  rsi?: number
  macd?: number
  macdSignal?: number
  bollingerUpper?: number
  bollingerLower?: number
  bollingerMiddle?: number
}

export function reconstructPriceTimeline(trades: any[]): PricePoint[] {
  if (!trades || trades.length === 0) return []

  const sortedTrades = [...trades].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  const prices: PricePoint[] = sortedTrades.map(trade => ({
    date: new Date(trade.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    close: trade.price,
    timestamp: new Date(trade.created_at).getTime()
  }))

  return prices
}

export function calculateSMA(prices: number[], period: number): (number | undefined)[] {
  const sma: (number | undefined)[] = new Array(prices.length).fill(undefined)

  for (let i = period - 1; i < prices.length; i++) {
    const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0)
    sma[i] = sum / period
  }

  return sma
}

export function calculateRSI(prices: number[], period: number = 14): (number | undefined)[] {
  const rsi: (number | undefined)[] = new Array(prices.length).fill(undefined)

  if (prices.length < period + 1) return rsi

  const changes = prices.slice(1).map((price, i) => price - prices[i])

  let avgGain = 0
  let avgLoss = 0

  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i]
    else avgLoss += Math.abs(changes[i])
  }

  avgGain /= period
  avgLoss /= period

  rsi[period] = 100 - (100 / (1 + avgGain / avgLoss))

  for (let i = period + 1; i < prices.length; i++) {
    const change = changes[i]
    if (change > 0) {
      avgGain = (avgGain * (period - 1) + change) / period
      avgLoss = (avgLoss * (period - 1)) / period
    } else {
      avgGain = (avgGain * (period - 1)) / period
      avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period
    }

    rsi[i] = 100 - (100 / (1 + avgGain / avgLoss))
  }

  return rsi
}

export function calculateMACD(prices: number[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9): { macd: (number | undefined)[], signal: (number | undefined)[] } {
  const ema12 = calculateEMA(prices, fastPeriod)
  const ema26 = calculateEMA(prices, slowPeriod)

  const macd: (number | undefined)[] = ema12.map((val, i) =>
    val !== undefined && ema26[i] !== undefined ? val - ema26[i] : undefined
  )

  const macdValues = macd.filter((val): val is number => val !== undefined)
  const signal = calculateEMA(macdValues, signalPeriod)

  return { macd, signal }
}

function calculateEMA(prices: number[], period: number): (number | undefined)[] {
  const ema: (number | undefined)[] = new Array(prices.length).fill(undefined)
  const multiplier = 2 / (period + 1)

  if (prices.length < period) return ema

  const sma = prices.slice(0, period).reduce((a, b) => a + b, 0) / period
  ema[period - 1] = sma

  for (let i = period; i < prices.length; i++) {
    ema[i] = (prices[i] - (ema[i - 1] as number)) * multiplier + (ema[i - 1] as number)
  }

  return ema
}

export function calculateBollingerBands(prices: number[], period: number = 20, stdDevMultiplier: number = 2): {
  upper: (number | undefined)[]
  middle: (number | undefined)[]
  lower: (number | undefined)[]
} {
  const middle = calculateSMA(prices, period)
  const upper: (number | undefined)[] = new Array(prices.length).fill(undefined)
  const lower: (number | undefined)[] = new Array(prices.length).fill(undefined)

  for (let i = period - 1; i < prices.length; i++) {
    if (middle[i] === undefined) continue

    const subset = prices.slice(i - period + 1, i + 1)
    const variance = subset.reduce((sum, price) => sum + Math.pow(price - (middle[i] as number), 2), 0) / period
    const stdDev = Math.sqrt(variance)

    upper[i] = (middle[i] as number) + stdDev * stdDevMultiplier
    lower[i] = (middle[i] as number) - stdDev * stdDevMultiplier
  }

  return { upper, middle, lower }
}

export function calculateAllIndicators(trades: any[]): IndicatorData[] {
  const priceTimeline = reconstructPriceTimeline(trades)

  if (priceTimeline.length === 0) return []

  const prices = priceTimeline.map(p => p.close)

  const sma20 = calculateSMA(prices, 20)
  const sma50 = calculateSMA(prices, 50)
  const rsi = calculateRSI(prices, 14)
  const { macd, signal } = calculateMACD(prices)
  const { upper, middle, lower } = calculateBollingerBands(prices, 20)

  return priceTimeline.map((point, i) => ({
    ...point,
    sma20: sma20[i],
    sma50: sma50[i],
    rsi: rsi[i],
    macd: macd[i],
    macdSignal: signal[i],
    bollingerUpper: upper[i],
    bollingerMiddle: middle[i],
    bollingerLower: lower[i]
  }))
}

export function getIndicatorSignals(data: IndicatorData[]): {
  rsiSignal: string
  macdSignal: string
  bollingerSignal: string
} {
  if (data.length === 0) {
    return { rsiSignal: 'Neutral', macdSignal: 'Neutral', bollingerSignal: 'Neutral' }
  }

  const latest = data[data.length - 1]
  const previous = data.length > 1 ? data[data.length - 2] : null

  // RSI Signal
  let rsiSignal = 'Neutral'
  if (latest.rsi !== undefined) {
    if (latest.rsi > 70) rsiSignal = 'Overbought'
    else if (latest.rsi < 30) rsiSignal = 'Oversold'
  }

  // MACD Signal
  let macdSignal = 'Neutral'
  if (latest.macd !== undefined && latest.macdSignal !== undefined && previous?.macd !== undefined && previous?.macdSignal !== undefined) {
    const prevCrossing = previous.macd < previous.macdSignal
    const currCrossing = latest.macd > latest.macdSignal
    if (prevCrossing && currCrossing) macdSignal = 'Bullish Crossover'
    else if (!prevCrossing && !currCrossing && latest.macd < latest.macdSignal) macdSignal = 'Bearish Crossover'
  }

  // Bollinger Band Signal
  let bollingerSignal = 'Within Bands'
  if (latest.close !== undefined && latest.bollingerUpper !== undefined && latest.bollingerLower !== undefined) {
    if (latest.close > latest.bollingerUpper) bollingerSignal = 'Above Upper Band'
    else if (latest.close < latest.bollingerLower) bollingerSignal = 'Below Lower Band'
  }

  return { rsiSignal, macdSignal, bollingerSignal }
}
