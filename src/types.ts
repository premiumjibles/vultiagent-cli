export interface BalanceResult {
  chain: string
  symbol: string
  amount: string
  fiatValue?: string
  fiatCurrency?: string
}

export interface SendResult {
  txHash: string
  chain: string
  explorerUrl: string
}

export interface SwapQuoteResult {
  fromChain: string
  fromToken: string
  toChain: string
  toToken: string
  inputAmount: string
  estimatedOutput: string
  provider: string
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
