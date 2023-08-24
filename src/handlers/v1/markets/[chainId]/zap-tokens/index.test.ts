import { expect } from 'chai';
import { newTestEvent, testContext, testHandler } from 'test/fixtures/api';

describe('Test get zap tokens api', function () {
  const testCases = [
    {
      title: '400.1: chain does not exist',
      path: '/v1/999/zap-tokens',
      expected: { statusCode: 400, body: JSON.stringify({ code: '400.1', message: 'chain does not exist' }) },
    },
    {
      title: '200: get zap tokens',
      path: '/v1/137/zap-tokens',
      expected: { statusCode: 200 },
    },
  ];

  testCases.forEach(({ title, path, expected }) => {
    it(title, async function () {
      const event = newTestEvent('GET', path);
      const resp = await testHandler(event, testContext);
      expect(resp.statusCode).to.eq(expected.statusCode);
      if (resp.statusCode > 200) {
        expect(resp.body).to.eq(expected.body);
      } else {
        const parsedBody = JSON.parse(resp.body);
        expect(parsedBody).to.have.keys('tokens');
      }
    });
  });
});
