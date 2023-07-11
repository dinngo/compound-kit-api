import * as common from '@protocolink/common';
import * as logics from '@protocolink/logics';

const customBaseTokenPriceFeedMap: { [key in number]?: { [key in string]?: string } } = {
  [common.ChainId.mainnet]: {
    [logics.compoundv3.MarketId.ETH]: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
  },
};

export function getCustomBaseTokenPriceFeed(chainId: number, marketId: string) {
  return customBaseTokenPriceFeedMap[chainId]?.[marketId];
}
