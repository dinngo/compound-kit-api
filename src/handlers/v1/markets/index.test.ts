import { expect } from 'chai';
import { newTestEvent, testContext, testHandler } from 'test/fixtures/api';

describe('Test get markets api', function () {
  const testCases = [{ path: '/v1/markets', expected: { statusCode: 200 } }];

  testCases.forEach((testCase) => {
    it(`${testCase.expected.statusCode}`, async function () {
      const event = newTestEvent('GET', testCase.path);
      const resp = await testHandler(event, testContext);
      expect(resp.statusCode).to.eq(testCase.expected.statusCode);
      const body = JSON.parse(resp.body);
      expect(body).to.have.keys('marketGroups');
      for (const marketGroup of body.marketGroups) {
        expect(marketGroup).to.have.all.keys(['chainId', 'markets']);
        for (const market of marketGroup.markets) {
          expect(market).to.have.all.keys(['id', 'label']);
        }
      }
    });
  });
});
