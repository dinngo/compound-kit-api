import '@nomicfoundation/hardhat-chai-matchers';
import '@protocolink/test-helpers';

import { HardhatUserConfig } from 'hardhat/config';
import { setup } from 'test/hooks';

const config: HardhatUserConfig = {
  networks: {
    hardhat: {
      chainId: process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID) : 137,
      gasPrice: 0,
      initialBaseFeePerGas: 0,
      accounts: {
        mnemonic: 'test test test test test test test test test test test compound',
        path: "m/44'/60'/0'/0",
        initialIndex: 0,
      },
      forking: {
        url: process.env.HTTP_RPC_URL ?? 'https://rpc.ankr.com/polygon',
      },
    },
  },
  mocha: {
    timeout: 1200000,
    rootHooks: { beforeAll: [setup] },
  },
};

export default config;
