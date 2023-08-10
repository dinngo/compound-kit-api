import { expect } from 'chai';
import { newTestEvent, testContext, testHandler } from 'test/fixtures/api';

describe('Test build transaction api', function () {
  const testCases = [
    {
      title: `400.1: body is invalid`,
      expected: { statusCode: 400, body: JSON.stringify({ code: '400.1', message: 'body is invalid' }) },
    },
    {
      title: `400.2: chainId can't be blank`,
      body: {},
      expected: { statusCode: 400, body: JSON.stringify({ code: '400.2', message: `chainId can't be blank` }) },
    },
    {
      title: '400.3: chainId is invalid',
      body: { chainId: 'a' },
      expected: { statusCode: 400, body: JSON.stringify({ code: '400.3', message: 'chainId is invalid' }) },
    },
    {
      title: '400.4: chainId is not supported',
      body: { chainId: 1337 },
      expected: { statusCode: 400, body: JSON.stringify({ code: '400.4', message: 'chainId is not supported' }) },
    },
    {
      title: `400.5: account can't be blank`,
      body: { chainId: 1 },
      expected: { statusCode: 400, body: JSON.stringify({ code: '400.5', message: `account can't be blank` }) },
    },
    {
      title: '400.6: account is invalid',
      body: { chainId: 1, account: '0x123' },
      expected: { statusCode: 400, body: JSON.stringify({ code: '400.6', message: 'account is invalid' }) },
    },
    {
      title: `400.7: logics can't be blank (without param)`,
      body: { chainId: 1, account: '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa' },
      expected: { statusCode: 400, body: JSON.stringify({ code: '400.7', message: `logics can't be blank` }) },
    },
    {
      title: `400.7: logics can't be blank (empty array)`,
      body: { chainId: 1, account: '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa', logics: [] },
      expected: { statusCode: 400, body: JSON.stringify({ code: '400.7', message: `logics can't be blank` }) },
    },
    {
      title: '200',
      body: {
        chainId: 137,
        account: '0x9fC7D6E7a3d4aB7b8b28d813f68674C8A6e91e83',
        logics: [
          {
            rid: 'utility:flash-loan-aggregator',
            fields: {
              id: '884af393-5463-40a8-92dc-3e66bbf0387a',
              protocolId: 'balancer-v2',
              loans: [
                {
                  token: {
                    chainId: 137,
                    address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
                    decimals: 6,
                    symbol: 'USDC',
                    name: 'USD Coin (PoS)',
                  },
                  amount: '1852.34189',
                },
              ],
              isLoan: true,
            },
          },
          {
            rid: 'paraswap-v5:swap-token',
            fields: {
              input: {
                token: {
                  chainId: 137,
                  address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
                  decimals: 6,
                  symbol: 'USDC',
                  name: 'USD Coin (PoS)',
                },
                amount: '1852.34189',
              },
              output: {
                token: {
                  chainId: 137,
                  address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
                  decimals: 18,
                  symbol: 'WETH',
                  name: 'Wrapped Ether',
                },
                amount: '1',
              },
              slippage: 100,
            },
          },
          {
            rid: 'compound-v3:supply-collateral',
            fields: {
              marketId: 'USDC',
              input: {
                token: {
                  chainId: 137,
                  address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
                  decimals: 18,
                  symbol: 'WETH',
                  name: 'Wrapped Ether',
                },
                amount: '1',
              },
              balanceBps: 10000,
            },
          },
          {
            rid: 'compound-v3:borrow',
            fields: {
              marketId: 'USDC',
              output: {
                token: {
                  chainId: 137,
                  address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
                  decimals: 6,
                  symbol: 'USDC',
                  name: 'USD Coin (PoS)',
                },
                amount: '1852.34189',
              },
            },
          },
          {
            rid: 'utility:flash-loan-aggregator',
            fields: {
              id: '884af393-5463-40a8-92dc-3e66bbf0387a',
              protocolId: 'balancer-v2',
              loans: [
                {
                  token: {
                    chainId: 137,
                    address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
                    decimals: 6,
                    symbol: 'USDC',
                    name: 'USD Coin (PoS)',
                  },
                  amount: '1852.34189',
                },
              ],
              isLoan: false,
            },
          },
        ],
      },
      expected: { statusCode: 200 },
    },
  ];

  testCases.forEach(({ title, body, expected }) => {
    it(title, async function () {
      const event = newTestEvent('POST', '/v1/transactions/build', { body });
      const resp = await testHandler(event, testContext);
      expect(resp.statusCode).to.eq(expected.statusCode);
      if (resp.statusCode > 200) {
        expect(resp.body).to.eq(expected.body);
      } else {
        expect(JSON.parse(resp.body)).to.have.keys('to', 'data', 'value');
      }
    });
  });
});
