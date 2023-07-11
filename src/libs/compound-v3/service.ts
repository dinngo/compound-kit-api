import { BigNumber, providers } from 'ethers';
import BigNumberJS from 'bignumber.js';
import { CollateralInfo, MarketInfo } from './types';
import { calcApr, calcNetApr, calcUtilization, calchealthRate, formatValue } from './utils';
import * as common from '@protocolink/common';
import { getCustomBaseTokenPriceFeed } from './configs';
import * as logics from '@protocolink/logics';

interface Market {
  cometAddress: string;
  baseToken: common.Token;
  baseTokenPriceFeed: string;
  numAssets: number;
  utilization: string;
  assets: {
    asset: common.Token;
    priceFeed: string;
    borrowCollateralFactor: string;
    liquidateCollateralFactor: string;
  }[];
}

export class Service extends logics.compoundv3.Service {
  static provider?: providers.Provider;

  readonly blockTag?: providers.BlockTag;

  constructor(chainId: number, blockTag?: providers.BlockTag) {
    super(chainId, Service.provider);
    this.blockTag = blockTag;
  }

  private _marketMap: Record<string, Market> = {};

  async getMarket(marketId: string) {
    if (!this._marketMap[marketId]) {
      const cometAddress = logics.compoundv3.getMarket(this.chainId, marketId).cometAddress;
      const iface = logics.compoundv3.Comet__factory.createInterface();

      let baseTokenAddress: string;
      let baseTokenPriceFeed: string;
      let numAssets: number;
      let utilization: BigNumber;
      {
        const calls: common.Multicall2.CallStruct[] = [
          {
            target: cometAddress,
            callData: iface.encodeFunctionData('baseToken'),
          },
          {
            target: cometAddress,
            callData: iface.encodeFunctionData('baseTokenPriceFeed'),
          },
          {
            target: cometAddress,
            callData: iface.encodeFunctionData('numAssets'),
          },
          {
            target: cometAddress,
            callData: iface.encodeFunctionData('getUtilization'),
          },
        ];
        const { returnData } = await this.multicall2.callStatic.aggregate(calls, { blockTag: this.blockTag });

        [baseTokenAddress] = iface.decodeFunctionResult('baseToken', returnData[0]);
        [baseTokenPriceFeed] = iface.decodeFunctionResult('baseTokenPriceFeed', returnData[1]);
        [numAssets] = iface.decodeFunctionResult('numAssets', returnData[2]);
        [utilization] = iface.decodeFunctionResult('getUtilization', returnData[3]);
      }

      const assetAddresses: string[] = [];
      const assetPriceFeeds: string[] = [];
      const borrowCollateralFactors: string[] = [];
      const liquidateCollateralFactors: string[] = [];
      {
        const calls: common.Multicall2.CallStruct[] = [];
        for (let i = 0; i < numAssets; i++) {
          calls.push({ target: cometAddress, callData: iface.encodeFunctionData('getAssetInfo', [i]) });
        }
        const { returnData } = await this.multicall2.callStatic.aggregate(calls, { blockTag: this.blockTag });

        for (let i = 0; i < numAssets; i++) {
          const [{ asset, priceFeed, borrowCollateralFactor, liquidateCollateralFactor }] = iface.decodeFunctionResult(
            'getAssetInfo',
            returnData[i]
          );
          assetAddresses.push(asset);
          assetPriceFeeds.push(priceFeed);
          borrowCollateralFactors.push(common.toBigUnit(borrowCollateralFactor, 18));
          liquidateCollateralFactors.push(common.toBigUnit(liquidateCollateralFactor, 18));
        }
      }

      const [baseToken, ...assets] = await this.getTokens([baseTokenAddress, ...assetAddresses]);

      this._marketMap[marketId] = {
        cometAddress,
        baseToken,
        baseTokenPriceFeed,
        numAssets,
        utilization: utilization.toString(),
        assets: assets.map((asset, i) => ({
          asset,
          priceFeed: assetPriceFeeds[i],
          borrowCollateralFactor: borrowCollateralFactors[i],
          liquidateCollateralFactor: liquidateCollateralFactors[i],
        })),
      };
    }

    return this._marketMap[marketId];
  }

