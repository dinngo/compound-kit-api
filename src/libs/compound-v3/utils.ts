import * as common from '@protocolink/common';
import * as logics from '@protocolink/logics';

export function getMarketLabel(chainId: number, marketId: string) {
  if (chainId === common.ChainId.arbitrum && marketId === logics.compoundv3.MarketId.USDC) {
    return 'USDC.e';
  }
  return marketId;
}
