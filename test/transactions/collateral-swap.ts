import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import * as api from 'test/fixtures/api';
import { claimToken, getChainId, polygonTokens, snapshotAndRevertEach } from '@protocolink/test-helpers';
import * as common from '@protocolink/common';
import { expect } from 'chai';
import hre from 'hardhat';
import * as logics from '@protocolink/logics';
import * as utils from 'test/utils';

describe('Transaction: Collateral Swap', function () {
  const collateralToken: common.Token = polygonTokens.WETH;
  const collateralTokenInitBalance: string = '5';

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
    const baseToken: common.Token = polygonTokens.USDC;
    const baseTokenBorrowAmount: string = '2000';
    const borrowAmount = new common.TokenAmount(baseToken, baseTokenBorrowAmount);
    await utils.borrow(chainId, user, marketId, borrowAmount);

    // 3. user obtains a quotation for collateral swap 3 WETH through the collateral swap API
    const amount = '3';
    const slippage = 100;
    const targetToken: common.Token = polygonTokens.WMATIC;
    const quotation = await api.quote(chainId, marketId, 'collateral-swap', {
      account: user.address,
      withdrawalToken: collateralToken,
      amount: amount,
      targetToken: targetToken,
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

    const service = new logics.compoundv3.Service(chainId, hre.ethers.provider);

    // 6. user's WETH collateral balance will decrease.
    const collateralBalance = await service.getCollateralBalance(marketId, user.address, collateralToken);
    expect(collateralBalance.eq(supplyAmount.clone().sub(amount)));

    // 7. user's borrow balance will increase.
    // 7-1. As the block number increases, the initial borrow balance will also increase.
    const borrowBalance = await service.getBorrowBalance(marketId, user.address);
    expect(borrowBalance.gte(borrowAmount)).to.be.true;
  });
});
