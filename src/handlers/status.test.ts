import { expect } from 'chai';
import { newTestEvent, testContext, testHandler } from 'test/fixtures/api';
import { version } from 'package.json';

describe('Test status api', function () {
  const testCases = [
    { path: '/status', expected: { statusCode: 200, body: `{"version":"${version}"}` } },
    { path: '/not_found', expected: { statusCode: 404, body: 'Route does not exist' } },
  ];

  testCases.forEach((testCase) => {
    it(`${testCase.expected.statusCode}`, async function () {
      const event = newTestEvent('GET', testCase.path);
      const resp = await testHandler(event, testContext);
      expect(resp.statusCode).to.eq(testCase.expected.statusCode);
      expect(resp.body).to.eq(testCase.expected.body);
    });
  });
});
