import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import * as api from 'test/fixtures/api';
import { claimToken, getChainId, polygonTokens, snapshotAndRevertOnce } from '@protocolink/test-helpers';
import * as common from '@protocolink/common';
import { expect } from 'chai';
import hre from 'hardhat';
import * as logics from '@protocolink/logics';
import * as utils from 'test/utils';

describe('Transaction: Leverage', function () {
  let chainId: number;
  let user: SignerWithAddress;

  before(async function () {
    chainId = await getChainId();
    [, user] = await hre.ethers.getSigners();
    await claimToken(chainId, user.address, polygonTokens.WETH, '5');
  });

  snapshotAndRevertOnce();

  it('user leverage his USDC market position with WETH', async function () {
    const marketId = logics.compoundv3.MarketId.USDC;

    // 1. user has supplied 5 WETH
    const supplyAmount = new common.TokenAmount(polygonTokens.WETH, '5');
    await utils.supply(chainId, user, marketId, supplyAmount);

    // 2. user has borrowed 2000 USDC
    const borrowAmount = new common.TokenAmount(polygonTokens.USDC, '2000');
    await utils.borrow(chainId, user, marketId, borrowAmount);

    // 3. user obtains a quotation for leveraging 3 WETH through the leverage API
    const leverageAmount = new common.TokenAmount(polygonTokens.WETH, '3');
    const slippage = 100;
    const quotation = await api.quote(chainId, marketId, 'leverage', {
      account: user.address,
      token: leverageAmount.token,
      amount: leverageAmount.amount,
      slippage,
    });

    // 4. user needs to allow the Protocolink user agent to borrow on behalf of the user
    expect(quotation.approvals.length).to.eq(1);
    for (const approval of quotation.approvals) {
      await expect(user.sendTransaction(approval)).to.not.be.reverted;
    }

    // 5. user obtains a leverage transaction request through the build transaction API.
    expect(quotation.logics.length).to.eq(5);
    const transactionRequest = await api.buildRouterTransactionRequest({
      chainId,
      account: user.address,
      logics: quotation.logics,
    });
    await expect(user.sendTransaction(transactionRequest)).to.not.be.reverted;

    const service = new logics.compoundv3.Service(chainId, hre.ethers.provider);

    // 6. user's WETH collateral balance will increase.
    // 6-1. due to the slippage caused by the swap, we need to calculate the minimum leverage amount.
    const collateralBalance = await service.getCollateralBalance(marketId, user.address, leverageAmount.token);
    const minimumLeverageAmount = new common.TokenAmount(leverageAmount.token).setWei(
      common.calcSlippage(leverageAmount.amountWei, slippage)
    );
    expect(collateralBalance.gte(supplyAmount.clone().add(minimumLeverageAmount))).to.be.true;

    // 7. user's borrow balance will increase.
    // 7-1. As the block number increases, the initial borrow balance will also increase.
    const borrowBalance = await service.getBorrowBalance(marketId, user.address);
    const leverageBorrowAmount = new common.TokenAmount(quotation.logics[3].fields.output);
    expect(borrowBalance.gte(borrowAmount.clone().add(leverageBorrowAmount))).to.be.true;
  });
});
