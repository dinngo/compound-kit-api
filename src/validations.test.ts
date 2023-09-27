import * as common from '@protocolink/common';
import { expect } from 'chai';
import { validateChain } from './validations';

describe('Validations', function () {
  context('Test validateChain', function () {
    const testCases = [
      {
        chainId: common.ChainId.mainnet,
        expected: true,
      },
      {
        chainId: common.ChainId.polygon,
        expected: true,
      },
      {
        chainId: common.ChainId.arbitrum,
        expected: true,
      },
      {
        chainId: common.ChainId.zksync,
        expected: false,
      },
    ];

    testCases.forEach(({ chainId, expected }) => {
      it(`${common.toNetworkId(chainId)}`, async function () {
        expect(validateChain(chainId)).to.eq(expected);
      });
    });
  });
});
