import * as apisdk from '@protocolink/api';

export interface Position {
  utilization: string;
  healthRate: string;
  netAPR: string;
  totalDebt: string;
}

export interface LeverageQuotation {
  leverageTimes: string;
  currentPosition: Position;
  targetPosition: Position;
}

export interface CollateralSwapQuotation {
  targetTokenAmount: string;
  currentPosition: Position;
  targetPosition: Position;
}

export type QuoteAPIResponseBody<T = any> = Pick<apisdk.RouterDataEstimateResult, 'approvals' | 'permitData'> &
  Pick<apisdk.RouterData, 'logics'> & {
    quotation: T;
  };
