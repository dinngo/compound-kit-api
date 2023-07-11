import * as common from '@protocolink/common';
import { expect } from 'chai';
import * as logics from '@protocolink/logics';
import { validateMarket } from './validations';

describe('Validations', function () {
  context('Test validateMarket', function () {
    const testCases = [
      {
        chainId: common.ChainId.mainnet,
        marketId: logics.compoundv3.MarketId.USDC,
        expected: true,
      },
      {
        chainId: common.ChainId.mainnet,
        marketId: logics.compoundv3.MarketId.ETH,
        expected: true,
      },
      {
        chainId: common.ChainId.mainnet,
        marketId: 'UNKNOW',
        expected: false,
      },
      {
        chainId: common.ChainId.polygon,
        marketId: logics.compoundv3.MarketId.USDC,
        expected: true,
      },
      {
        chainId: common.ChainId.polygon,
        marketId: logics.compoundv3.MarketId.ETH,
        expected: false,
      },
      {
        chainId: common.ChainId.arbitrum,
        marketId: logics.compoundv3.MarketId.USDC,
        expected: true,
      },
      {
        chainId: common.ChainId.arbitrum,
        marketId: logics.compoundv3.MarketId.ETH,
        expected: false,
      },
    ];

    testCases.forEach(({ chainId, marketId, expected }) => {
      it(`${common.toNetworkId(chainId)}: ${marketId}`, async function () {
        expect(validateMarket(chainId, marketId)).to.eq(expected);
      });
    });
  });
});
