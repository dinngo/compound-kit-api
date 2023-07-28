import { Service } from './service';
import * as common from '@protocolink/common';
import { expect } from 'chai';
import * as logics from '@protocolink/logics';

describe('Service', function () {
  context('Test getMarket, gerAPRs, getPrices, getUserBalances', function () {
    const testCases = [
      {
        chainId: common.ChainId.mainnet,
        marketId: logics.compoundv3.MarketId.USDC,
        account: '0x8d1Fb1241880d2A30d9d2762C8dB643a5145B21B',
        blockTag: 17699700,
        expected: {
          market: {
            cometAddress: '0xc3d688B66703497DAA19211EEdff47f25384cdc3',
            baseToken: {
              chainId: 1,
              address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
              decimals: 6,
              symbol: 'USDC',
              name: 'USD Coin',
            },
            baseTokenPriceFeed: '0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6',
            numAssets: 5,
            utilization: '976557181997462749',
            assets: [
              {
                asset: {
                  chainId: 1,
                  address: '0xc00e94Cb662C3520282E6f5717214004A7f26888',
                  decimals: 18,
                  symbol: 'COMP',
                  name: 'Compound',
                },
                priceFeed: '0xdbd020CAeF83eFd542f4De03e3cF0C28A4428bd5',
                borrowCollateralFactor: '0.65',
                liquidateCollateralFactor: '0.7',
              },
              {
                asset: {
                  chainId: 1,
                  address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
                  decimals: 8,
                  symbol: 'WBTC',
                  name: 'Wrapped BTC',
                },
                priceFeed: '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c',
                borrowCollateralFactor: '0.7',
                liquidateCollateralFactor: '0.77',
              },
              {
                asset: {
                  chainId: 1,
                  address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
                  decimals: 18,
                  symbol: 'WETH',
                  name: 'Wrapped Ether',
                },
                priceFeed: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
                borrowCollateralFactor: '0.825',
                liquidateCollateralFactor: '0.895',
              },
              {
                asset: {
                  chainId: 1,
                  address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
                  decimals: 18,
                  symbol: 'UNI',
                  name: 'Uniswap',
                },
                priceFeed: '0x553303d460EE0afB37EdFf9bE42922D8FF63220e',
                borrowCollateralFactor: '0.75',
                liquidateCollateralFactor: '0.81',
              },
              {
                asset: {
                  chainId: 1,
                  address: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
                  decimals: 18,
                  symbol: 'LINK',
                  name: 'ChainLink Token',
                },
                priceFeed: '0x2c1d072e956AFFC0D435Cb7AC38EF18d24d9127c',
                borrowCollateralFactor: '0.79',
                liquidateCollateralFactor: '0.85',
              },
            ],
          },
          aprs: { supplyAPR: '0.0524', borrowAPR: '0.0399' },
          prices: {
            baseTokenPrice: '1',
            assetPrices: ['75.002', '30298.95', '1933.940035', '5.8920278', '6.96700785'],
          },
          userBalances: {
            supplyBalance: '802.844449',
            borrowBalance: '0',
            collateralBalances: ['0', '0', '0', '0', '0'],
          },
        },
      },
      {
        chainId: common.ChainId.mainnet,
        marketId: logics.compoundv3.MarketId.ETH,
        account: '0xAa43599FbCd3C655f6Fe6e69dba8477062f4eFAD',
        blockTag: 17699700,
        expected: {
          market: {
            cometAddress: '0xA17581A9E3356d9A858b789D68B4d866e593aE94',
            baseToken: {
              chainId: 1,
              address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
              decimals: 18,
              symbol: 'WETH',
              name: 'Wrapped Ether',
            },
            baseTokenPriceFeed: '0xD72ac1bCE9177CFe7aEb5d0516a38c88a64cE0AB',
            numAssets: 2,
            utilization: '444485252335261480',
            assets: [
              {
                asset: {
                  chainId: 1,
                  address: '0xBe9895146f7AF43049ca1c1AE358B0541Ea49704',
                  decimals: 18,
                  symbol: 'cbETH',
                  name: 'Coinbase Wrapped Staked ETH',
                },
                priceFeed: '0x23a982b74a3236A5F2297856d4391B2edBBB5549',
                borrowCollateralFactor: '0.9',
                liquidateCollateralFactor: '0.93',
              },
              {
                asset: {
                  chainId: 1,
                  address: '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0',
                  decimals: 18,
                  symbol: 'wstETH',
                  name: 'Wrapped liquid staked Ether 2.0',
                },
                priceFeed: '0x4F67e4d9BD67eFa28236013288737D39AeF48e79',
                borrowCollateralFactor: '0.9',
                liquidateCollateralFactor: '0.93',
              },
            ],
          },
          aprs: { supplyAPR: '0.0126', borrowAPR: '0.0329' },
          prices: { baseTokenPrice: '1933.940035', assetPrices: ['2016.13917792', '2188.89305168'] },
          userBalances: { supplyBalance: '4.636625160941150824', borrowBalance: '0', collateralBalances: ['0', '0'] },
        },
      },
      {
        chainId: common.ChainId.polygon,
        marketId: logics.compoundv3.MarketId.USDC,
        account: '0x9fC7D6E7a3d4aB7b8b28d813f68674C8A6e91e83',
        blockTag: 45221016,
        expected: {
          market: {
            cometAddress: '0xF25212E676D1F7F89Cd72fFEe66158f541246445',
            baseToken: {
              chainId: 137,
              address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
              decimals: 6,
              symbol: 'USDC',
              name: 'USD Coin (PoS)',
            },
            baseTokenPriceFeed: '0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7',
            numAssets: 3,
            utilization: '796389769840623049',
            assets: [
              {
                asset: {
                  chainId: 137,
                  address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
                  decimals: 18,
                  symbol: 'WETH',
                  name: 'Wrapped Ether',
                },
                priceFeed: '0xF9680D99D6C9589e2a93a78A04A279e509205945',
                borrowCollateralFactor: '0.775',
                liquidateCollateralFactor: '0.825',
              },
              {
                asset: {
                  chainId: 137,
                  address: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
                  decimals: 8,
                  symbol: 'WBTC',
                  name: '(PoS) Wrapped BTC',
                },
                priceFeed: '0xDE31F8bFBD8c84b5360CFACCa3539B938dd78ae6',
                borrowCollateralFactor: '0.7',
                liquidateCollateralFactor: '0.75',
              },
              {
                asset: {
                  chainId: 137,
                  address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
                  decimals: 18,
                  symbol: 'WMATIC',
                  name: 'Wrapped Matic',
                },
                priceFeed: '0xAB594600376Ec9fD91F8e885dADF0CE036862dE0',
                borrowCollateralFactor: '0.65',
                liquidateCollateralFactor: '0.7',
              },
            ],
          },
          aprs: { supplyAPR: '0.0258', borrowAPR: '0.0428' },
          prices: { baseTokenPrice: '0.99995719', assetPrices: ['1901.797', '30035.14459631', '0.75599807'] },
          userBalances: {
            supplyBalance: '0',
            borrowBalance: '171.00092',
            collateralBalances: ['0.184444655243193813', '0', '0'],
          },
        },
      },
    ];

    testCases.forEach(({ chainId, marketId, account, blockTag, expected }) => {
      it(`${common.toNetworkId(chainId)} ${marketId} market`, async function () {
        const service = new Service(chainId, blockTag);
        const market = await service.getMarket(marketId);
        const aprs = await service.getAPRs(marketId);
        const prices = await service.getPrices(marketId);
        const userBalances = await service.getUserBalances(marketId, account);
        expect(JSON.stringify({ market, aprs, prices, userBalances })).to.eq(JSON.stringify(expected));
      });
    });
  });

  context('Test getMarketInfo', function () {
    const testCases = [
      {
        title: 'polygon USDC market info: no account',
        chainId: common.ChainId.polygon,
        marketId: logics.compoundv3.MarketId.USDC,
        blockTag: 44943000,
        expected: {
          baseToken: {
            chainId: 137,
            address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
            decimals: 6,
            symbol: 'USDC',
            name: 'USD Coin (PoS)',
          },
          baseTokenPrice: '0.99994868',
          supplyAPR: '0.0179',
          supplyBalance: '0',
          supplyUSD: '0',
          borrowAPR: '0.0343',
          borrowBalance: '0',
          borrowUSD: '0',
          collateralUSD: '0',
          borrowCapacity: '0',
          borrowCapacityUSD: '0',
          availableToBorrow: '0',
          availableToBorrowUSD: '0',
          liquidationLimit: '0',
          liquidationThreshold: '0',
          liquidationRisk: '0',
          liquidationPoint: '0',
          liquidationPointUSD: '0',
          utilization: '0',
          healthRate: 'NaN',
          netAPR: '0',
          collaterals: [
            {
              asset: {
                chainId: 137,
                address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
                decimals: 18,
                symbol: 'WETH',
                name: 'Wrapped Ether',
              },
              assetPrice: '1882.5619',
              borrowCollateralFactor: '0.775',
              liquidateCollateralFactor: '0.825',
              collateralBalance: '0',
              collateralUSD: '0',
              borrowCapacity: '0',
              borrowCapacityUSD: '0',
            },
            {
              asset: {
                chainId: 137,
                address: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
                decimals: 8,
                symbol: 'WBTC',
                name: '(PoS) Wrapped BTC',
              },
              assetPrice: '30557.48291475',
              borrowCollateralFactor: '0.7',
              liquidateCollateralFactor: '0.75',
              collateralBalance: '0',
              collateralUSD: '0',
              borrowCapacity: '0',
              borrowCapacityUSD: '0',
            },
            {
              asset: {
                chainId: 137,
                address: '0x0000000000000000000000000000000000001010',
                decimals: 18,
                symbol: 'MATIC',
                name: 'Matic Token',
              },
              assetPrice: '0.74026263',
              borrowCollateralFactor: '0.65',
              liquidateCollateralFactor: '0.7',
              collateralBalance: '0',
              collateralUSD: '0',
              borrowCapacity: '0',
              borrowCapacityUSD: '0',
            },
          ],
        },
      },
      {
        title: 'polygon USDC market info: acccount with collaterals',
        chainId: common.ChainId.polygon,
        marketId: logics.compoundv3.MarketId.USDC,
        account: '0x9fC7D6E7a3d4aB7b8b28d813f68674C8A6e91e83',
        blockTag: 45221016,
        expected: {
          baseToken: {
            chainId: 137,
            address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
            decimals: 6,
            symbol: 'USDC',
            name: 'USD Coin (PoS)',
          },
          baseTokenPrice: '0.99995719',
          supplyAPR: '0.0258',
          supplyBalance: '0',
          supplyUSD: '0',
          borrowAPR: '0.0428',
          borrowBalance: '171.00092',
          borrowUSD: '170.99',
          collateralUSD: '350.78',
          borrowCapacity: '271.863264',
          borrowCapacityUSD: '271.85',
          availableToBorrow: '100.862344',
          availableToBorrowUSD: '100.86',
          liquidationLimit: '289.39',
          liquidationThreshold: '0.825',
          liquidationRisk: '0.59',
          liquidationPoint: '206.966872',
          liquidationPointUSD: '206.96',
          utilization: '0.629',
          healthRate: '1.69',
          netAPR: '-0.0407',
          collaterals: [
            {
              asset: {
                chainId: 137,
                address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
                decimals: 18,
                symbol: 'WETH',
                name: 'Wrapped Ether',
              },
              assetPrice: '1901.797',
              borrowCollateralFactor: '0.775',
              liquidateCollateralFactor: '0.825',
              collateralBalance: '0.184444655243193813',
              collateralUSD: '350.78',
              borrowCapacity: '271.863264',
              borrowCapacityUSD: '271.85',
            },
            {
              asset: {
                chainId: 137,
                address: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
                decimals: 8,
                symbol: 'WBTC',
                name: '(PoS) Wrapped BTC',
              },
              assetPrice: '30035.14459631',
              borrowCollateralFactor: '0.7',
              liquidateCollateralFactor: '0.75',
              collateralBalance: '0',
              collateralUSD: '0',
              borrowCapacity: '0',
              borrowCapacityUSD: '0',
            },
            {
              asset: {
                chainId: 137,
                address: '0x0000000000000000000000000000000000001010',
                decimals: 18,
                symbol: 'MATIC',
                name: 'Matic Token',
              },
              assetPrice: '0.75599807',
              borrowCollateralFactor: '0.65',
              liquidateCollateralFactor: '0.7',
              collateralBalance: '0',
              collateralUSD: '0',
              borrowCapacity: '0',
              borrowCapacityUSD: '0',
            },
          ],
        },
      },
      {
        title: 'polygon USDC market info: acccount without collaterals',
        chainId: common.ChainId.polygon,
        marketId: logics.compoundv3.MarketId.USDC,
        account: '0x90AD48FDFf873684F86C3dc8194BCD541097D0BD',
        blockTag: 44943000,
        expected: {
          baseToken: {
            chainId: 137,
            address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
            decimals: 6,
            symbol: 'USDC',
            name: 'USD Coin (PoS)',
          },
          baseTokenPrice: '0.99994868',
          supplyAPR: '0.0179',
          supplyBalance: '0',
          supplyUSD: '0',
          borrowAPR: '0.0343',
          borrowBalance: '0',
          borrowUSD: '0',
          collateralUSD: '0',
          borrowCapacity: '0',
          borrowCapacityUSD: '0',
          availableToBorrow: '0',
          availableToBorrowUSD: '0',
          liquidationLimit: '0',
          liquidationThreshold: '0',
          liquidationRisk: '0',
          liquidationPoint: '0',
          liquidationPointUSD: '0',
          utilization: '0',
          healthRate: 'NaN',
          netAPR: '0',
          collaterals: [
            {
              asset: {
                chainId: 137,
                address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
                decimals: 18,
                symbol: 'WETH',
                name: 'Wrapped Ether',
              },
              assetPrice: '1882.5619',
              borrowCollateralFactor: '0.775',
              liquidateCollateralFactor: '0.825',
              collateralBalance: '0',
              collateralUSD: '0',
              borrowCapacity: '0',
              borrowCapacityUSD: '0',
            },
            {
              asset: {
                chainId: 137,
                address: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
                decimals: 8,
                symbol: 'WBTC',
                name: '(PoS) Wrapped BTC',
              },
              assetPrice: '30557.48291475',
              borrowCollateralFactor: '0.7',
              liquidateCollateralFactor: '0.75',
              collateralBalance: '0',
              collateralUSD: '0',
              borrowCapacity: '0',
              borrowCapacityUSD: '0',
            },
            {
              asset: {
                chainId: 137,
                address: '0x0000000000000000000000000000000000001010',
                decimals: 18,
                symbol: 'MATIC',
                name: 'Matic Token',
              },
              assetPrice: '0.74026263',
              borrowCollateralFactor: '0.65',
              liquidateCollateralFactor: '0.7',
              collateralBalance: '0',
              collateralUSD: '0',
              borrowCapacity: '0',
              borrowCapacityUSD: '0',
            },
          ],
        },
      },
    ];

    testCases.forEach(({ title, chainId, marketId, account, blockTag, expected }) => {
      it(title, async function () {
        const service = new Service(chainId, blockTag);
        const marketInfo = await service.getMarketInfo(marketId, account);
        expect(JSON.stringify(marketInfo)).to.eq(JSON.stringify(expected));
      });
    });
  });
});
