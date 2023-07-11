import { BigNumber } from 'ethers';
import BigNumberJS from 'bignumber.js';
import { SECONDS_PER_YEAR } from './constants';
import * as common from '@protocolink/common';
import * as logics from '@protocolink/logics';

export function getMarketLabel(chainId: number, marketId: string) {
  if (chainId === common.ChainId.arbitrum && marketId === logics.compoundv3.MarketId.USDC) {
    return 'USDC.e';
  }
  return marketId;
}

export function formatValue(value: string | BigNumberJS) {
  return new BigNumberJS(value).decimalPlaces(2).toFixed();
}

export function calcApr(rate: BigNumber) {
  return common.toBigUnit(rate.mul(SECONDS_PER_YEAR), 18, { displayDecimals: 4 });
}

export function calcUtilization(borrowCapacityValue: string | BigNumberJS, borrowValue: string | BigNumberJS) {
  let utilization = '0';
  borrowCapacityValue = new BigNumberJS(borrowCapacityValue);
  if (!borrowCapacityValue.isZero()) {
    utilization = new BigNumberJS(borrowValue).div(borrowCapacityValue).decimalPlaces(4).toFixed();
  }

  return utilization;
}

export function calchealthRate(
  supplyValue: string | BigNumberJS,
  collateralValue: string | BigNumberJS,
  borrowValue: string | BigNumberJS,
  liquidationThreshold: string | BigNumberJS
) {
  return new BigNumberJS(supplyValue)
    .plus(collateralValue)
    .times(liquidationThreshold)
    .div(borrowValue)
    .decimalPlaces(2)
    .toFixed();
}

export function calcNetApr(
  supplyValue: string | BigNumberJS,
  supplyApr: string | BigNumberJS,
  collateralValue: string | BigNumberJS,
  borrowValue: string | BigNumberJS,
  borrowApr: string | BigNumberJS
) {
  const totalSupply = new BigNumberJS(supplyValue).plus(collateralValue);

  let netApr = '0';
  if (!totalSupply.isZero()) {
    netApr = new BigNumberJS(supplyValue)
      .times(supplyApr)
      .minus(new BigNumberJS(borrowValue).times(borrowApr))
      .div(totalSupply)
      .decimalPlaces(4)
      .toFixed();
  }

  return netApr;
}
