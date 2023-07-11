export interface MarketGroup {
  chainId: number;
  markets: {
    id: string;
    label: string;
  }[];
}
