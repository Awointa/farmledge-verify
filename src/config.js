// The one network this page checks. A bundle for any other contract is
// refused outright: a page that checks Testnet while looking like it checks
// mainnet is worse than no page. The contract is the published deployment
// (farmledge-protocol deployments/testnet.env, data_version 3).
export const NETWORK = Object.freeze({
  id: 'testnet',
  name: 'Stellar Testnet',
  passphrase: 'Test SDF Network ; September 2015',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  contractId: 'CBW6TA5UJMXJY2VYPJV6WUVWNUP3PKZNPXFMC2CNVCWZDF3SKIT4UAIN',
  isTestNetwork: true,
});
