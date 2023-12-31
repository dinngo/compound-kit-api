import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import * as api from 'test/fixtures/api';
import { claimToken, getChainId, polygonTokens, snapshotAndRevertEach } from '@protocolink/test-helpers';
import * as common from '@protocolink/common';
import { expect } from 'chai';
import hre from 'hardhat';
import * as logics from '@protocolink/logics';
import * as utils from 'test/utils';

describe('Transaction: Zap Supply', function () {
  const marketId = logics.compoundv3.MarketId.USDC;

  let chainId: number;
  let user: SignerWithAddress;

  before(async function () {
    chainId = await getChainId();
    [, user] = await hre.ethers.getSigners();
    await claimToken(chainId, user.address, polygonTokens.WETH, '10');
    await claimToken(chainId, user.address, polygonTokens.USDT, '2000');
  });

  snapshotAndRevertEach();

  it('user zap supply USDT to WETH Token in USDC market', async function () {
    // 1. user obtains a quotation for zap supply 100 USDT to WETH through the zap supply API
    const srcToken = polygonTokens.USDT;
    const destToken = polygonTokens.WETH;
    const srcAmount = '100';
    const slippage = 100;
    const quotation = await api.quote(chainId, marketId, 'zap-supply', {
      account: user.address,
      srcToken,
      srcAmount,
      destToken,
      slippage,
    });

    // 2. user needs to permit the Protocolink user agent to supply for the user
    expect(quotation.approvals.length).to.eq(1);
    for (const approval of quotation.approvals) {
      await expect(user.sendTransaction(approval)).to.not.be.reverted;
    }
    const permitData = quotation.permitData;
    expect(permitData).to.not.be.undefined;
    const { domain, types, values } = permitData!;
    const permitSig = await user._signTypedData(domain, types, values);

    // 3. user obtains a zap supply transaction request through the build transaction API.
    expect(quotation.logics.length).to.eq(2);
    const transactionRequest = await api.buildRouterTransactionRequest({
      chainId,
      account: user.address,
      logics: quotation.logics,
      permitData,
      permitSig,
    });
    await expect(user.sendTransaction(transactionRequest)).to.not.be.reverted;

    // 4. user's WETH collateral balance will increase.
    const service = new logics.compoundv3.Service(chainId, hre.ethers.provider);
    const collateralBalance = await service.getCollateralBalance(marketId, user.address, destToken);
    const quoteDestAmount = new common.TokenAmount(destToken, quotation.quotation.destAmount);

    // 4-1. rate may change when the block of getting api data is different from the block of executing tx
    const [min, max] = utils.bpsBound(quoteDestAmount.amount);
    const maxDestAmount = quoteDestAmount.clone().set(max);
    const minDestAmount = quoteDestAmount.clone().set(min);

    expect(collateralBalance.lte(maxDestAmount)).to.be.true;
    expect(collateralBalance.gte(minDestAmount)).to.be.true;
  });

  it('user zap supply USDT to USDC Token in USDC market', async function () {
    // 1. user obtains a quotation for zap supply 100 USDT to USDC through the zap supply API
    const srcToken = polygonTokens.USDT;
    const destToken = polygonTokens.USDC;
    const srcAmount = '100';
    const slippage = 100;
    const quotation = await api.quote(chainId, marketId, 'zap-supply', {
      account: user.address,
      srcToken,
      srcAmount,
      destToken,
      slippage,
    });

    // 2. user needs to permit the Protocolink user agent to supply for the user
    expect(quotation.approvals.length).to.eq(1);
    for (const approval of quotation.approvals) {
      await expect(user.sendTransaction(approval)).to.not.be.reverted;
    }
    const permitData = quotation.permitData;
    expect(permitData).to.not.be.undefined;
    const { domain, types, values } = permitData!;
    const permitSig = await user._signTypedData(domain, types, values);

    // 3. user obtains a zap supply transaction request through the build transaction API.
    expect(quotation.logics.length).to.eq(2);
    const transactionRequest = await api.buildRouterTransactionRequest({
      chainId,
      account: user.address,
      logics: quotation.logics,
      permitData,
      permitSig,
    });
    await expect(user.sendTransaction(transactionRequest)).to.not.be.reverted;

    // 4. user's USDC balance will increase.
    // 4-1. rate may change when the block of getting api data is different from the block of executing tx
    const service = new logics.compoundv3.Service(chainId, hre.ethers.provider);
    const cToken = await service.getCToken(marketId);
    await expect(user.address).to.changeBalance(cToken, quotation.quotation.destAmount, slippage);
  });
});
