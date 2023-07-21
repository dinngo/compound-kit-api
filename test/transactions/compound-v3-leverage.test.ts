import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import * as apisdk from '@protocolink/api';
import * as common from '@protocolink/common';
import { expect } from 'chai';
import * as helpers from '@nomicfoundation/hardhat-network-helpers';
import hre from 'hardhat';
import * as logics from '@protocolink/logics';
import { newTestEvent, testContext, testHandler } from 'test/fixtures/api';
import { providers } from 'ethers';
import { snapshotAndRevertEach } from '@protocolink/test-helpers';

const faucetMap: Record<number, { default: string; specified: Record<string, string> }> = {
  1: {
    default: '0x0D0707963952f2fBA59dD06f2b425ace40b492Fe',
    specified: {
      '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48': '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503', // USDC
      '0xBe9895146f7AF43049ca1c1AE358B0541Ea49704': '0xA9D1e08C7793af67e9d92fe308d5697FB81d3E43', // cbETH
      '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0': '0x5fEC2f34D80ED82370F733043B6A536d7e9D7f8d', // wstETH
    },
  },
  137: {
    default: '0xe7804c37c13166ff0b37f5ae0bb07a3aebb6e245',
    specified: {
      '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174': '0xe7804c37c13166ff0b37f5ae0bb07a3aebb6e245', // USDC
      '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270': '0xe7804c37c13166ff0b37f5ae0bb07a3aebb6e245', // WMATIC
    },
  },
};

async function claimToken(
  chainId: number,
  recepient: string,
  tokenOrAddress: common.TokenOrAddress,
  amount: string,
  provider: providers.Provider
) {
  const hre = await import('hardhat');

  const web3Toolkit = new common.Web3Toolkit(chainId, /*hre.ethers.provider*/ provider);
  const token = await web3Toolkit.getToken(tokenOrAddress);
  const tokenAmount = new common.TokenAmount(token, amount);

  let faucet: string;
  if (token.isNative || token.isWrapped) {
    const signers = await hre.ethers.getSigners();
    faucet = signers[signers.length - 1].address;
  } else {
    faucet = faucetMap[chainId]?.specified?.[token.address] ?? faucetMap[chainId].default;
    await helpers.impersonateAccount(faucet);
  }

  const signer = await hre.ethers.provider.getSigner(faucet);
  if (token.isNative) {
    await signer.sendTransaction({ to: recepient, value: tokenAmount.amountWei });
  } else {
    if (token.isWrapped) {
      if (chainId == 1) {
        const weth = common.WETH__factory.connect(token.address, signer);
        await (await weth.deposit({ value: tokenAmount.amountWei })).wait();
      } else if (chainId == 137) {
        const wmatic = common.WETH__factory.connect(token.address, signer);
        await (await wmatic.deposit({ value: tokenAmount.amountWei })).wait();
      }
    }
    const erc20 = common.ERC20__factory.connect(token.address, signer);
    await (await erc20.transfer(recepient, tokenAmount.amountWei)).wait();
  }
}

describe('Transaction: CompoundV3', function () {
  let chainId: number;
  let network: common.Network;
  let provider: providers.Provider;

  let user1: SignerWithAddress;
  let leverageToken: common.Token;
  let leverageTokenFullBalance: string;
  let borrowToken: common.Token;
  let borrowTokenFullBalance: string;
  let marketIdUSDC: string;

  before(async function () {
    chainId = common.ChainId.polygon;
    network = common.getNetwork(chainId);
    provider = hre.ethers.provider;
    [, user1] = await hre.ethers.getSigners();
    leverageToken = logics.compoundv3.polygonTokens.WMATIC;
    leverageTokenFullBalance = '500';
    borrowToken = logics.compoundv3.polygonTokens.USDC;
    borrowTokenFullBalance = '500';
    marketIdUSDC = logics.compoundv3.MarketId.USDC;
    await claimToken(chainId, user1.address, leverageToken, leverageTokenFullBalance, provider);
    await claimToken(chainId, user1.address, borrowToken, borrowTokenFullBalance, provider);
  });

  snapshotAndRevertEach();

  it('user leverage Wrapped Native Token in USDC market', async function () {
    // 1. Get logics
    // 1-0. supply leverage token to USDC market
    let initSupplyAmount = leverageTokenFullBalance;
    let leverageAmount = '200';
    let logics: apisdk.Logic<any>[] = [];

    // User need to have collateral positions in CompoundV3
    const supplyLogic = apisdk.protocols.compoundv3.newSupplyCollateralLogic({
      input: { token: leverageToken, amount: initSupplyAmount },
      marketId: marketIdUSDC,
    });
    logics.push(supplyLogic);

    const path = '/v1/markets/137/usdc/leverage';
    const body = {
      account: user1.address,
      token: leverageToken,
      amount: leverageAmount,
      slippage: 100,
    };

    const event = newTestEvent('POST', path, { body });
    const resp = await testHandler(event, testContext);
    expect(resp.statusCode).to.eq(200); // Success

    const parsedResp = JSON.parse(resp.body);
    const leverageLogics: apisdk.Logic<any>[] = parsedResp.logics;
    for (let i = 0; i < leverageLogics.length; i++) {
      logics.push(leverageLogics[i]);
    }

    // 2. new router data
    const routerData: apisdk.RouterData = {
      chainId,
      account: user1.address,
      logics: logics,
    };

    // 3. estimate router data and check result
    const estimateResult = await apisdk.estimateRouterData(routerData);
    expect(estimateResult.approvals.length).to.eq(2);
    expect(estimateResult.permitData).to.not.be.undefined;

    // 3-1. user send approval transactions
    for (const approval of estimateResult.approvals) {
      await expect(user1.sendTransaction(approval)).to.not.be.reverted;
    }

    // // 3-2. user sign permit data
    const { domain, types, values } = estimateResult.permitData!;
    const permitSig = await user1._signTypedData(domain, types, values);
    routerData.permitData = estimateResult.permitData;
    routerData.permitSig = permitSig;

    // 4. build and send router transaction request
    const transactionRequest = await apisdk.buildRouterTransactionRequest(routerData);
    await expect(user1.sendTransaction(transactionRequest)).to.not.be.reverted;
  });
});
