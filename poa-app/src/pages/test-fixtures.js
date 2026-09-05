/**
 * E2E test-fixtures debug page (E2E mode only).
 *
 * Shows the agent's identity (burner EOA, virtual passkey smart account)
 * and pre-built vouch URLs for the configured org. The agent reads this
 * page to discover its addresses without needing to derive them.
 *
 * In production builds E2E_ENABLED is inlined to false, so webpack drops the
 * dynamic implementation and static export emits no page.
 */

import dynamic from 'next/dynamic';
import { E2E_ENABLED } from '@/services/e2e/e2eMode';

const EmptyTestFixturesPage = () => null;
const TestFixturesPage = E2E_ENABLED
  ? dynamic(() => import('@/services/e2e/TestFixturesPage'))
  : EmptyTestFixturesPage;

export default TestFixturesPage;

export function getStaticProps() {
  return E2E_ENABLED
    ? { props: {} }
    : { notFound: true };
}
