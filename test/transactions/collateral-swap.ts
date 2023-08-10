import BigNumberJS from 'bignumber.js';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import * as api from 'test/fixtures/api';
import { claimToken, getChainId, polygonTokens, snapshotAndRevertEach } from '@protocolink/test-helpers';
import * as common from '@protocolink/common';
import { expect } from 'chai';
import hre from 'hardhat';
import * as logics from '@protocolink/logics';
import * as utils from 'test/utils';

describe('Transaction: Collateral Swap', function () {
  const collateralToken = polygonTokens.WETH;
  const collateralTokenInitBalance = '5';

  let chainId: number;
  let user: SignerWithAddress;

  before(async function () {
    chainId = await getChainId();
    [, user] = await hre.ethers.getSigners();
    await claimToken(chainId, user.address, collateralToken, collateralTokenInitBalance);
  });

  snapshotAndRevertEach();

  it('user collateral swap Wrapped Native Token in USDC market', async function () {
    const marketId = logics.compoundv3.MarketId.USDC;

    // 1. user has supplied 5 WETH
    const supplyAmount = new common.TokenAmount(collateralToken, collateralTokenInitBalance);
    await utils.supply(chainId, user, marketId, supplyAmount);

    // 2. user has borrowed 2000 USDC
    const baseToken = polygonTokens.USDC;
    const baseTokenBorrowAmount = '2000';
    const borrowAmount = new common.TokenAmount(baseToken, baseTokenBorrowAmount);
    await utils.borrow(chainId, user, marketId, borrowAmount);

    // 3. user obtains a quotation for collateral swap 3 WETH through the collateral swap API
    const amount = '3';
    const slippage = 100;
    const targetToken = polygonTokens.WMATIC;
    const quotation = await api.quote(chainId, marketId, 'collateral-swap', {
      account: user.address,
      withdrawalToken: collateralToken,
      amount,
      targetToken,
      slippage,
    });

    // 4. user needs to allow the Protocolink user agent to borrow on behalf of the user
    expect(quotation.approvals.length).to.eq(1);
    for (const approval of quotation.approvals) {
      await expect(user.sendTransaction(approval)).to.not.be.reverted;
    }

    // 5. user obtains a collateral swap transaction request through the build transaction API.
    expect(quotation.logics.length).to.eq(5);
    const transactionRequest = await api.buildRouterTransactionRequest({
      chainId,
      account: user.address,
      logics: quotation.logics,
    });
    await expect(user.sendTransaction(transactionRequest)).to.not.be.reverted;

    // 6. user's WETH collateral balance will decrease.
    const service = new logics.compoundv3.Service(chainId, hre.ethers.provider);
    const collateralBalance = await service.getCollateralBalance(marketId, user.address, collateralToken);
    expect(collateralBalance.eq(supplyAmount.clone().sub(amount))).to.be.true;

    // 7. user's WMATIC collateral balance will increase.
    const targetBalance = await service.getCollateralBalance(marketId, user.address, targetToken);
    const quoteTargetAmount = new common.TokenAmount(targetToken, quotation.quotation.targetTokenAmount);

    // 7-1. rate may change when the block of getting api data is different from the block of executing tx
    const [min, max] = bpsBound(quoteTargetAmount.amount);
    const maxTargetAmount = quoteTargetAmount.clone().set(max);
    const minTargetAmount = quoteTargetAmount.clone().set(min);

    expect(targetBalance.lte(maxTargetAmount)).to.be.true;
    expect(targetBalance.gte(minTargetAmount)).to.be.true;
  });

  function bpsBound(amount: string, bps = 100, bpsBase = 10000): [string, string] {
    const amountBigNum = BigNumberJS(amount);
    const offset = amountBigNum.times(bps).div(bpsBase);
    const max = amountBigNum.plus(offset);
    const min = amountBigNum.minus(offset);
    return [min.toString(), max.toString()];
  }
});
