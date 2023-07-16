import BigNumberJS from 'bignumber.js';

export function formatValue(value: string | BigNumberJS) {
  return new BigNumberJS(value).decimalPlaces(2).toFixed();
}
