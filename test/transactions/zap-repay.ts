import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import * as api from 'test/fixtures/api';
import { claimToken, getBalance, getChainId, polygonTokens, snapshotAndRevertEach } from '@protocolink/test-helpers';
import * as common from '@protocolink/common';
import { expect } from 'chai';
import hre from 'hardhat';
import * as logics from '@protocolink/logics';
import * as utils from 'test/utils';

describe('Transaction: Zap Repay', function () {
  const marketId = logics.compoundv3.MarketId.USDC;
  const baseToken = polygonTokens.USDC;

  let chainId: number;
  let user: SignerWithAddress;
  let service: logics.compoundv3.Service;
  let initBorrowBalance: common.TokenAmount;

  before(async function () {
    chainId = await getChainId();
    user = await hre.ethers.getImpersonatedSigner('0x0FBeABcaFCf817d47E10a7bCFC15ba194dbD4EEF');
    service = new logics.compoundv3.Service(chainId, hre.ethers.provider);
    initBorrowBalance = await service.getBorrowBalance(marketId, user.address, baseToken);
  });

  snapshotAndRevertEach();

  it('user zap repay USDC in USDC market', async function () {
    await claimToken(chainId, user.address, baseToken, '200');

    // 1. user obtains a quotation for zap repay 100 USDC through the zap repay API
    const srcToken = polygonTokens.USDC;
    const srcAmount = '100';
    const slippage = 100;
    const permit2Type = 'approve';
    const quotation = await api.quote(
      chainId,
      marketId,
      'zap-repay',
      {
        account: user.address,
        srcToken,
        srcAmount,
        slippage,
      },
      permit2Type
    );

    // 2. user needs to allow the Protocolink user agent to repay on behalf of the user
    expect(quotation.approvals.length).to.eq(2);
    for (const approval of quotation.approvals) {
      await expect(user.sendTransaction(approval)).to.not.be.reverted;
    }

    // 3. user obtains a zap repay transaction request through the build transaction API.
    expect(quotation.logics.length).to.eq(1);
    const transactionRequest = await api.buildRouterTransactionRequest({
      chainId,
      account: user.address,
      logics: quotation.logics,
    });

    await expect(user.sendTransaction(transactionRequest)).to.not.be.reverted;

    // 4. user's USDC borrow balance should decrease.
    // 4-1. supply grows when the block of getting api data is different from the block of executing tx
    const quoteDestAmount = new common.TokenAmount(baseToken, quotation.quotation.destAmount);
    const [min] = utils.bpsBound(quoteDestAmount.amount);
    const minDestAmount = quoteDestAmount.clone().set(min);

    const borrowBalance = await service.getBorrowBalance(marketId, user.address, baseToken);
    expect(initBorrowBalance.clone().sub(borrowBalance).lte(quoteDestAmount)).to.be.true;
    expect(initBorrowBalance.clone().sub(borrowBalance).gte(minDestAmount)).to.be.true;

    // 5. user's USDC balance should decrease
    await expect(user.address).to.changeBalance(baseToken, -srcAmount);
  });

  it('user zap repay extra USDT in USDC market', async function () {
    await claimToken(chainId, user.address, polygonTokens.USDT, '80000');
    await claimToken(chainId, user.address, polygonTokens.MATIC, '500');

    // 1. user obtains a quotation for zap withdraw 0.1 WETH to USDT through the zap withdraw API
    const srcToken = polygonTokens.USDT;
    const srcAmount = '80000';
    const slippage = 100;
    const permit2Type = 'approve';
    const quotation = await api.quote(
      chainId,
      marketId,
      'zap-repay',
      {
        account: user.address,
        srcToken,
        srcAmount,
        slippage,
      },
      permit2Type
    );

    const quoteDestAmount = new common.TokenAmount(baseToken, quotation.quotation.destAmount);
    const srcTokenAmount = new common.TokenAmount(srcToken, srcAmount);
    expect(quoteDestAmount.lt(srcTokenAmount)).to.be.true;

    // 2. user needs to allow the Protocolink user agent to repay on behalf of the user
    expect(quotation.approvals.length).to.eq(2);
    for (const approval of quotation.approvals) {
      await expect(user.sendTransaction(approval)).to.not.be.reverted;
    }

    // 3. user obtains a zap repay transaction request through the build transaction API.
    expect(quotation.logics.length).to.eq(2);
    const transactionRequest = await api.buildRouterTransactionRequest({
      chainId,
      account: user.address,
      logics: quotation.logics,
    });
    await expect(user.sendTransaction(transactionRequest)).to.not.be.reverted;

    // 4. user's USDC borrow balance should be zero
    const borrowBalance = await service.getBorrowBalance(marketId, user.address, baseToken);
    expect(borrowBalance.isZero).to.be.true;

    // 5. user's USDC supply balance should be zero
    const cToken = await service.getCToken(marketId);
    const baseTokenBalance = await getBalance(user.address, cToken);
    expect(baseTokenBalance.isZero).to.be.true;

    // 6. user's USDT balance should decrease
    await expect(user.address).to.changeBalance(srcToken, -srcAmount);
  });
});