  async getAprs(marketId: string) {
    const { cometAddress, utilization } = await this.getMarket(marketId);

    const iface = logics.compoundv3.Comet__factory.createInterface();
    const calls: common.Multicall2.CallStruct[] = [
      {
        target: cometAddress,
        callData: iface.encodeFunctionData('getSupplyRate', [utilization]),
      },
      {
        target: cometAddress,
        callData: iface.encodeFunctionData('getBorrowRate', [utilization]),
      },
    ];
    const { returnData } = await this.multicall2.callStatic.aggregate(calls, { blockTag: this.blockTag });

    const [supplyRate] = iface.decodeFunctionResult('getSupplyRate', returnData[0]);
    const supplyApr = calcApr(supplyRate);

    const [borrowRate] = iface.decodeFunctionResult('getBorrowRate', returnData[1]);
    const borrowApr = calcApr(borrowRate);

    return { supplyApr, borrowApr };
  }

  async getPrices(marketId: string) {
    const { cometAddress, baseTokenPriceFeed, numAssets, assets } = await this.getMarket(marketId);
    const customBaseTokenPriceFeed = getCustomBaseTokenPriceFeed(this.chainId, marketId);

    const iface = logics.compoundv3.Comet__factory.createInterface();
    const calls: common.Multicall2.CallStruct[] = [];
    if (customBaseTokenPriceFeed) {
      calls.push({
        target: cometAddress,
        callData: iface.encodeFunctionData('getPrice', [customBaseTokenPriceFeed]),
      });
    }
    calls.push({
      target: cometAddress,
      callData: iface.encodeFunctionData('getPrice', [baseTokenPriceFeed]),
    });
    for (const { priceFeed } of assets) {
      calls.push({
        target: cometAddress,
        callData: iface.encodeFunctionData('getPrice', [priceFeed]),
      });
    }
    const { returnData } = await this.multicall2.callStatic.aggregate(calls, { blockTag: this.blockTag });

    let j = 0;

    let customBaseTokenPrice: BigNumber | undefined;
    if (customBaseTokenPriceFeed) {
      [customBaseTokenPrice] = iface.decodeFunctionResult('getPrice', returnData[j]);
      j++;
    }

    let price: BigNumber;
    [price] = iface.decodeFunctionResult('getPrice', returnData[j]);
    if (customBaseTokenPrice) {
      price = price.mul(customBaseTokenPrice).div(1e8);
    }
    const baseTokenPrice = common.toBigUnit(price, 8);
    j++;

    const assetPrices: string[] = [];
    for (let i = 0; i < numAssets; i++) {
      let price: BigNumber;
      [price] = iface.decodeFunctionResult('getPrice', returnData[j]);
      if (customBaseTokenPrice) {
        price = price.mul(customBaseTokenPrice).div(1e8);
      }
      assetPrices.push(common.toBigUnit(price, 8));
      j++;
    }

    return { baseTokenPrice, assetPrices };
  }

  async getUserBalances(marketId: string, account?: string) {
    const { cometAddress, baseToken, numAssets, assets } = await this.getMarket(marketId);

    let supplyBalance = '0';
    let borrowBalance = '0';
    const collateralBalances: string[] = Array(numAssets).fill('0');
    if (account) {
      const iface = logics.compoundv3.Comet__factory.createInterface();
      const calls: common.Multicall2.CallStruct[] = [
        {
          target: cometAddress,
          callData: iface.encodeFunctionData('balanceOf', [account]),
        },
        {
          target: cometAddress,
          callData: iface.encodeFunctionData('borrowBalanceOf', [account]),
        },
      ];
      for (const { asset } of assets) {
        calls.push({
          target: cometAddress,
          callData: iface.encodeFunctionData('collateralBalanceOf', [account, asset.address]),
        });
      }
      const { returnData } = await this.multicall2.callStatic.aggregate(calls, { blockTag: this.blockTag });

      const [supplyBalanceWei] = iface.decodeFunctionResult('balanceOf', returnData[0]);
      supplyBalance = common.toBigUnit(supplyBalanceWei, baseToken.decimals);

      const [borrowBalanceWei] = iface.decodeFunctionResult('borrowBalanceOf', returnData[1]);
      borrowBalance = common.toBigUnit(borrowBalanceWei, baseToken.decimals);

      assets.forEach(({ asset }, i) => {
        const [collateralBalanceWei] = iface.decodeFunctionResult('collateralBalanceOf', returnData[i + 2]);
        collateralBalances[i] = common.toBigUnit(collateralBalanceWei, asset.decimals);
      });
    }

    return { supplyBalance, borrowBalance, collateralBalances };
  }

