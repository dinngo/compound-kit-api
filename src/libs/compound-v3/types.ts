import * as common from '@protocolink/common';

export interface MarketGroup {
  chainId: number;
  markets: {
    id: string;
    label: string;
  }[];
}

export interface CollateralInfo {
  asset: common.Token;
  assetPrice: string;
  borrowCollateralFactor: string;
  liquidateCollateralFactor: string;
  collateralBalance: string;
  collateralUSD: string;
  borrowCapacity: string;
  borrowCapacityUSD: string;
}

export interface MarketInfo {
  baseToken: common.Token;
  baseTokenPrice: string;
  supplyAPR: string;
  supplyBalance: string;
  supplyUSD: string;
  borrowAPR: string;
  borrowBalance: string;
  borrowUSD: string;
  collateralUSD: string;
  borrowCapacity: string;
  borrowCapacityUSD: string;
  availableToBorrow: string;
  availableToBorrowUSD: string;
  liquidationLimit: string;
  liquidationThreshold: string;
  liquidationRisk: string;
  liquidationPoint: string;
  liquidationPointUSD: string;
  utilization: string;
  healthRate: string;
  netAPR: string;
  collaterals: CollateralInfo[];
}
