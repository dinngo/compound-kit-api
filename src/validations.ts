import * as logics from '@protocolink/logics';

export function validateMarket(chainId: number, marketId: string) {
  for (const config of logics.compoundv3.configs) {
    if (chainId === config.chainId) {
      for (const market of config.markets) {
        if (marketId === market.id) return true;
      }
    }
  }

  return false;
}
