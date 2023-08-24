import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import * as api from 'test/fixtures/api';
import { claimToken, getChainId, polygonTokens, snapshotAndRevertEach } from '@protocolink/test-helpers';
import * as common from '@protocolink/common';
import { expect } from 'chai';
import hre from 'hardhat';
import * as logics from '@protocolink/logics';
import * as utils from 'test/utils';

describe('Transaction: Collateral Swap', function () {
  const srcToken = polygonTokens.WETH;
  const srcTokenInitBalance = '5';

  let chainId: number;
  let user: SignerWithAddress;

  before(async function () {
    chainId = await getChainId();
    [, user] = await hre.ethers.getSigners();
    await claimToken(chainId, user.address, srcToken, srcTokenInitBalance);
  });

  snapshotAndRevertEach();

  it('user collateral swap Wrapped Native Token in USDC market', async function () {
    const marketId = logics.compoundv3.MarketId.USDC;

    // 1. user has supplied 5 WETH
    const supplyAmount = new common.TokenAmount(srcToken, srcTokenInitBalance);
    await utils.supply(chainId, user, marketId, supplyAmount);

    // 2. user has borrowed 2000 USDC
    const baseToken = polygonTokens.USDC;
    const baseTokenBorrowAmount = '2000';
    const borrowAmount = new common.TokenAmount(baseToken, baseTokenBorrowAmount);
    await utils.borrow(chainId, user, marketId, borrowAmount);

    // 3. user obtains a quotation for collateral swap 3 WETH through the collateral swap API
    const srcAmount = '3';
    const slippage = 100;
    const destToken = polygonTokens.WMATIC;
    const quotation = await api.quote(chainId, marketId, 'collateral-swap', {
      account: user.address,
      srcToken,
      srcAmount,
      destToken,
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
    const collateralBalance = await service.getCollateralBalance(marketId, user.address, srcToken);
    expect(collateralBalance.eq(supplyAmount.clone().sub(srcAmount))).to.be.true;

    // 7. user's WMATIC collateral balance will increase.
    const destBalance = await service.getCollateralBalance(marketId, user.address, destToken);
    const quoteDestAmount = new common.TokenAmount(destToken, quotation.quotation.destAmount);

    // 7-1. rate may change when the block of getting api data is different from the block of executing tx
    const [min, max] = utils.bpsBound(quoteDestAmount.amount);
    const maxDestAmount = quoteDestAmount.clone().set(max);
    const minDestAmount = quoteDestAmount.clone().set(min);

    expect(destBalance.lte(maxDestAmount)).to.be.true;
    expect(destBalance.gte(minDestAmount)).to.be.true;
  });
});
