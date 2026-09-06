import AuthorityBoundary from '@/components/providers/AuthorityBoundary';
import NetworkModalControl from '@/components/NetworkModalControl';
import { DataBaseProvider } from '@/context/dataBaseContext';
import { IdentityProvider } from '@/context/IdentityContext';
import { POProvider } from '@/context/POContext';
import { ProfileHubProvider } from '@/context/profileHubContext';
import { ProjectProvider } from '@/context/ProjectContext';
import { UserProvider } from '@/context/UserContext';
import { VotingProvider } from '@/context/VotingContext';
import { Web3Provider } from '@/context/web3Context';
import TourOverlay from '@/features/tour/components/TourOverlay';
import TourPrompt from '@/features/tour/components/TourPrompt';
import { TourProvider } from '@/features/tour/TourContext';

/** Organization-specific data and UI, loaded only outside public/root routes. */
export default function OrganizationProviders({ children }) {
  return (
    <IdentityProvider>
      <ProfileHubProvider>
        <POProvider>
          <VotingProvider>
            <ProjectProvider>
              <UserProvider>
                <Web3Provider>
                  <DataBaseProvider>
                    <TourProvider>
                      <NetworkModalControl />
                      <TourOverlay />
                      <TourPrompt />
                      <AuthorityBoundary>{children}</AuthorityBoundary>
                    </TourProvider>
                  </DataBaseProvider>
                </Web3Provider>
              </UserProvider>
            </ProjectProvider>
          </VotingProvider>
        </POProvider>
      </ProfileHubProvider>
    </IdentityProvider>
  );
}