  async getMarketInfo(marketId: string, account?: string) {
    const { baseToken, numAssets, assets } = await this.getMarket(marketId);
    const { baseTokenPrice, assetPrices } = await this.getPrices(marketId);
    const { supplyApr, borrowApr } = await this.getAprs(marketId);
    const { supplyBalance, borrowBalance, collateralBalances } = await this.getUserBalances(marketId, account);

    let supplyValue = '0';
    if (supplyBalance !== '0') {
      supplyValue = formatValue(new BigNumberJS(supplyBalance).times(baseTokenPrice));
    }

    let borrowValue = '0';
    if (borrowBalance !== '0') {
      borrowValue = formatValue(new BigNumberJS(borrowBalance).times(baseTokenPrice));
    }

    let totalCollateralValue = new BigNumberJS(0);
    let totalBorrowCapacityValue = new BigNumberJS(0);
    let liquidationLimitValue = new BigNumberJS(0);
    const collaterals: CollateralInfo[] = [];
    for (let i = 0; i < numAssets; i++) {
      const { asset, borrowCollateralFactor, liquidateCollateralFactor } = assets[i];
      const assetPrice = assetPrices[i];

      const collateralBalance = collateralBalances[i];

      let collateralValue = new BigNumberJS(0);
      let borrowCapacityValue = new BigNumberJS(0);
      let borrowCapacity = '0';
      if (collateralBalance !== '0') {
        collateralValue = new BigNumberJS(collateralBalance).times(assetPrice);
        totalCollateralValue = totalCollateralValue.plus(collateralValue);

        borrowCapacityValue = collateralValue.times(borrowCollateralFactor);
        totalBorrowCapacityValue = totalBorrowCapacityValue.plus(borrowCapacityValue);
        borrowCapacity = borrowCapacityValue
          .div(baseTokenPrice)
          .decimalPlaces(baseToken.decimals, BigNumberJS.ROUND_FLOOR)
          .toFixed();

        liquidationLimitValue = liquidationLimitValue.plus(collateralValue.times(liquidateCollateralFactor));
      }

      const collateralInfo: CollateralInfo = {
        asset: asset.unwrapped,
        assetPrice,
        borrowCollateralFactor,
        liquidateCollateralFactor,
        collateralBalance,
        collateralValue: formatValue(collateralValue),
        borrowCapacity,
        borrowCapacityValue: formatValue(borrowCapacityValue),
      };

      collaterals.push(collateralInfo);
    }

    let borrowCapacity = new BigNumberJS('0');
    let availableToBorrow = new BigNumberJS('0');
    let availableToBorrowValue = '0';
    if (!totalBorrowCapacityValue.isZero()) {
      borrowCapacity = totalBorrowCapacityValue
        .div(baseTokenPrice)
        .decimalPlaces(baseToken.decimals, BigNumberJS.ROUND_FLOOR);
      availableToBorrow = borrowCapacity.minus(borrowBalance);
      availableToBorrowValue = formatValue(availableToBorrow.times(baseTokenPrice));
    }

    let liquidationThreshold = '0';
    let liquidationRisk = new BigNumberJS(0);
    let liquidationPointValue = new BigNumberJS(0);
    let liquidationPoint = '0';
    if (!liquidationLimitValue.isZero()) {
      liquidationThreshold = liquidationLimitValue.div(totalCollateralValue).decimalPlaces(4).toFixed();
      liquidationRisk = new BigNumberJS(borrowValue).div(liquidationLimitValue).decimalPlaces(2);
      liquidationPointValue = totalCollateralValue.times(liquidationRisk);
      liquidationPoint = liquidationPointValue
        .div(baseTokenPrice)
        .decimalPlaces(baseToken.decimals, BigNumberJS.ROUND_FLOOR)
        .toFixed();
    }

    const utilization = calcUtilization(totalBorrowCapacityValue, borrowValue);
    const healthRate = calchealthRate(supplyValue, totalCollateralValue, borrowValue, liquidationThreshold);
    const netApr = calcNetApr(supplyValue, supplyApr, totalCollateralValue, borrowValue, borrowApr);

    const marketInfo: MarketInfo = {
      baseToken: baseToken.unwrapped,
      baseTokenPrice,
      supplyApr,
      supplyBalance,
      supplyValue,
      borrowApr,
      borrowBalance,
      borrowValue,
      collateralValue: formatValue(totalCollateralValue),
      borrowCapacity: borrowCapacity.toFixed(),
      borrowCapacityValue: formatValue(totalBorrowCapacityValue),
      availableToBorrow: availableToBorrow.toFixed(),
      availableToBorrowValue,
      liquidationThreshold,
      liquidationRisk: liquidationRisk.toFixed(),
      liquidationPoint,
      liquidationPointValue: formatValue(liquidationPointValue),
      utilization,
      healthRate,
      netApr,
      collaterals,
    };

    return marketInfo;
  }
}
