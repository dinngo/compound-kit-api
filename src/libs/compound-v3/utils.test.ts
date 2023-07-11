import * as common from '@protocolink/common';
import { expect } from 'chai';
import { getMarketLabel } from './utils';
import * as logics from '@protocolink/logics';

describe('Test getMarketLabel', function () {
  const testCases = [
    {
      chainId: common.ChainId.mainnet,
      marketId: logics.compoundv3.MarketId.USDC,
      expected: 'USDC',
    },
    {
      chainId: common.ChainId.mainnet,
      marketId: logics.compoundv3.MarketId.ETH,
      expected: 'ETH',
    },
    {
      chainId: common.ChainId.polygon,
      marketId: logics.compoundv3.MarketId.USDC,
      expected: 'USDC',
    },
    {
      chainId: common.ChainId.arbitrum,
      marketId: logics.compoundv3.MarketId.USDC,
      expected: 'USDC.e',
    },
  ];

  testCases.forEach(({ chainId, marketId, expected }) => {
    it(`${common.toNetworkId(chainId)}: ${expected}`, async function () {
      expect(getMarketLabel(chainId, marketId)).to.eq(expected);
    });
  });
});
