import * as common from '@protocolink/common';
import { expect } from 'chai';
import * as logics from '@protocolink/logics';
import { newTestEvent, testContext, testHandler } from 'test/fixtures/api';

describe('Test get market api', function () {
  const testCases = [
    {
      title: '400.1: market does not exist',
      path: '/v1/markets/137/eth',
      expected: { statusCode: 400, body: JSON.stringify({ code: '400.1', message: 'market does not exist' }) },
    },
    {
      title: '400.2: account is invalid',
      path: '/v1/markets/1/usdc',
      queryStringParameters: { account: '0x123' },
      expected: { statusCode: 400, body: JSON.stringify({ code: '400.2', message: 'account is invalid' }) },
    },
    ...logics.compoundv3.configs.reduce((accumulator, config) => {
      const { chainId, markets } = config;
      for (const market of markets) {
        accumulator.push(
          {
            title: `200: ${common.toNetworkId(chainId)} ${market.id} market no account`,
            path: `/v1/markets/${chainId}/${market.id.toLowerCase()}`,
            expected: { statusCode: 200 },
          },
          {
            title: `200: ${common.toNetworkId(chainId)} ${market.id} market with account`,
            path: `/v1/markets/${chainId}/${market.id.toLowerCase()}`,
            queryStringParameters: { account: '0x9fC7D6E7a3d4aB7b8b28d813f68674C8A6e91e83' },
            expected: { statusCode: 200 },
          }
        );
      }
      return accumulator;
    }, [] as any[]),
  ];

  testCases.forEach(({ title, path, queryStringParameters, expected }) => {
    it(title, async function () {
      const event = newTestEvent('GET', path, { queryStringParameters });
      const resp = await testHandler(event, testContext);
      expect(resp.statusCode).to.eq(expected.statusCode);
      if (resp.statusCode > 200) {
        expect(resp.body).to.eq(expected.body);
      } else {
        const body = JSON.parse(resp.body);
        expect(body).to.have.all.keys([
          'baseToken',
          'baseTokenPrice',
          'baseBorrowMin',
          'supplyAPR',
          'supplyBalance',
          'supplyUSD',
          'borrowAPR',
          'borrowBalance',
          'borrowUSD',
          'collateralUSD',
          'borrowCapacity',
          'borrowCapacityUSD',
          'availableToBorrow',
          'availableToBorrowUSD',
          'liquidationLimit',
          'liquidationThreshold',
          'liquidationRisk',
          'liquidationPoint',
          'liquidationPointUSD',
          'utilization',
          'healthRate',
          'netAPR',
          'collaterals',
        ]);
        for (const collateral of body.collaterals) {
          expect(collateral).to.have.all.keys([
            'asset',
            'assetPrice',
            'borrowCollateralFactor',
            'liquidateCollateralFactor',
            'collateralBalance',
            'collateralUSD',
            'borrowCapacity',
            'borrowCapacityUSD',
          ]);
        }
      }
    });
  });
});
