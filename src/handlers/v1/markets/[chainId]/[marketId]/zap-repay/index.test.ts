import { expect } from 'chai';
import * as logics from '@protocolink/logics';
import { newTestEvent, testContext, testHandler } from 'test/fixtures/api';

describe('Test get zap repay quotation api', function () {
  const testCases = [
    {
      title: '400.1: market does not exist',
      path: '/v1/markets/137/eth/zap-repay',
      expected: { statusCode: 400, body: JSON.stringify({ code: '400.1', message: 'market does not exist' }) },
    },
    {
      title: '400.2: body is invalid',
      path: '/v1/markets/137/usdc/zap-repay',
      expected: { statusCode: 400, body: JSON.stringify({ code: '400.2', message: 'body is invalid' }) },
    },
    {
      title: `400.3: account can't be blank`,
      path: '/v1/markets/137/usdc/zap-repay',
      body: {},
      expected: { statusCode: 400, body: JSON.stringify({ code: '400.3', message: `account can't be blank` }) },
    },
    {
      title: '400.4: account is invalid',
      path: '/v1/markets/137/usdc/zap-repay',
      body: { account: '0x123' },
      expected: { statusCode: 400, body: JSON.stringify({ code: '400.4', message: 'account is invalid' }) },
    },
    {
      title: '400.5: borrow USD is zero',
      path: '/v1/markets/137/usdc/zap-repay',
      body: {
        account: '0x9fC7D6E7a3d4aB7b8b28d813f68674C8A6e91e83',
        srcToken: {
          chainId: 137,
          address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
          decimals: 6,
          symbol: 'USDT',
          name: '(PoS) Tether USD',
        },
        srcAmount: '1',
        slippage: 100,
      },
      expected: {
        statusCode: 400,
        body: JSON.stringify({ code: '400.5', message: 'borrow USD is zero' }),
      },
    },
    {
      title: '200: without source token and source amount',
      path: '/v1/markets/137/usdc/zap-repay',
      body: { account: '0x9fC7D6E7a3d4aB7b8b28d813f68674C8A6e91e83' },
      expected: { statusCode: 200, keys: ['quotation', 'fees', 'approvals', 'logics'], logicsLength: 0 },
    },
    {
      title: '200: zap repay ERC20 token',
      path: '/v1/markets/137/usdc/zap-repay',
      body: {
        account: '0x0FBeABcaFCf817d47E10a7bCFC15ba194dbD4EEF',
        srcToken: {
          chainId: 137,
          address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
          decimals: 6,
          symbol: 'USDT',
          name: '(PoS) Tether USD',
        },
        srcAmount: '1',
        slippage: 100,
      },
      expected: {
        statusCode: 200,
        keys: ['quotation', 'fees', 'approvals', 'logics', 'permitData'],
        logicsLength: 2,
      },
    },
    {
      title: '200: zap repay base token',
      path: '/v1/markets/137/usdc/zap-repay',
      body: {
        account: '0x0FBeABcaFCf817d47E10a7bCFC15ba194dbD4EEF',
        srcToken: logics.compoundv3.polygonTokens.USDC,
        srcAmount: '1',
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
        expect(parsedBody.quotation).to.have.keys('destAmount', 'currentPosition', 'targetPosition');
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
        expect(parsedBody.logics.length).to.eq(expected.logicsLength);
      }
    });
  });
});
