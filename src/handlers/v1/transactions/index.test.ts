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
        account: '0xa3C1C91403F0026b9dd086882aDbC8Cdbc3b3cfB',
        logics: [
          {
            rid: 'balancer-v2:flash-loan',
            fields: {
              id: '8d6c7384-2564-40d1-a7d7-e87435419098',
              outputs: [
                {
                  token: {
                    chainId: 137,
                    address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
                    decimals: 18,
                    symbol: 'WETH',
                    name: 'Wrapped Ether',
                  },
                  amount: '1',
                },
              ],
              isLoan: true,
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
                amount: '1945.825687',
              },
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
                amount: '1945.825687',
              },
              output: {
                token: {
                  chainId: 137,
                  address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
                  decimals: 18,
                  symbol: 'WETH',
                  name: 'Wrapped Ether',
                },
                amount: '1.004727526209644276',
              },
              slippage: 100,
            },
          },
          {
            rid: 'balancer-v2:flash-loan',
            fields: {
              id: '8d6c7384-2564-40d1-a7d7-e87435419098',
              outputs: [
                {
                  token: {
                    chainId: 137,
                    address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
                    decimals: 18,
                    symbol: 'WETH',
                    name: 'Wrapped Ether',
                  },
                  amount: '1',
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
      const event = newTestEvent('POST', '/v1/transactions', { body });
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
