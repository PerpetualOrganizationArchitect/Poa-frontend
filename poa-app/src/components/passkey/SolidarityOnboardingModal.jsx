import { useSolidarityOnboarding } from '@/hooks/useSolidarityOnboarding';
import PasskeyOnboardingDialog from './PasskeyOnboardingDialog';

/** Homepage passkey account creation funded by the shared solidarity pool. */
export default function SolidarityOnboardingModal({ isOpen, onClose, onSuccess }) {
  const onboarding = useSolidarityOnboarding();

  return (
    <PasskeyOnboardingDialog
      isOpen={isOpen}
      onClose={onClose}
      onSuccess={onSuccess}
      onboarding={onboarding}
      startOnboarding={onboarding.startOnboarding}
      successMessage="Your passkey account has been created. Browse and join organizations to get started!"
      successActionLabel="Start Exploring"
    />
  );
}
