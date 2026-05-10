export const VALUECHAIN_MAINNET = {
  chainId: 286623,
  hexChainId: "0x45f9f",
  chainName: "ValueChain",
  rpcUrl: process.env.NEXT_PUBLIC_VALUECHAIN_RPC_URL ?? "https://mainnet.valuechain.xyz",
  explorerUrl: process.env.NEXT_PUBLIC_VALUECHAIN_EXPLORER_URL ?? "https://main-scan.valuechain.xyz",
  nativeCurrency: {
    name: "SOSO",
    symbol: "SOSO",
    decimals: 18,
  },
};

export const VALUECHAIN_TESTNET = {
  chainId: 138565,
  hexChainId: "0x21d45",
  chainName: "ValueChain Testnet",
  rpcUrl: process.env.NEXT_PUBLIC_VALUECHAIN_TESTNET_RPC_URL ?? "https://testnet.valuechain.xyz",
  explorerUrl: process.env.NEXT_PUBLIC_VALUECHAIN_TESTNET_EXPLORER_URL ?? "https://testnet-scan.valuechain.xyz",
  nativeCurrency: {
    name: "SOSO",
    symbol: "SOSO",
    decimals: 18,
  },
};
