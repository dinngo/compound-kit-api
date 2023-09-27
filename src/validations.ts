import * as logics from '@protocolink/logics';

export function validateChain(chainId: number) {
  return logics.compoundv3.configs.some((config) => chainId === config.chainId);
}
