export interface BalanceResult {
  chain: string
  symbol: string
  amount: string
  fiatValue?: number
  fiatCurrency?: string
  contractAddress?: string
  decimals?: number
}

export interface SendResult {
  txHash: string
  chain: string
  explorerUrl: string
  amount: string
  to: string
  symbol: string
}

export interface SendDryRunResult {
  dryRun: true
  chain: string
  to: string
  amount: string
  symbol: string
  balance: string
  warning?: string
}

export interface SwapQuoteResult {
  fromChain: string
  fromToken: string
  toChain: string
  toToken: string
  inputAmount: string
  estimatedOutput: string
  provider: string
  estimatedOutputFiat?: number
  inputFiat?: number
  requiresApproval?: boolean
  warnings?: string[]
}

export interface SwapDryRunResult extends SwapQuoteResult {
  dryRun: true
}

export interface SwapResult {
  txHash: string
  chain: string
  explorerUrl: string
  approvalTxHash?: string
}

export interface AddressResult {
  chain: string
  address: string
}

export interface VaultInfoResult {
  id: string
  name: string
  type: string
  chains: string[]
  isEncrypted: boolean
  threshold: number
  totalSigners: number
}
