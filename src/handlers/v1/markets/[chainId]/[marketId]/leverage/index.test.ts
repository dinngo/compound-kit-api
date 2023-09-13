import { expect } from 'chai';
import * as logics from '@protocolink/logics';
import { newTestEvent, testContext, testHandler } from 'test/fixtures/api';

describe('Test get leverage quotation api', function () {
  const testCases = [
    {
      title: '400.1: market does not exist',
      path: '/v1/markets/137/eth/leverage',
      expected: { statusCode: 400, body: JSON.stringify({ code: '400.1', message: 'market does not exist' }) },
    },
    {
      title: '400.2: body is invalid',
      path: '/v1/markets/137/usdc/leverage',
      expected: { statusCode: 400, body: JSON.stringify({ code: '400.2', message: 'body is invalid' }) },
    },
    {
      title: `400.3: account can't be blank`,
      path: '/v1/markets/137/usdc/leverage',
      body: {},
      expected: { statusCode: 400, body: JSON.stringify({ code: '400.3', message: `account can't be blank` }) },
    },
    {
      title: '400.4: account is invalid',
      path: '/v1/markets/137/usdc/leverage',
      body: { account: '0x123' },
      expected: { statusCode: 400, body: JSON.stringify({ code: '400.4', message: 'account is invalid' }) },
    },
    {
      title: '400.5: leverage token is not collateral',
      path: '/v1/markets/137/usdc/leverage',
      body: {
        account: '0x9fC7D6E7a3d4aB7b8b28d813f68674C8A6e91e83',
        collateralToken: {
          chainId: 137,
          address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
          decimals: 6,
          symbol: 'USDT',
          name: '(PoS) Tether USD',
        },
        collateralAmount: '1',
        slippage: 100,
      },
      expected: {
        statusCode: 400,
        body: JSON.stringify({ code: '400.5', message: 'leverage token is not collateral' }),
      },
    },
    {
      title: '400.6: target borrow balance is less than baseBorrowMin',
      path: '/v1/markets/1/usdc/leverage',
      body: {
        account: '0xe037cddE28EC42dA5be8a5e90617E287A6eBb149',
        collateralToken: logics.compoundv3.mainnetTokens.WETH,
        collateralAmount: '0.01',
        slippage: 100,
      },
      expected: {
        statusCode: 400,
        body: JSON.stringify({ code: '400.6', message: 'target borrow balance is less than baseBorrowMin: 100' }),
      },
    },
    {
      title: '200: without collateral token and collateral amount',
      path: '/v1/markets/137/usdc/leverage',
      body: { account: '0x9fC7D6E7a3d4aB7b8b28d813f68674C8A6e91e83' },
      expected: { statusCode: 200 },
    },
    {
      title: '200: with collateral token and collateral amount',
      path: '/v1/markets/137/usdc/leverage',
      body: {
        account: '0x9fC7D6E7a3d4aB7b8b28d813f68674C8A6e91e83',
        collateralToken: logics.compoundv3.polygonTokens.WETH,
        collateralAmount: '1',
        slippage: 100,
      },
      expected: { statusCode: 200 },
    },
  ];

  testCases.forEach(({ title, path, body, expected }) => {
    it(title, async function () {
      const event = newTestEvent('POST', path, { body });
      const resp = await testHandler(event, testContext);
      expect(resp.statusCode).to.eq(expected.statusCode);
      if (resp.statusCode > 200) {
        expect(resp.body).to.eq(expected.body);
      } else {
        const parsedBody = JSON.parse(resp.body);
        expect(parsedBody).to.have.keys('quotation', 'fees', 'approvals', 'logics');
        expect(parsedBody.quotation).to.have.keys('leverageTimes', 'currentPosition', 'targetPosition');
        expect(parsedBody.quotation.currentPosition).to.have.keys(
          'utilization',
          'healthRate',
          'liquidationThreshold',
          'supplyUSD',
          'borrowUSD',
          'collateralUSD',
          'netAPR'
        );
        expect(parsedBody.quotation.targetPosition).to.have.keys(
          'utilization',
          'healthRate',
          'liquidationThreshold',
          'supplyUSD',
          'borrowUSD',
          'collateralUSD',
          'netAPR'
        );
      }
    });
  });
});
