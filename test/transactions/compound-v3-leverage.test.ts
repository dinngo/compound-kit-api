import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import * as apisdk from '@protocolink/api';
import { claimToken, snapshotAndRevertEach } from '@protocolink/test-helpers';
import * as common from '@protocolink/common';
import { expect } from 'chai';
import hre from 'hardhat';
import * as logics from '@protocolink/logics';
import { newTestEvent, testContext, testHandler } from 'test/fixtures/api';

describe('Transaction: CompoundV3', function () {
  let chainId: number;
  let user1: SignerWithAddress;
  let leverageToken: common.Token;
  let leverageTokenFullBalance: string;
  let borrowToken: common.Token;
  let borrowTokenFullBalance: string;
  let marketIdUSDC: string;

  async function initSupply(
    user: SignerWithAddress,
    token: common.TokenTypes,
    amount: string,
    chainId: number,
    marketId: string
  ) {
    // supply token to USDC market
    const supplyLogic = apisdk.protocols.compoundv3.newSupplyCollateralLogic({
      input: { token: token, amount: amount },
      marketId: marketId,
    });

    // new router data
    const routerData: apisdk.RouterData = {
      chainId,
      account: user.address,
      logics: [supplyLogic],
    };

    // estimate router data and check result
    const estimateResult = await apisdk.estimateRouterData(routerData);
    expect(estimateResult.approvals.length).to.eq(1);
    expect(estimateResult.permitData).to.not.be.undefined;

    for (const approval of estimateResult.approvals) {
      await expect(user.sendTransaction(approval)).to.not.be.reverted;
    }

    // user sign permit data
    const { domain, types, values } = estimateResult.permitData!;
    const permitSig = await user._signTypedData(domain, types, values);
    routerData.permitData = estimateResult.permitData;
    routerData.permitSig = permitSig;

    // build and send router transaction request
    const transactionRequest = await apisdk.buildRouterTransactionRequest(routerData);
    await expect(user.sendTransaction(transactionRequest)).to.not.be.reverted;
  }

  before(async function () {
    chainId = Number(hre.network.config.chainId);
    [, user1] = await hre.ethers.getSigners();
    leverageToken = logics.compoundv3.polygonTokens.WMATIC;
    leverageTokenFullBalance = '500';
    borrowToken = logics.compoundv3.polygonTokens.USDC;
    marketIdUSDC = logics.compoundv3.MarketId.USDC;
    await claimToken(chainId, user1.address, leverageToken, leverageTokenFullBalance);
    // Assume user has collateral positions in CompoundV3 in advance
    await initSupply(user1, leverageToken, leverageTokenFullBalance, chainId, marketIdUSDC);
  });

  snapshotAndRevertEach();

  it('user leverage Wrapped Native Token in USDC market', async function () {
    // 1. supply leverage token to USDC market
    const leverageAmount = '200';
    const leveragePath = '/v1/markets/137/usdc/leverage';
    const leverageBody = {
      account: user1.address,
      token: leverageToken,
      amount: leverageAmount,
      slippage: 100,
    };
    const leverageEvent = newTestEvent('POST', leveragePath, { body: leverageBody });
    const leverageResp = await testHandler(leverageEvent, testContext);
    expect(leverageResp.statusCode).to.eq(200); // Success
    const parsedLeverageResp = JSON.parse(leverageResp.body);

    // 1-1. user send approval transactions
    for (const approval of parsedLeverageResp.approvals) {
      await expect(user1.sendTransaction(approval)).to.not.be.reverted;
    }

    // 2. build tx request
    var transactionPath = '/v1/transactions';
    var transactionBody = {
      chainId: chainId,
      account: user1.address,
      logics: parsedLeverageResp.logics,
    };

    // 3. build and send router transaction request
    const transactionEvent = newTestEvent('POST', transactionPath, { body: transactionBody });
    const transactionResp = await testHandler(transactionEvent, testContext);
    expect(transactionResp.statusCode).to.eq(200); // Success
    const transactionRequest = JSON.parse(transactionResp.body);
    await expect(user1.sendTransaction(transactionRequest)).to.not.be.reverted;

    // 4. check user collateral balances
    const service = new logics.compoundv3.Service(chainId, hre.ethers.provider);
    const collateralBalance = await service.getCollateralBalance(marketIdUSDC, user1.address, leverageToken);
    expect(collateralBalance.amount).to.eq('700'); // leverageTokenFullBalance + leverageAmount
  });
});
