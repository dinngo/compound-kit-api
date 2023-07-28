import { Service } from 'src/libs/compound-v3';

export async function setup() {
  const hre = await import('hardhat');

  // specify the service provider as the Hardhat provider
  Service.provider = hre.ethers.provider;
}
