import { expect } from 'chai';
import * as logics from '@protocolink/logics';
import { newTestEvent, testContext, testHandler } from 'test/fixtures/api';

describe('Test get collateral swap quotation api', function () {
  const testCases = [
    {
      title: '400.1: market does not exist',
      path: '/v1/markets/137/eth/collateral-swap',
      expected: { statusCode: 400, body: JSON.stringify({ code: '400.1', message: 'market does not exist' }) },
    },
    {
      title: '400.2: body is invalid',
      path: '/v1/markets/137/usdc/collateral-swap',
      expected: { statusCode: 400, body: JSON.stringify({ code: '400.2', message: 'body is invalid' }) },
    },
    {
      title: `400.3: account can't be blank`,
      path: '/v1/markets/137/usdc/collateral-swap',
      body: {},
      expected: { statusCode: 400, body: JSON.stringify({ code: '400.3', message: `account can't be blank` }) },
    },
    {
      title: '400.4: account is invalid',
      path: '/v1/markets/137/usdc/collateral-swap',
      body: { account: '0x123' },
      expected: { statusCode: 400, body: JSON.stringify({ code: '400.4', message: 'account is invalid' }) },
    },
    {
      title: '400.5: withdrawal token is not collateral',
      path: '/v1/markets/137/usdc/collateral-swap',
      body: {
        account: '0x9fC7D6E7a3d4aB7b8b28d813f68674C8A6e91e83',
        withdrawalToken: {
          chainId: 137,
          address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
          decimals: 18,
          symbol: 'USDT',
          name: '(PoS) Tether USD',
        },
        amount: '1',
        targetToken: {
          chainId: 137,
          address: '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619',
          decimals: 18,
          symbol: 'WETH',
          name: 'Wrapped Ether',
        },
        slippage: 100,
      },
      expected: {
        statusCode: 400,
        body: JSON.stringify({ code: '400.5', message: 'withdrawal token is not collateral' }),
      },
    },
    {
      title: '200: without token and amount',
      path: '/v1/markets/137/usdc/collateral-swap',
      body: { account: '0x9fC7D6E7a3d4aB7b8b28d813f68674C8A6e91e83' },
      expected: { statusCode: 200 },
    },
    {
      title: '200: without target token',
      path: '/v1/markets/137/usdc/collateral-swap',
      body: {
        account: '0x9fC7D6E7a3d4aB7b8b28d813f68674C8A6e91e83',
        withdrawalToken: logics.compoundv3.polygonTokens.WETH,
        amount: '1',
        slippage: 100,
      },
      expected: { statusCode: 200 },
    },
    {
      title: '200: with token and amount',
      path: '/v1/markets/137/usdc/collateral-swap',
      body: {
        account: '0x9fC7D6E7a3d4aB7b8b28d813f68674C8A6e91e83',
        withdrawalToken: logics.compoundv3.polygonTokens.WETH,
        amount: '1',
        targetToken: logics.compoundv3.polygonTokens.WMATIC,
        slippage: 100,
      },
      expected: { statusCode: 200 },
    },
    {
      title: '200: with zero slippage',
      path: '/v1/markets/137/usdc/collateral-swap',
      body: {
        account: '0x9fC7D6E7a3d4aB7b8b28d813f68674C8A6e91e83',
        withdrawalToken: logics.compoundv3.polygonTokens.WETH,
        amount: '1',
        targetToken: logics.compoundv3.polygonTokens.WMATIC,
        slippage: 0,
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
        expect(parsedBody).to.have.keys('quotation', 'approvals', 'logics');
        expect(parsedBody.quotation).to.have.keys('targetTokenAmount', 'currentPosition', 'targetPosition');
        expect(parsedBody.quotation.currentPosition).to.have.keys('utilization', 'healthRate', 'netApr', 'totalDebt');
        expect(parsedBody.quotation.targetPosition).to.have.keys('utilization', 'healthRate', 'netApr', 'totalDebt');
      }
    });
  });
});
