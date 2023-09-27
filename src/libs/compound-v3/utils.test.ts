import { BigNumber } from 'ethers';
import BigNumberJS from 'bignumber.js';
import { calcAPR, calcHealthRate, calcNetAPR, calcUtilization, transformMarketId } from './utils';
import * as common from '@protocolink/common';
import { expect } from 'chai';

describe('Test transformMarketId', function () {
  const testCases = [
    {
      chainId: common.ChainId.mainnet,
      marketId: 'usdc',
      expected: 'USDC',
    },
    {
      chainId: common.ChainId.mainnet,
      marketId: 'eth',
      expected: 'ETH',
    },
    {
      chainId: common.ChainId.polygon,
      marketId: 'usdc',
      expected: 'USDC',
    },
    {
      chainId: common.ChainId.arbitrum,
      marketId: 'usdc.e',
      expected: 'USDC.e',
    },
    {
      chainId: common.ChainId.arbitrum,
      marketId: 'usdc',
      expected: 'USDC',
    },
    {
      chainId: common.ChainId.mainnet,
      marketId: 'usdc.e',
      expected: undefined,
    },
  ];

  testCases.forEach(({ chainId, marketId, expected }) => {
    it(`${common.toNetworkId(chainId)}: ${expected}`, async function () {
      expect(transformMarketId(chainId, marketId)).to.eq(expected);
    });
  });
});

describe('Test calcAPR', function () {
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
      expect(calcAPR(rate)).to.eq(expected);
    });
  });
});

describe('Test calcUtilization', function () {
  const testCases = [
    {
      borrowCapacityUSD: '0',
      borrowUSD: '0',
      expected: '0',
    },
    {
      borrowCapacityUSD: '100.123456',
      borrowUSD: '50.456789',
      expected: '0.5039',
    },
  ];

  testCases.forEach(({ borrowCapacityUSD, borrowUSD, expected }, i) => {
    it(`case ${i + 1}`, async function () {
      expect(calcUtilization(borrowCapacityUSD, borrowUSD)).to.eq(expected);
    });
  });
});

describe('Test calcHealthRate', function () {
  const testCases = [
    {
      collateralUSD: '0',
      borrowUSD: '0',
      liquidationThreshold: '0',
      expected: 'Infinity',
    },
    {
      collateralUSD: '235.08',
      borrowUSD: '102.2',
      liquidationThreshold: '0.8242',
      expected: '1.9',
    },
    {
      collateralUSD: '120',
      borrowUSD: '102.2',
      liquidationThreshold: '0.8242',
      expected: '0.97',
    },
    {
      collateralUSD: '102.2',
      borrowUSD: '102.2',
      liquidationThreshold: '0.8242',
      expected: '0.82',
    },
  ];

  testCases.forEach(({ collateralUSD, borrowUSD, liquidationThreshold, expected }, i) => {
    it(`case ${i + 1}`, async function () {
      expect(calcHealthRate(collateralUSD, borrowUSD, liquidationThreshold)).to.eq(expected);
    });
  });
});

describe('Test calcNetAPR', function () {
  const testCases = [
    {
      supplyUSD: '0',
      supplyAPR: '0.0284',
      borrowUSD: '0',
      borrowAPR: '0.0445',
      collateralUSD: '0',
      expected: '0',
    },
    {
      supplyUSD: '100.12',
      supplyAPR: '0.0284',
      borrowUSD: '0',
      borrowAPR: '0.0445',
      collateralUSD: '0',
      expected: '0.0284',
    },
    {
      supplyUSD: '0',
      supplyAPR: '0.0284',
      borrowUSD: '0',
      borrowAPR: '0.0445',
      collateralUSD: '100.12',
      expected: '0',
    },
    {
      supplyUSD: '100.12',
      supplyAPR: '0.0284',
      borrowUSD: '0',
      borrowAPR: '0.0445',
      collateralUSD: '100.12',
      expected: '0.0142',
    },
    {
      supplyUSD: '0',
      supplyAPR: '0.0284',
      borrowUSD: '100.12',
      borrowAPR: '0.0445',
      collateralUSD: '200.24',
      expected: '-0.0445',
    },
  ];

  testCases.forEach(({ supplyUSD, supplyAPR, borrowUSD, borrowAPR, collateralUSD, expected }, i) => {
    it(`case ${i + 1}`, async function () {
      const positiveProportion = new BigNumberJS(supplyUSD).times(supplyAPR);
      const negativeProportion = new BigNumberJS(borrowUSD).times(borrowAPR);
      expect(calcNetAPR(supplyUSD, positiveProportion, borrowUSD, negativeProportion, collateralUSD)).to.eq(expected);
    });
  });
});
