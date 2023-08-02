import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import * as api from 'test/fixtures/api';
import { claimToken, getChainId, polygonTokens, snapshotAndRevertOnce } from '@protocolink/test-helpers';
import * as common from '@protocolink/common';
import { expect } from 'chai';
import hre from 'hardhat';
import * as logics from '@protocolink/logics';
import * as utils from 'test/utils';

describe('Transaction: Deleverage', function () {
  let chainId: number;
  let user: SignerWithAddress;

  before(async function () {
    chainId = await getChainId();
    [, user] = await hre.ethers.getSigners();
    await claimToken(chainId, user.address, polygonTokens.WETH, '5');
  });

  snapshotAndRevertOnce();

  it('user deleverage his USDC market position with WETH', async function () {
    const marketId = logics.compoundv3.MarketId.USDC;

    // 1. user has supplied 5 WETH
    const supplyAmount = new common.TokenAmount(polygonTokens.WETH, '5');
    await utils.supply(chainId, user, marketId, supplyAmount);

    // 2. user has borrowed 2000 USDC
    const borrowAmount = new common.TokenAmount(polygonTokens.USDC, '2000');
    await utils.borrow(chainId, user, marketId, borrowAmount);

    // 3. user obtains a quotation for deleveraging the total debt through the deleverage API
    const slippage = 100;
    const deleverageCollateralToken = polygonTokens.WETH;
    const deleverageAmount = new common.TokenAmount(borrowAmount.token).setWei(
      common.calcSlippage(borrowAmount.amountWei, -slippage)
    );
    const quotation = await api.quote(chainId, marketId, 'deleverage', {
      account: user.address,
      token: deleverageCollateralToken,
      amount: deleverageAmount.amount,
      slippage,
    });

    // 4. user needs to allow the Protocolink user agent to borrow on behalf of the user
    expect(quotation.approvals.length).to.eq(1);
    for (const approval of quotation.approvals) {
      await expect(user.sendTransaction(approval)).to.not.be.reverted;
    }

    // 5. user obtains a deleverage transaction request through the build transaction API.
    expect(quotation.logics.length).to.eq(5);
    const transactionRequest = await api.buildRouterTransactionRequest({
      chainId,
      account: user.address,
      logics: quotation.logics,
    });
    await expect(user.sendTransaction(transactionRequest)).to.not.be.reverted;

    const service = new logics.compoundv3.Service(chainId, hre.ethers.provider);

    // 6. user's WETH collateral balance will decrease.
    const collateralBalance = await service.getCollateralBalance(marketId, user.address, deleverageCollateralToken);
    const leverageWithdrawAmount = new common.TokenAmount(quotation.logics[3].fields.output);
    expect(collateralBalance.eq(supplyAmount.clone().sub(leverageWithdrawAmount))).to.be.true;

    // 7. user's borrow balance will decrease.
    // 7-1. the total debt should be repaid.
    const borrowBalance = await service.getBorrowBalance(marketId, user.address);
    expect(borrowBalance.isZero).to.be.true;
  });
});
