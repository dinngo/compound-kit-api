import { expect } from 'chai';
import * as logics from '@protocolink/logics';
import { newTestEvent, testContext, testHandler } from 'test/fixtures/api';

describe('Test get zap borrow quotation api', function () {
  const testCases = [
    {
      title: '400.1: market does not exist',
      path: '/v1/markets/137/eth/zap-borrow',
      expected: { statusCode: 400, body: JSON.stringify({ code: '400.1', message: 'market does not exist' }) },
    },
    {
      title: '400.2: body is invalid',
      path: '/v1/markets/137/usdc/zap-borrow',
      expected: { statusCode: 400, body: JSON.stringify({ code: '400.2', message: 'body is invalid' }) },
    },
    {
      title: `400.3: account can't be blank`,
      path: '/v1/markets/137/usdc/zap-borrow',
      body: {},
      expected: { statusCode: 400, body: JSON.stringify({ code: '400.3', message: `account can't be blank` }) },
    },
    {
      title: '400.4: account is invalid',
      path: '/v1/markets/137/usdc/zap-borrow',
      body: { account: '0x123' },
      expected: { statusCode: 400, body: JSON.stringify({ code: '400.4', message: 'account is invalid' }) },
    },
    {
      title: '400.5: supply USD is not zero',
      path: '/v1/markets/137/usdc/zap-borrow',
      body: {
        account: '0x1fce401a690b0800d916429653c11a11b162e8d6',
        baseAmount: '1',
        destToken: logics.compoundv3.polygonTokens.USDC,
        slippage: 100,
      },
      expected: {
        statusCode: 400,
        body: JSON.stringify({ code: '400.5', message: 'supply USD is not zero' }),
      },
    },
    {
      title: '400.6: base amount is greater than available amount',
      path: '/v1/markets/137/usdc/zap-borrow',
      body: {
        account: '0x831f31aB7a86e242353463A991268a501F845939',
        baseAmount: '1',
        destToken: logics.compoundv3.polygonTokens.USDC,
        slippage: 100,
      },
      expected: {
        statusCode: 400,
        body: JSON.stringify({ code: '400.6', message: 'base amount is greater than available amount' }),
      },
    },
    {
      title: '200: without base amount and destination token',
      path: '/v1/markets/137/usdc/zap-borrow',
      body: { account: '0x9fC7D6E7a3d4aB7b8b28d813f68674C8A6e91e83' },
      expected: { statusCode: 200, logicsLength: 0 },
    },
    {
      title: '200: zap borrow base token',
      path: '/v1/markets/137/usdc/zap-borrow',
      body: {
        account: '0x0FBeABcaFCf817d47E10a7bCFC15ba194dbD4EEF',
        baseAmount: '1',
        destToken: logics.compoundv3.polygonTokens.USDC,
        slippage: 100,
      },
      expected: { statusCode: 200, logicsLength: 1 },
    },
    {
      title: '200: zap borrow USDT',
      path: '/v1/markets/137/usdc/zap-borrow',
      body: {
        account: '0x0FBeABcaFCf817d47E10a7bCFC15ba194dbD4EEF',
        baseAmount: '1',
        destToken: {
          chainId: 137,
          address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
          decimals: 6,
          symbol: 'USDT',
          name: '(PoS) Tether USD',
        },
        slippage: 100,
      },
      expected: { statusCode: 200, logicsLength: 2 },
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
        expect(parsedBody.quotation).to.have.keys('destAmount', 'currentPosition', 'targetPosition');
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
