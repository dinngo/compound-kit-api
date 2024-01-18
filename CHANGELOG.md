# CompoundKit API

## 0.1.7

### Patch Changes

- 4c4f1f2: upgrade lambda runtime to nodejs18.x

## 0.1.6

### Patch Changes

- 1c5fa3f: add mainnet rpc url in unit-test-init.ts
- af23ec6: Updated dependencies
  - @protocolink/api@0.4.4
  - @protocolink/common@0.3.3
  - @protocolink/compound-kit@0.1.8
  - @protocolink/logics@0.4.4
- e3597e5: add custom faucet address for zap-repay.ts

## 0.1.5

### Patch Changes

- f7a39bf: support arbitrum usdc market

## 0.1.4

### Patch Changes

- 2dc56ca: Updated dependencies
  - @protocolink/api@0.4.0
  - @protocolink/compound-kit@0.1.5
  - @protocolink/logics@0.4.0

## 0.1.3

### Patch Changes

- 9d20663: leverage, zap-borrow apis add baseBorrowMin validation

## 0.1.2

### Patch Changes

- c35b559: fix targetLiquidationLimit of collateral swap
- 4a84f10: prevent balancer swap in paraswap when using balancer flash loan

## 0.1.1

### Patch Changes

- fd8630c: forward protocolink error
- 3a19169: refine request and response parameter naming convention
- 60de717: add v1 get zap borrow quotation route
- c784980: fix liquidationThreshold of zap supply and withdraw
- e561415: update collateral swap flash loan quote with repays
- 29d213e: Updated dependencies
  - @protocolink/api@0.3.0
  - @protocolink/common@0.3.0
  - @protocolink/compound-kit@0.1.3
  - @protocolink/logics@0.3.0
- 540b722: fix zap withdraw e2e balance check
- a421e60: add v1 get collateral swap quotation route
- b1f1886: add v1 get zap repay quotation route
- 4e67bfc: resolve cors issue
- b1f1886: add v1 get zap withdraw quotation route
- 82292c1: implement deleverage function
- 1c83168: fix borrowUSD of zap repay
- d03ba16: fix zap borrow/withdraw target position
- 6de4b28: update quote apis to respond fees
- d06f0bc: fix zap withdraw 1 wei issue
- a8fb589: integrate flash loan aggregator
- c2a4bd4: fix netAPR calculation
- 07f5e6d: add v1 get zap tokens route
- 87615f1: refine Position and collateral swap e2e test
- 7b39028: fix targetBorrowCapacityUSD of zap withdraw
- 6f46caa: fix identical object key and value
- a31f2be: implement protocolink estimate api permit2 type param
- db8e611: update with @protocolink/compound-kit sdk
- 6058ff1: add v1 get zap supply quotation route
- d426ad2: add unit test init
- d06f0bc: add zap repay & withdraw e2e test
- f373422: Position type add supplyUSD
- d5ae3a0: fix collateral swap amount check

## 0.1.0

### Patch Changes

- 3a7a814: update calcNetAPR denominator to netWorth
- 3af49b8: warmup api
- b32401a: build transaction route add referralCode param
- c7becef: add leverage integration test
- 57896bc: update build transaction router path to /v1/transactions/build
- 1558b58: Updated dependencies
  - @protocolink/api@0.2.6
  - @protocolink/common@0.2.14
- 70c4687: add v1 build transaction route
- dc40bb7: Updated dependencies
  - @protocolink/api@0.2.8
  - @protocolink/common@0.2.15
  - @protocolink/logics@0.2.9
- 3b4baf0: rename Value to USD, Apr to APR
- 8456044: add docs route
- 59d5197: calcHealthRate remove supplyValue
- 9bae7e5: add v1 get leverage quotation route
- 2d61ba8: Updated dependencies
  - @middy/core@4.5.5
  - @middy/error-logger@4.5.5
  - @middy/http-error-handler@4.5.5
  - @middy/http-header-normalizer@4.5.5
  - @middy/http-json-body-parser@4.5.5
  - @middy/http-router@4.5.5
  - @middy/http-urlencode-body-parser@4.5.5
  - @middy/http-urlencode-path-parser@4.5.5
  - @middy/input-output-logger@4.5.5
  - @middy/util@4.5.5
  - @protocolink/api@0.2.5
  - @protocolink/common@0.2.11
  - @protocolink/logics@0.2.7
- d781193: leverage flash loan base token instead of collateral token
- 969600d: add v1 get market route
- 8f0cb38: add v1 get markets route
