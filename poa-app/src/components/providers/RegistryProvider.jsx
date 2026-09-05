import { ProfileHubProvider } from '@/context/profileHubContext';

/** Cross-chain organization registry for pages that need live public counts. */
export default function RegistryProvider({ children }) {
  return <ProfileHubProvider>{children}</ProfileHubProvider>;
}
