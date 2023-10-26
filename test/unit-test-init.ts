import * as common from '@protocolink/common';

common.setNetwork(common.ChainId.mainnet, { rpcUrl: 'https://eth.llamarpc.com' });
common.setNetwork(common.ChainId.polygon, { rpcUrl: 'https://rpc.ankr.com/polygon' });
common.setNetwork(common.ChainId.arbitrum, { rpcUrl: 'https://arbitrum.llamarpc.com' });
