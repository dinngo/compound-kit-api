import { expect } from 'chai';
import { newTestEvent, testContext, testHandler } from 'test/fixtures/api';

describe('Test docs api', function () {
  it('302', async function () {
    const event = newTestEvent('GET', '/docs');
    const resp = await testHandler(event, testContext);
    expect(resp.statusCode).to.eq(302);
    expect(resp.headers.Location).to.eq('https://app.swaggerhub.com/apis-docs/dinngodev/compound-kit');
  });
});
