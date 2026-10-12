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
  // Where a reprinted slip's #p=<token> is fetched from: <proofApi>/proofs/<token>
  // (farmledge-app GET /proofs/:token, API D58). Page configuration, never
  // the link's. The bundle it returns is a claim like any other; only the
  // ledger checks it. Null until Farmledge's API has a public address: a
  // slip link then says it cannot fetch, and the bundle can still be pasted
  // or uploaded and compared with the slip.
  proofApi: null,
  proofTimeoutMs: 15_000,
});
