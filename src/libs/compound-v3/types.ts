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
  collateralValue: string;
  borrowCapacity: string;
  borrowCapacityValue: string;
}

export interface MarketInfo {
  baseToken: common.Token;
  baseTokenPrice: string;
  supplyApr: string;
  supplyBalance: string;
  supplyValue: string;
  borrowApr: string;
  borrowBalance: string;
  borrowValue: string;
  collateralValue: string;
  borrowCapacity: string;
  borrowCapacityValue: string;
  availableToBorrow: string;
  availableToBorrowValue: string;
  liquidationLimit: string;
  liquidationThreshold: string;
  liquidationRisk: string;
  liquidationPoint: string;
  liquidationPointValue: string;
  utilization: string;
  healthRate: string;
  netApr: string;
  collaterals: CollateralInfo[];
}
