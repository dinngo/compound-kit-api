import { expect } from 'chai';
import * as logics from '@protocolink/logics';
import { newTestEvent, testContext, testHandler } from 'test/fixtures/api';

describe('Test get zap supply quotation api', function () {
  const testCases = [
    {
      title: '400.1: market does not exist',
      path: '/v1/markets/137/eth/zap-supply',
      expected: { statusCode: 400, body: JSON.stringify({ code: '400.1', message: 'market does not exist' }) },
    },
    {
      title: '400.2: body is invalid',
      path: '/v1/markets/137/usdc/zap-supply',
      expected: { statusCode: 400, body: JSON.stringify({ code: '400.2', message: 'body is invalid' }) },
    },
    {
      title: `400.3: account can't be blank`,
      path: '/v1/markets/137/usdc/zap-supply',
      body: {},
      expected: { statusCode: 400, body: JSON.stringify({ code: '400.3', message: `account can't be blank` }) },
    },
    {
      title: '400.4: account is invalid',
      path: '/v1/markets/137/usdc/zap-supply',
      body: { account: '0x123' },
      expected: { statusCode: 400, body: JSON.stringify({ code: '400.4', message: 'account is invalid' }) },
    },
    {
      title: '400.5: target token is not collateral nor base',
      path: '/v1/markets/137/usdc/zap-supply',
      body: {
        account: '0x9fC7D6E7a3d4aB7b8b28d813f68674C8A6e91e83',
        sourceToken: {
          chainId: 137,
          address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
          decimals: 6,
          symbol: 'USDT',
          name: '(PoS) Tether USD',
        },
        amount: '1',
        targetToken: {
          chainId: 137,
          address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
          decimals: 6,
          symbol: 'USDT',
          name: '(PoS) Tether USD',
        },
        slippage: 100,
      },
      expected: {
        statusCode: 400,
        body: JSON.stringify({ code: '400.5', message: 'target token is not collateral nor base' }),
      },
    },
    {
      title: '400.6: borrow USD is not zero',
      path: '/v1/markets/137/usdc/zap-supply',
      body: {
        account: '0x0fbeabcafcf817d47e10a7bcfc15ba194dbd4eef',
        sourceToken: {
          chainId: 137,
          address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
          decimals: 6,
          symbol: 'USDT',
          name: '(PoS) Tether USD',
        },
        amount: '1',
        targetToken: logics.compoundv3.polygonTokens.USDC,
        slippage: 100,
      },
      expected: {
        statusCode: 400,
        body: JSON.stringify({ code: '400.6', message: 'borrow USD is not zero' }),
      },
    },
    {
      title: '200: without source token and amount',
      path: '/v1/markets/137/usdc/zap-supply',
      body: {
        account: '0x9fC7D6E7a3d4aB7b8b28d813f68674C8A6e91e83',
        targetToken: logics.compoundv3.polygonTokens.USDC,
      },
      expected: { statusCode: 200, keys: ['quotation', 'fees', 'approvals', 'logics'], logicsLength: 0 },
    },
    {
      title: '200: without target token',
      path: '/v1/markets/137/usdc/zap-supply',
      body: {
        account: '0x9fC7D6E7a3d4aB7b8b28d813f68674C8A6e91e83',
        sourceToken: logics.compoundv3.polygonTokens.WETH,
        amount: '1',
        slippage: 100,
      },
      expected: { statusCode: 200, keys: ['quotation', 'fees', 'approvals', 'logics'], logicsLength: 0 },
    },
    {
      title: '200: zap supply collateral',
      path: '/v1/markets/137/usdc/zap-supply',
      body: {
        account: '0x9fC7D6E7a3d4aB7b8b28d813f68674C8A6e91e83',
        sourceToken: {
          chainId: 137,
          address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
          decimals: 6,
          symbol: 'USDT',
          name: '(PoS) Tether USD',
        },
        amount: '1',
        targetToken: logics.compoundv3.polygonTokens.WMATIC,
        slippage: 100,
      },
      expected: {
        statusCode: 200,
        keys: ['quotation', 'fees', 'approvals', 'logics', 'permitData'],
        logicsLength: 2,
      },
    },
    {
      title: '200: zap supply base',
      path: '/v1/markets/137/usdc/zap-supply',
      body: {
        account: '0x9fC7D6E7a3d4aB7b8b28d813f68674C8A6e91e83',
        sourceToken: {
          chainId: 137,
          address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
          decimals: 6,
          symbol: 'USDT',
          name: '(PoS) Tether USD',
        },
        amount: '1',
        targetToken: logics.compoundv3.polygonTokens.USDC,
        slippage: 100,
      },
      expected: {
        statusCode: 200,
        keys: ['quotation', 'fees', 'approvals', 'logics', 'permitData'],
        logicsLength: 2,
      },
    },
    {
      title: '200: source token is target token',
      path: '/v1/markets/137/usdc/zap-supply',
      body: {
        account: '0x9fC7D6E7a3d4aB7b8b28d813f68674C8A6e91e83',
        sourceToken: logics.compoundv3.polygonTokens.USDC,
        amount: '1',
        targetToken: logics.compoundv3.polygonTokens.USDC,
        slippage: 100,
      },
      expected: {
        statusCode: 200,
        keys: ['quotation', 'fees', 'approvals', 'logics', 'permitData'],
        logicsLength: 1,
      },
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
        expect(parsedBody).to.have.keys(<string[]>expected.keys);
        expect(parsedBody.quotation).to.have.keys('targetTokenAmount', 'currentPosition', 'targetPosition');
        expect(parsedBody.quotation.currentPosition).to.have.keys(
          'utilization',
          'healthRate',
          'liquidationThreshold',
          'borrowUSD',
          'collateralUSD',
          'netAPR'
        );
        expect(parsedBody.quotation.targetPosition).to.have.keys(
          'utilization',
          'healthRate',
          'liquidationThreshold',
          'borrowUSD',
          'collateralUSD',
          'netAPR'
        );
        expect(parsedBody.logics.length).to.eq(expected.logicsLength);
      }
    });
  });
});
