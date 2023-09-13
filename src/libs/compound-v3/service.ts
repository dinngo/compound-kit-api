import { BigNumber, providers } from 'ethers';
import BigNumberJS from 'bignumber.js';
import { calcAPR, calcHealthRate, calcNetAPR, calcUtilization } from './utils';
import * as common from '@protocolink/common';
import * as compoundKit from '@protocolink/compound-kit';
import { getCustomBaseTokenPriceFeed } from './configs';
import * as logics from '@protocolink/logics';

interface Market {
  cometAddress: string;
  baseToken: common.Token;
  baseTokenPriceFeed: string;
  baseBorrowMin: string;
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
      let baseBorrowMinWei: BigNumber;
      {
        const calls: common.Multicall3.CallStruct[] = [
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
            callData: iface.encodeFunctionData('baseBorrowMin'),
          },
          {
            target: cometAddress,
            callData: iface.encodeFunctionData('getUtilization'),
          },
        ];
        const { returnData } = await this.multicall3.callStatic.aggregate(calls, { blockTag: this.blockTag });

        [baseTokenAddress] = iface.decodeFunctionResult('baseToken', returnData[0]);
        [baseTokenPriceFeed] = iface.decodeFunctionResult('baseTokenPriceFeed', returnData[1]);
        [numAssets] = iface.decodeFunctionResult('numAssets', returnData[2]);
        [baseBorrowMinWei] = iface.decodeFunctionResult('baseBorrowMin', returnData[3]);
        [utilization] = iface.decodeFunctionResult('getUtilization', returnData[4]);
      }

      const assetAddresses: string[] = [];
      const assetPriceFeeds: string[] = [];
      const borrowCollateralFactors: string[] = [];
      const liquidateCollateralFactors: string[] = [];
      {
        const calls: common.Multicall3.CallStruct[] = [];
        for (let i = 0; i < numAssets; i++) {
          calls.push({ target: cometAddress, callData: iface.encodeFunctionData('getAssetInfo', [i]) });
        }
        const { returnData } = await this.multicall3.callStatic.aggregate(calls, { blockTag: this.blockTag });

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
        baseBorrowMin: common.toBigUnit(baseBorrowMinWei, baseToken.decimals),
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

  async getAPRs(marketId: string) {
    const { cometAddress, utilization } = await this.getMarket(marketId);

    const iface = logics.compoundv3.Comet__factory.createInterface();
    const calls: common.Multicall3.CallStruct[] = [
      {
        target: cometAddress,
        callData: iface.encodeFunctionData('getSupplyRate', [utilization]),
      },
      {
        target: cometAddress,
        callData: iface.encodeFunctionData('getBorrowRate', [utilization]),
      },
    ];
    const { returnData } = await this.multicall3.callStatic.aggregate(calls, { blockTag: this.blockTag });

    const [supplyRate] = iface.decodeFunctionResult('getSupplyRate', returnData[0]);
    const supplyAPR = calcAPR(supplyRate);

    const [borrowRate] = iface.decodeFunctionResult('getBorrowRate', returnData[1]);
    const borrowAPR = calcAPR(borrowRate);

    return { supplyAPR, borrowAPR };
  }

  async getPrices(marketId: string) {
    const { cometAddress, baseTokenPriceFeed, numAssets, assets } = await this.getMarket(marketId);
    const customBaseTokenPriceFeed = getCustomBaseTokenPriceFeed(this.chainId, marketId);

    const iface = logics.compoundv3.Comet__factory.createInterface();
    const calls: common.Multicall3.CallStruct[] = [];
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
    const { returnData } = await this.multicall3.callStatic.aggregate(calls, { blockTag: this.blockTag });

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
      const calls: common.Multicall3.CallStruct[] = [
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
      const { returnData } = await this.multicall3.callStatic.aggregate(calls, { blockTag: this.blockTag });

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
    const { baseToken, numAssets, assets, baseBorrowMin } = await this.getMarket(marketId);
    const { baseTokenPrice, assetPrices } = await this.getPrices(marketId);
    const { supplyAPR, borrowAPR } = await this.getAPRs(marketId);
    const { supplyBalance, borrowBalance, collateralBalances } = await this.getUserBalances(marketId, account);

    let supplyUSD = new BigNumberJS(0);
    let positiveProportion = new BigNumberJS(0);
    if (supplyBalance !== '0') {
      supplyUSD = new BigNumberJS(supplyBalance).times(baseTokenPrice);
      positiveProportion = supplyUSD.times(supplyAPR);
    }

    let borrowUSD = new BigNumberJS(0);
    let negativeProportion = new BigNumberJS(0);
    if (borrowBalance !== '0') {
      borrowUSD = new BigNumberJS(borrowBalance).times(baseTokenPrice);
      negativeProportion = borrowUSD.times(borrowAPR);
    }

    let totalCollateralUSD = new BigNumberJS(0);
    let totalBorrowCapacityUSD = new BigNumberJS(0);
    let liquidationLimit = new BigNumberJS(0);
    const collaterals: compoundKit.CollateralInfo[] = [];
    for (let i = 0; i < numAssets; i++) {
      const { asset, borrowCollateralFactor, liquidateCollateralFactor } = assets[i];
      const assetPrice = assetPrices[i];

      const collateralBalance = collateralBalances[i];

      let collateralUSD = new BigNumberJS(0);
      let borrowCapacityUSD = new BigNumberJS(0);
      let borrowCapacity = '0';
      if (collateralBalance !== '0') {
        collateralUSD = new BigNumberJS(collateralBalance).times(assetPrice);
        totalCollateralUSD = totalCollateralUSD.plus(collateralUSD);

        borrowCapacityUSD = collateralUSD.times(borrowCollateralFactor);
        totalBorrowCapacityUSD = totalBorrowCapacityUSD.plus(borrowCapacityUSD);
        borrowCapacity = common.formatBigUnit(borrowCapacityUSD.div(baseTokenPrice), baseToken.decimals, 'floor');
        liquidationLimit = liquidationLimit.plus(collateralUSD.times(liquidateCollateralFactor));
      }

      const collateralInfo: compoundKit.CollateralInfo = {
        asset: asset.unwrapped,
        assetPrice,
        borrowCollateralFactor,
        liquidateCollateralFactor,
        collateralBalance,
        collateralUSD: common.formatBigUnit(collateralUSD, 2),
        borrowCapacity,
        borrowCapacityUSD: common.formatBigUnit(borrowCapacityUSD, 2),
      };

      collaterals.push(collateralInfo);
    }

    let borrowCapacity = new BigNumberJS('0');
    let availableToBorrow = new BigNumberJS('0');
    let availableToBorrowUSD = '0';
    if (!totalBorrowCapacityUSD.isZero()) {
      borrowCapacity = totalBorrowCapacityUSD
        .div(baseTokenPrice)
        .decimalPlaces(baseToken.decimals, BigNumberJS.ROUND_FLOOR);
      availableToBorrow = borrowCapacity.minus(borrowBalance);
      availableToBorrowUSD = common.formatBigUnit(availableToBorrow.times(baseTokenPrice), 2);
    }

    let liquidationThreshold = '0';
    let liquidationRisk = new BigNumberJS(0);
    let liquidationPointUSD = new BigNumberJS(0);
    let liquidationPoint = '0';
    if (!liquidationLimit.isZero()) {
      liquidationThreshold = common.formatBigUnit(liquidationLimit.div(totalCollateralUSD), 4);
      liquidationRisk = new BigNumberJS(borrowUSD).div(liquidationLimit).decimalPlaces(2);
      liquidationPointUSD = totalCollateralUSD.times(liquidationRisk);
      liquidationPoint = common.formatBigUnit(liquidationPointUSD.div(baseTokenPrice), baseToken.decimals, 'floor');
    }

    const utilization = calcUtilization(totalBorrowCapacityUSD, borrowUSD);
    const healthRate = calcHealthRate(totalCollateralUSD, borrowUSD, liquidationThreshold);
    const netAPR = calcNetAPR(supplyUSD, positiveProportion, borrowUSD, negativeProportion, totalCollateralUSD);

    const marketInfo: compoundKit.MarketInfo = {
      baseToken: baseToken.unwrapped,
      baseTokenPrice,
      baseBorrowMin,
      supplyAPR,
      supplyBalance,
      supplyUSD: common.formatBigUnit(supplyUSD, 2),
      borrowAPR,
      borrowBalance,
      borrowUSD: common.formatBigUnit(borrowUSD, 2),
      collateralUSD: common.formatBigUnit(totalCollateralUSD, 2),
      borrowCapacity: borrowCapacity.toFixed(),
      borrowCapacityUSD: common.formatBigUnit(totalBorrowCapacityUSD, 2),
      availableToBorrow: availableToBorrow.toFixed(),
      availableToBorrowUSD,
      liquidationLimit: common.formatBigUnit(liquidationLimit, 2),
      liquidationThreshold,
      liquidationRisk: liquidationRisk.toFixed(),
      liquidationPoint,
      liquidationPointUSD: common.formatBigUnit(liquidationPointUSD, 2),
      utilization,
      healthRate,
      netAPR,
      collaterals,
    };

    return marketInfo;
  }
}
