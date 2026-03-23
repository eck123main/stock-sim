-- Run this SQL in your Supabase SQL Editor to add portfolio tracking

-- Table for portfolio snapshots (tracks portfolio value over time)
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  portfolio_value DECIMAL(12, 2) NOT NULL,
  cash DECIMAL(12, 2) NOT NULL,
  holdings_value DECIMAL(12, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_user_created
  ON portfolio_snapshots(user_id, created_at DESC);

-- Enable Row Level Security
ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own snapshots
CREATE POLICY "Users can view own portfolio snapshots"
  ON portfolio_snapshots FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own snapshots
CREATE POLICY "Users can insert own portfolio snapshots"
  ON portfolio_snapshots FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Optional: Add a watchlist table for custom watchlists feature
CREATE TABLE IF NOT EXISTS user_watchlists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ticker VARCHAR(10) NOT NULL,
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, ticker)
);

CREATE INDEX IF NOT EXISTS idx_user_watchlists_user
  ON user_watchlists(user_id);

ALTER TABLE user_watchlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own watchlist"
  ON user_watchlists FOR ALL
  USING (auth.uid() = user_id);

-- Advanced order types table (limit orders, stop-loss)
CREATE TABLE IF NOT EXISTS pending_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ticker VARCHAR(10) NOT NULL,
  order_type VARCHAR(20) NOT NULL, -- 'LIMIT_BUY', 'LIMIT_SELL', 'STOP_LOSS'
  shares DECIMAL(12, 6) NOT NULL,
  target_price DECIMAL(12, 2) NOT NULL,
  amount DECIMAL(12, 2), -- For LIMIT_BUY orders (dollar amount)
  status VARCHAR(20) DEFAULT 'PENDING', -- 'PENDING', 'EXECUTED', 'CANCELLED'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  executed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_pending_orders_user_status
  ON pending_orders(user_id, status);

ALTER TABLE pending_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own pending orders"
  ON pending_orders FOR ALL
  USING (auth.uid() = user_id);
