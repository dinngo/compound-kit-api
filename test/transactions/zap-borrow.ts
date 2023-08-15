import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import * as api from 'test/fixtures/api';
import * as common from '@protocolink/common';
import { expect } from 'chai';
import { getBalance, getChainId, polygonTokens, snapshotAndRevertEach } from '@protocolink/test-helpers';
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
    user = await hre.ethers.getImpersonatedSigner('0xf6da9e9d73d7893223578d32a95d6d7de5522767');
    service = new logics.compoundv3.Service(chainId, hre.ethers.provider);
    initBorrowBalance = await service.getBorrowBalance(marketId, user.address, baseToken);
  });

  snapshotAndRevertEach();

  it('user zap borrow USDC in USDC market', async function () {
    // 1. user obtains a quotation for zap borrow 100 USDC through the zap borrow API
    const targetToken = baseToken;
    const initTargetBalance = await getBalance(user.address, targetToken);
    const amount = '100';
    const slippage = 100;
    const quotation = await api.quote(chainId, marketId, 'zap-borrow', {
      account: user.address,
      amount,
      targetToken,
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
    const quoteTargetAmount = new common.TokenAmount(baseToken, quotation.quotation.targetTokenAmount);

    // 4-1. debt grows when the block of getting api data is different from the block of executing tx
    const [, max] = utils.bpsBound(quoteTargetAmount.amount, 10);
    const maxTargetAmount = quoteTargetAmount.clone().set(max);
    expect(borrowDifference.lte(maxTargetAmount)).to.be.true;
    expect(borrowDifference.gte(quoteTargetAmount)).to.be.true;

    // 5. user's USDC balance should increase
    const targetBalance = await getBalance(user.address, targetToken);
    expect(targetBalance.clone().sub(initTargetBalance).eq(quoteTargetAmount)).to.be.true;
  });

  it('user zap borrow USDT in USDC market', async function () {
    // 1. user obtains a quotation for zap borrow USDT from 100 USDC through the zap borrow API
    const targetToken = polygonTokens.USDT;
    const initTargetBalance = await getBalance(user.address, targetToken);
    const amount = '100';
    const slippage = 100;
    const quotation = await api.quote(chainId, marketId, 'zap-borrow', {
      account: user.address,
      amount,
      targetToken,
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
    const borrowAmount = new common.TokenAmount(baseToken, amount);

    // 4-1. debt grows when the block of getting api data is different from the block of executing tx
    const [, maxBorrow] = utils.bpsBound(borrowAmount.amount, 10);
    const maxBorrowAmount = borrowAmount.clone().set(maxBorrow);
    expect(borrowDifference.lte(maxBorrowAmount)).to.be.true;
    expect(borrowDifference.gte(borrowAmount)).to.be.true;

    // 5. user's USDT balance should increase
    // 5-1. rate may change when the block of getting api data is different from the block of executing tx
    const targetBalance = await getBalance(user.address, targetToken);
    const targetDifference = targetBalance.clone().sub(initTargetBalance);
    const quoteTargetAmount = new common.TokenAmount(targetToken, quotation.quotation.targetTokenAmount);
    const [minTarget, maxTarget] = utils.bpsBound(quoteTargetAmount.amount);
    const minTargetAmount = quoteTargetAmount.clone().set(minTarget);
    const maxTargetAmount = quoteTargetAmount.clone().set(maxTarget);

    expect(targetDifference.lte(maxTargetAmount)).to.be.true;
    expect(targetDifference.gte(minTargetAmount)).to.be.true;
  });
});