import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import * as api from 'test/fixtures/api';
import * as common from '@protocolink/common';
import { expect } from 'chai';
import { getChainId, polygonTokens, snapshotAndRevertEach } from '@protocolink/test-helpers';
import hre from 'hardhat';
import * as logics from '@protocolink/logics';

describe('Transaction: Zap Withdraw', function () {
  const marketId = logics.compoundv3.MarketId.USDC;

  let chainId: number;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let service: logics.compoundv3.Service;
  let cToken: common.Token;

  before(async function () {
    chainId = await getChainId();
    user1 = await hre.ethers.getImpersonatedSigner('0x0FBeABcaFCf817d47E10a7bCFC15ba194dbD4EEF');
    user2 = await hre.ethers.getImpersonatedSigner('0xD3a697cc0E85C7F52821c31ac86c8faFc195A70E');
    service = new logics.compoundv3.Service(chainId, hre.ethers.provider);
    cToken = await service.getCToken(marketId);
  });

  snapshotAndRevertEach();

  it('user zap withdraw USDC to USDC in USDC market', async function () {
    // 1. user obtains a quotation for zap withdraw 100 USDC through the zap withdraw API
    const srcToken = polygonTokens.USDC;
    const destToken = srcToken;
    const srcAmount = '100';
    const slippage = 100;
    const permit2Type = 'approve';
    const quotation = await api.quote(
      chainId,
      marketId,
      'zap-withdraw',
      {
        account: user2.address,
        srcToken,
        srcAmount,
        destToken,
        slippage,
      },
      permit2Type
    );

    // 2. user needs to allow the Protocolink user agent to withdraw on behalf of the user
    expect(quotation.approvals.length).to.eq(2);
    for (const approval of quotation.approvals) {
      await expect(user2.sendTransaction(approval)).to.not.be.reverted;
    }

    // 3. user obtains a zap withdraw transaction request through the build transaction API.
    expect(quotation.logics.length).to.eq(1);
    const transactionRequest = await api.buildRouterTransactionRequest({
      chainId,
      account: user2.address,
      logics: quotation.logics,
    });

    await expect(user2.sendTransaction(transactionRequest)).to.not.be.reverted;

    // 4. user's USDC supply balance should decrease.
    // 4-1. supply grows when the block of getting api data is different from the block of executing tx
    await expect(user2.address).to.changeBalance(cToken, -srcAmount, 100);

    // 5. user's USDC balance should increase
    await expect(user2.address).to.changeBalance(destToken, quotation.quotation.destAmount);
  });

  it('user zap withdraw USDC to USDT in USDC market', async function () {
    // 1. user obtains a quotation for zap withdraw 100 USDC to USDT through the zap withdraw API
    const srcToken = polygonTokens.USDC;
    const destToken = polygonTokens.USDT;
    const srcAmount = '100';
    const slippage = 100;
    const permit2Type = 'approve';
    const quotation = await api.quote(
      chainId,
      marketId,
      'zap-withdraw',
      {
        account: user2.address,
        srcToken,
        srcAmount,
        destToken,
        slippage,
      },
      permit2Type
    );

    // 2. user needs to allow the Protocolink user agent to withdraw on behalf of the user
    expect(quotation.approvals.length).to.eq(2);
    for (const approval of quotation.approvals) {
      await expect(user2.sendTransaction(approval)).to.not.be.reverted;
    }

    // 3. user obtains a zap withdraw transaction request through the build transaction API.
    expect(quotation.logics.length).to.eq(2);
    const transactionRequest = await api.buildRouterTransactionRequest({
      chainId,
      account: user2.address,
      logics: quotation.logics,
    });

    await expect(user2.sendTransaction(transactionRequest)).to.not.be.reverted;

    // 4. user's USDC supply balance should decrease.
    // 4-1. supply grows when the block of getting api data is different from the block of executing tx
    await expect(user2.address).to.changeBalance(cToken, -srcAmount, 100);

    // 5. user's USDT balance should increase
    await expect(user2.address).to.changeBalance(destToken, quotation.quotation.destAmount, slippage);
  });

  it('user zap withdraw WETH to USDT in USDC market', async function () {
    // 1. user obtains a quotation for zap withdraw 0.1 WETH to USDT through the zap withdraw API
    const srcToken = polygonTokens.WETH;
    const destToken = polygonTokens.USDT;
    const initCollateralBalance = await service.getCollateralBalance(marketId, user1.address, srcToken);
    const srcAmount = '0.1';
    const slippage = 100;
    const quotation = await api.quote(chainId, marketId, 'zap-withdraw', {
      account: user1.address,
      srcToken,
      srcAmount,
      destToken,
      slippage,
    });

    // 2. user needs to allow the Protocolink user agent to withdraw on behalf of the user
    expect(quotation.approvals.length).to.eq(1);
    for (const approval of quotation.approvals) {
      await expect(user1.sendTransaction(approval)).to.not.be.reverted;
    }

    // 3. user obtains a zap withdraw transaction request through the build transaction API.
    expect(quotation.logics.length).to.eq(2);
    const transactionRequest = await api.buildRouterTransactionRequest({
      chainId,
      account: user1.address,
      logics: quotation.logics,
    });
    await expect(user1.sendTransaction(transactionRequest)).to.not.be.reverted;

    // 4. user's WETH supply balance should decrease.
    const withdrawalAmount = new common.TokenAmount(srcToken, srcAmount);
    const collateralBalance = await service.getCollateralBalance(marketId, user1.address, srcToken);
    expect(initCollateralBalance.clone().sub(collateralBalance).eq(withdrawalAmount)).to.be.true;

    // 5. user's USDT balance should increase
    await expect(user1.address).to.changeBalance(destToken, quotation.quotation.destAmount, slippage);
  });
});
