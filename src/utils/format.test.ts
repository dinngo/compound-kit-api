import { expect } from 'chai';
import { formatValue } from './format';

describe('Test formatValue', function () {
  const testCases = [
    {
      value: '123.12345',
      expected: '123.12',
    },
    {
      value: '123.12567',
      expected: '123.13',
    },
    {
      value: '123.19567',
      expected: '123.2',
    },
  ];

  testCases.forEach(({ value, expected }, i) => {
    it(`case ${i + 1}`, async function () {
      expect(formatValue(value)).to.eq(expected);
    });
  });
});
