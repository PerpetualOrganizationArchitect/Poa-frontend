// Root collections include historical pots, not just each org's current address.
// A full collection causes an explicit failure rather than a truncated headline.
export const INFLOW_COLLECTION_LIMIT = 1000;

export const LANDING_INFLOWS_QUERY = `
  query LandingInflows {
    taskManagers(first: 1000) { id createdAtBlock }
    paymentManagerContracts(first: 1000) { id createdAtBlock }
    executorContracts(first: 1000) { id createdAtBlock }
    paymasterHubContracts(first: 1000) { id createdAtBlock }
    payments(first: 1000, where: { token: "0x0000000000000000000000000000000000000000" }) {
      id payer amount token transactionHash
    }
    paymasterDepositEvents(first: 1000, where: { eventType: OrgDeposit }) {
      id from amount eventType transactionHash
    }
    solidarityEvents(first: 1000, where: { eventType: DonationReceived }) {
      id from amount eventType transactionHash
    }
    _meta { block { number } hasIndexingErrors }
  }
`;
