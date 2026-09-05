import { FETCH_LATEST_REJECTED_SUBMISSION } from '@/util/queries';

/**
 * Resolve the work associated with a task's latest rejection from indexed data.
 * The subgraph owns the historical relationship; IPFS is only used to hydrate
 * content while the TaskMetadata file data source is still catching up.
 */
export async function fetchLatestRejectedSubmission({
  client,
  taskId,
  fetchFromIpfs,
}) {
  if (!client || !taskId) return null;

  const { data } = await client.query({
    query: FETCH_LATEST_REJECTED_SUBMISSION,
    variables: { taskId },
    fetchPolicy: 'network-only',
  });
  const indexedSubmission = data?.task?.latestRejection?.submission;
  if (typeof indexedSubmission?.metadata?.submission === 'string') {
    return indexedSubmission.metadata.submission;
  }

  if (!indexedSubmission?.submissionHash || typeof fetchFromIpfs !== 'function') {
    return null;
  }

  const submissionMetadata = await fetchFromIpfs(indexedSubmission.submissionHash);
  return typeof submissionMetadata?.submission === 'string'
    ? submissionMetadata.submission
    : null;
}
