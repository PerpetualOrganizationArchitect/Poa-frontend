import { useConnectModal } from '@rainbow-me/rainbowkit';
import { usePasskeyOnboarding } from '@/hooks/usePasskeyOnboarding';
import PasskeyOnboardingDialog from './PasskeyOnboardingDialog';

/** Passkey account creation followed by joining the current organization. */
export default function PasskeyOnboardingModal({
  isOpen,
  onClose,
  onSuccess,
  showWalletOption = false,
  paymasterHatId,
  variant,
}) {
  const onboarding = usePasskeyOnboarding();
  const { openConnectModal } = useConnectModal();

  return (
    <PasskeyOnboardingDialog
      isOpen={isOpen}
      onClose={onClose}
      onSuccess={onSuccess}
      variant={variant}
      onboarding={onboarding}
      startOnboarding={(username) => onboarding.startOnboarding(username, paymasterHatId)}
      successMessage={variant === 'join'
        ? "Your account is ready and you've joined the community."
        : "Your passkey account has been created and you've joined the organization."}
      successActionLabel="Get Started"
      onConnectWallet={showWalletOption ? openConnectModal : undefined}
    />
  );
}
