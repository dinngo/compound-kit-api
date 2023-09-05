import { expect } from 'chai';
import * as logics from '@protocolink/logics';
import { newTestEvent, testContext, testHandler } from 'test/fixtures/api';

describe('Test get zap withdraw quotation api', function () {
  const testCases = [
    {
      title: '400.1: market does not exist',
      path: '/v1/markets/137/eth/zap-withdraw',
      expected: { statusCode: 400, body: JSON.stringify({ code: '400.1', message: 'market does not exist' }) },
    },
    {
      title: '400.2: body is invalid',
      path: '/v1/markets/137/usdc/zap-withdraw',
      expected: { statusCode: 400, body: JSON.stringify({ code: '400.2', message: 'body is invalid' }) },
    },
    {
      title: `400.3: account can't be blank`,
      path: '/v1/markets/137/usdc/zap-withdraw',
      body: {},
      expected: { statusCode: 400, body: JSON.stringify({ code: '400.3', message: `account can't be blank` }) },
    },
    {
      title: '400.4: account is invalid',
      path: '/v1/markets/137/usdc/zap-withdraw',
      body: { account: '0x123' },
      expected: { statusCode: 400, body: JSON.stringify({ code: '400.4', message: 'account is invalid' }) },
    },
    {
      title: '400.5: source amount is greater than available base amount',
      path: '/v1/markets/137/usdc/zap-withdraw',
      body: {
        account: '0x9fC7D6E7a3d4aB7b8b28d813f68674C8A6e91e83',
        srcToken: logics.compoundv3.polygonTokens.USDC,
        srcAmount: '1',
        destToken: {
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
        body: JSON.stringify({ code: '400.5', message: 'source amount is greater than available base amount' }),
      },
    },
    {
      title: '400.6: source token is not collateral nor base',
      path: '/v1/markets/137/usdc/zap-withdraw',
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
        destToken: {
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
        body: JSON.stringify({ code: '400.6', message: 'source token is not collateral nor base' }),
      },
    },
    {
      title: '400.7: source amount is greater than available collateral amount',
      path: '/v1/markets/137/usdc/zap-withdraw',
      body: {
        account: '0x9fC7D6E7a3d4aB7b8b28d813f68674C8A6e91e83',
        srcToken: logics.compoundv3.polygonTokens.WMATIC,
        srcAmount: '1',
        destToken: {
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
        body: JSON.stringify({
          code: '400.7',
          message: 'source amount is greater than available collateral amount',
        }),
      },
    },
    {
      title: '200: without source token and source amount',
      path: '/v1/markets/137/usdc/zap-withdraw',
      body: {
        account: '0x8238892095d3bac5322894e84f349bcd52f843d5',
        destToken: logics.compoundv3.polygonTokens.USDC,
      },
      expected: { statusCode: 200, keys: ['quotation', 'fees', 'approvals', 'logics'], logicsLength: 0 },
    },
    {
      title: '200: without destination token',
      path: '/v1/markets/137/usdc/zap-withdraw',
      body: {
        account: '0x8238892095d3bac5322894e84f349bcd52f843d5',
        srcToken: logics.compoundv3.polygonTokens.USDC,
        srcAmount: '1',
      },
      expected: { statusCode: 200, keys: ['quotation', 'fees', 'approvals', 'logics'], logicsLength: 0 },
    },
    {
      title: '200: zap withdraw base token',
      path: '/v1/markets/137/usdc/zap-withdraw',
      body: {
        account: '0x43158f45b5EbD7b1179130130DF00393928C2691',
        srcToken: logics.compoundv3.polygonTokens.USDC,
        srcAmount: '1',
        destToken: {
          chainId: 137,
          address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
          decimals: 6,
          symbol: 'USDT',
          name: '(PoS) Tether USD',
        },
        slippage: 100,
      },
      expected: { statusCode: 200, keys: ['quotation', 'fees', 'approvals', 'logics', 'permitData'], logicsLength: 2 },
    },
    {
      title: '200: zap withdraw collateral',
      path: '/v1/markets/137/usdc/zap-withdraw',
      body: {
        account: '0x0FBeABcaFCf817d47E10a7bCFC15ba194dbD4EEF',
        srcToken: logics.compoundv3.polygonTokens.WETH,
        srcAmount: '0.01',
        destToken: {
          chainId: 137,
          address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
          decimals: 6,
          symbol: 'USDT',
          name: '(PoS) Tether USD',
        },
        slippage: 100,
      },
      expected: { statusCode: 200, keys: ['quotation', 'fees', 'approvals', 'logics'], logicsLength: 2 },
    },
    {
      title: '200: source token is destination token',
      path: '/v1/markets/137/usdc/zap-withdraw',
      body: {
        account: '0x43158f45b5EbD7b1179130130DF00393928C2691',
        srcToken: logics.compoundv3.polygonTokens.USDC,
        srcAmount: '1',
        destToken: logics.compoundv3.polygonTokens.USDC,
        slippage: 100,
      },
      expected: { statusCode: 200, keys: ['quotation', 'fees', 'approvals', 'logics', 'permitData'], logicsLength: 1 },
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
