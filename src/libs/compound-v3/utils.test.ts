import { BigNumber } from 'ethers';
import { calcApr, calcNetApr, calcUtilization, calchealthRate, formatValue, getMarketLabel } from './utils';
import * as common from '@protocolink/common';
import { expect } from 'chai';
import * as logics from '@protocolink/logics';

describe('Test getMarketLabel', function () {
  const testCases = [
    {
      chainId: common.ChainId.mainnet,
      marketId: logics.compoundv3.MarketId.USDC,
      expected: 'USDC',
    },
    {
      chainId: common.ChainId.mainnet,
      marketId: logics.compoundv3.MarketId.ETH,
      expected: 'ETH',
    },
    {
      chainId: common.ChainId.polygon,
      marketId: logics.compoundv3.MarketId.USDC,
      expected: 'USDC',
    },
    {
      chainId: common.ChainId.arbitrum,
      marketId: logics.compoundv3.MarketId.USDC,
      expected: 'USDC.e',
    },
  ];

  testCases.forEach(({ chainId, marketId, expected }) => {
    it(`${common.toNetworkId(chainId)}: ${expected}`, async function () {
      expect(getMarketLabel(chainId, marketId)).to.eq(expected);
    });
  });
});

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

describe('Test calcApr', function () {
  const testCases = [
    {
      rate: BigNumber.from(1821752417),
      expected: '0.0574',
    },
    {
      rate: BigNumber.from(1267440384),
      expected: '0.0399',
    },
  ];

  testCases.forEach(({ rate, expected }, i) => {
    it(`case ${i + 1}`, async function () {
      expect(calcApr(rate)).to.eq(expected);
    });
  });
});

describe('Test calcUtilization', function () {
  const testCases = [
    {
      borrowCapacityValue: '0',
      borrowValue: '0',
      expected: '0',
    },
    {
      borrowCapacityValue: '100.123456',
      borrowValue: '50.456789',
      expected: '0.5039',
    },
  ];

  testCases.forEach(({ borrowCapacityValue, borrowValue, expected }, i) => {
    it(`case ${i + 1}`, async function () {
      expect(calcUtilization(borrowCapacityValue, borrowValue)).to.eq(expected);
    });
  });
});

describe('Test calcUtilization', function () {
  const testCases = [
    {
      supplyValue: '0',
      collateralValue: '0',
      borrowValue: '0',
      liquidationThreshold: '0',
      expected: 'NaN',
    },
    {
      supplyValue: '0',
      collateralValue: '235.08',
      borrowValue: '102.2',
      liquidationThreshold: '0.8242',
      expected: '1.9',
    },
    {
      supplyValue: '0',
      collateralValue: '120',
      borrowValue: '102.2',
      liquidationThreshold: '0.8242',
      expected: '0.97',
    },
    {
      supplyValue: '0',
      collateralValue: '102.2',
      borrowValue: '102.2',
      liquidationThreshold: '0.8242',
      expected: '0.82',
    },
  ];

  testCases.forEach(({ supplyValue, collateralValue, borrowValue, liquidationThreshold, expected }, i) => {
    it(`case ${i + 1}`, async function () {
      expect(calchealthRate(supplyValue, collateralValue, borrowValue, liquidationThreshold)).to.eq(expected);
    });
  });
});

describe('Test calcNetApr', function () {
  const testCases = [
    {
      supplyValue: '0',
      supplyApr: '0.0284',
      collateralValue: '0',
      borrowValue: '0',
      borrowApr: '0.0445',
      expected: '0',
    },
    {
      supplyValue: '100.12',
      supplyApr: '0.0284',
      collateralValue: '0',
      borrowValue: '0',
      borrowApr: '0.0445',
      expected: '0.0284',
    },
    {
      supplyValue: '0',
      supplyApr: '0.0284',
      collateralValue: '100.12',
      borrowValue: '0',
      borrowApr: '0.0445',
      expected: '0',
    },
    {
      supplyValue: '100.12',
      supplyApr: '0.0284',
      collateralValue: '100.12',
      borrowValue: '0',
      borrowApr: '0.0445',
      expected: '0.0142',
    },
    {
      supplyValue: '0',
      supplyApr: '0.0284',
      collateralValue: '200.24',
      borrowValue: '100.12',
      borrowApr: '0.0445',
      expected: '-0.0223',
    },
  ];

  testCases.forEach(({ supplyValue, supplyApr, collateralValue, borrowValue, borrowApr, expected }, i) => {
    it(`case ${i + 1}`, async function () {
      expect(calcNetApr(supplyValue, supplyApr, collateralValue, borrowValue, borrowApr)).to.eq(expected);
    });
  });
});
