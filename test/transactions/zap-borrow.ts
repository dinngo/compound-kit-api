import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import * as api from 'test/fixtures/api';
import * as common from '@protocolink/common';
import { expect } from 'chai';
import { getChainId, polygonTokens, snapshotAndRevertEach } from '@protocolink/test-helpers';
import hre from 'hardhat';
import * as logics from '@protocolink/logics';
import * as utils from 'test/utils';

describe('Transaction: Zap Borrow', function () {
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

  it('user zap borrow USDC in USDC market', async function () {
    // 1. user obtains a quotation for zap borrow 100 USDC through the zap borrow API
    const destToken = baseToken;
    const srcAmount = '100';
    const slippage = 100;
    const quotation = await api.quote(chainId, marketId, 'zap-borrow', {
      account: user.address,
      srcAmount,
      destToken,
      slippage,
    });

    // 2. user needs to allow the Protocolink user agent to borrow on behalf of the user
    expect(quotation.approvals.length).to.eq(1);
    for (const approval of quotation.approvals) {
      await expect(user.sendTransaction(approval)).to.not.be.reverted;
    }

    // 3. user obtains a zap borrow transaction request through the build transaction API.
    expect(quotation.logics.length).to.eq(1);
    const transactionRequest = await api.buildRouterTransactionRequest({
      chainId,
      account: user.address,
      logics: quotation.logics,
    });
    await expect(user.sendTransaction(transactionRequest)).to.not.be.reverted;

    // 4. user's USDC borrow balance should increase.
    const borrowBalance = await service.getBorrowBalance(marketId, user.address, baseToken);
    const borrowDifference = borrowBalance.clone().sub(initBorrowBalance);
    const quoteDestAmount = new common.TokenAmount(baseToken, quotation.quotation.destAmount);

    // 4-1. debt grows when the block of getting api data is different from the block of executing tx
    const [, max] = utils.bpsBound(quoteDestAmount.amount, 10);
    const maxDestAmount = quoteDestAmount.clone().set(max);
    expect(borrowDifference.lte(maxDestAmount)).to.be.true;
    expect(borrowDifference.gte(quoteDestAmount)).to.be.true;

    // 5. user's USDC balance should increase
    await expect(user.address).to.changeBalance(destToken, quotation.quotation.destAmount);
  });

  it('user zap borrow USDT in USDC market', async function () {
    // 1. user obtains a quotation for zap borrow USDT from 100 USDC through the zap borrow API
    const destToken = polygonTokens.USDT;
    const srcAmount = '100';
    const slippage = 100;
    const quotation = await api.quote(chainId, marketId, 'zap-borrow', {
      account: user.address,
      srcAmount,
      destToken,
      slippage,
    });

    // 2. user needs to allow the Protocolink user agent to borrow on behalf of the user
    expect(quotation.approvals.length).to.eq(1);
    for (const approval of quotation.approvals) {
      await expect(user.sendTransaction(approval)).to.not.be.reverted;
    }

    // 3. user obtains a zap borrow transaction request through the build transaction API.
    expect(quotation.logics.length).to.eq(2);
    const transactionRequest = await api.buildRouterTransactionRequest({
      chainId,
      account: user.address,
      logics: quotation.logics,
    });
    await expect(user.sendTransaction(transactionRequest)).to.not.be.reverted;

    // 4. user's USDC borrow balance should increase.
    const borrowBalance = await service.getBorrowBalance(marketId, user.address, baseToken);
    const borrowDifference = borrowBalance.clone().sub(initBorrowBalance);
    const borrowAmount = new common.TokenAmount(baseToken, srcAmount);

    // 4-1. debt grows when the block of getting api data is different from the block of executing tx
    const [, maxBorrow] = utils.bpsBound(borrowAmount.amount, 10);
    const maxBorrowAmount = borrowAmount.clone().set(maxBorrow);
    expect(borrowDifference.lte(maxBorrowAmount)).to.be.true;
    expect(borrowDifference.gte(borrowAmount)).to.be.true;

    // 5. user's USDT balance should increase
    // 5-1. rate may change when the block of getting api data is different from the block of executing tx
    await expect(user.address).to.changeBalance(destToken, quotation.quotation.destAmount, slippage);
  });
});
