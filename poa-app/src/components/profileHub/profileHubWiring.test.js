/**
 * Profile Hub authentication wiring, enforced over the source.
 *
 * Vitest runs in `node` in this repository and there is no React DOM/test-library
 * harness.  These assertions cover the seams a pure helper test cannot: the
 * Profile Hub and account page must render the shared account control, that
 * control must coordinate AuthContext with wagmi in the correct order, and
 * UserContext must not retain the previous identity after authentication ends.
 *
 * Precedent: `components/accessV2/roleFormWiring.test.js` and
 * `hooks/accessV2/gating.test.js`.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '..', '..');
const read = (...parts) => {
  try {
    return readFileSync(join(SRC, ...parts), 'utf8');
  } catch {
    return '';
  }
};

const profileHeader = read('components', 'profileHub', 'ProfileHeader.jsx');
const accountControl = read('components', 'common', 'AccountControl.jsx');
const passkeyAccountInfo = read('components', 'passkey', 'PasskeyAccountInfo.jsx');
const accountBadge = read('components', 'common', 'ConnectedAccountBadge.jsx');
const disconnectHook = read('hooks', 'useUnifiedDisconnect.js');
const accountPage = read('pages', 'account', 'index.js');
const profilePage = read('pages', 'profile', 'index.js');
const authContext = read('context', 'AuthContext.js');
const userContext = read('context', 'UserContext.js');

function memoSlice(name, nextName) {
  const start = userContext.indexOf(`const ${name} = useMemo`);
  const end = userContext.indexOf(`const ${nextName}`, start + 1);
  return start < 0 ? '' : userContext.slice(start, end < 0 ? undefined : end);
}

/**
 * The body of `if (<condition>) { … }`, extracted by matching braces.
 *
 * Slicing a fixed number of characters after an anchor made these assertions
 * fail whenever a comment above the code grew, which is a test failure that
 * says nothing about the product.
 */
function blockAfter(source, condition) {
  const at = source.indexOf(condition);
  if (at < 0) return '';
  const open = source.indexOf('{', at);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(open + 1, i);
  }
  return '';
}

/** The JSX line containing `needle`, plus `radius` lines of context each way. */
function linesAround(source, needle, radius = 3) {
  const lines = source.split('\n');
  const at = lines.findIndex((line) => line.includes(needle));
  if (at < 0) return '';
  return lines.slice(Math.max(0, at - radius), at + radius + 1).join('\n');
}

function accountResetEffect() {
  const effects = [...userContext.matchAll(
    /useEffect\(\(\) => \{([\s\S]*?)\n\s*\}, \[([^\]]*)\]\);/g
  )];
  return effects.find(([, body, dependencies]) =>
    /\b(?:account|effectiveAddress|orgUserID)\b/.test(dependencies)
    && body.includes('setUserData({})')
    && body.includes("setGraphUsername('')")
  )?.[1] || '';
}

describe('Profile Hub uses one authenticated account control', () => {
  it('reads every source involved in the regression', () => {
    expect(profileHeader).toContain('export function ProfileHeader');
    expect(accountControl).toMatch(/(?:function|const) AccountControl\b/);
    expect(accountPage).toContain('const AccountPage');
    expect(userContext).toContain('export const UserProvider');
  });

  it('renders AccountControl from both authenticated profile surfaces', () => {
    for (const [label, source] of [
      ['ProfileHeader', profileHeader],
      ['/account', accountPage],
    ]) {
      expect(source, `${label} does not import the shared control`).toContain(
        "import AccountControl from '@/components/common/AccountControl'"
      );
      expect(source, `${label} does not render the shared control`).toContain('<AccountControl');
    }

    // A stock RainbowKit button owns its own Disconnect action, so AuthContext
    // never sees an explicit sign-out and may immediately restore a cached passkey.
    expect(profileHeader).not.toMatch(/import\s+\{\s*ConnectButton\s*\}\s+from ['"]@rainbow-me\/rainbowkit['"]/);
    expect(profileHeader).not.toContain('<ConnectButton');
  });

  it('binds the tested sign-out rules to real wagmi state in one place', () => {
    // The ordering (signOut first) and the fan-out over every wagmi connection
    // are covered at runtime by lib/auth/unifiedDisconnect.test.js. Here we only
    // pin that a hook supplies it with real bindings.
    expect(disconnectHook, 'useUnifiedDisconnect is missing').toBeTruthy();
    expect(disconnectHook).toContain('useAuth');
    expect(disconnectHook).toContain('useDisconnect');
    expect(disconnectHook).toContain('useConnections');
    expect(disconnectHook).toContain(
      "import { runUnifiedDisconnect } from '@/lib/auth/unifiedDisconnect'"
    );
    expect(disconnectHook).toMatch(
      /runUnifiedDisconnect\(\s*\{\s*signOut,\s*disconnect,\s*connections\s*\}\s*\)/
    );
  });

  it('routes every Disconnect affordance through that one hook', () => {
    // A surface that re-rolls `signOut()` + a bare `disconnect()` re-introduces
    // both bugs at once: the stored passkey re-attaches, and wagmi promotes the
    // next live connector so an address is still shown.
    for (const [label, source] of [
      ['AccountControl', accountControl],
      ['ConnectedAccountBadge', accountBadge],
    ]) {
      expect(source, `${label} is missing`).toBeTruthy();
      expect(source, `${label} does not use the shared disconnect hook`).toContain(
        "import useUnifiedDisconnect from '@/hooks/useUnifiedDisconnect'"
      );
      expect(source, `${label} does not invoke it`).toMatch(/useUnifiedDisconnect\(\)/);
      expect(source, `${label} still calls wagmi disconnect directly`)
        .not.toMatch(/\buseDisconnect\b/);
      expect(source, `${label} has no Disconnect affordance`).toMatch(/Disconnect/);
    }
    expect(accountControl).toContain('ConnectButton.Custom');
  });

  it('keeps Disconnect reachable while the wallet is on an unsupported chain', () => {
    // RainbowKit's stock "Wrong network" button only opens the chain switcher,
    // which left a wrong-network user with no way to sign out at all.
    const branch = blockAfter(accountControl, 'if (chain.unsupported)');
    expect(branch, 'no unsupported-chain branch').toBeTruthy();
    expect(branch, 'unsupported-chain branch has no Disconnect')
      .toContain('<DisconnectMenuItem');
  });

  it('does not hide the Profile Hub account control on mobile', () => {
    // The regression was a `<Box display={{ base: 'none', md: 'block' }}>`
    // wrapper, so the surrounding JSX is what matters, not the element itself.
    const rendered = linesAround(profileHeader, '<AccountControl');
    expect(rendered, 'ProfileHeader does not render the account control').toBeTruthy();
    expect(rendered).not.toMatch(/display=\{\{\s*base:\s*['"]none['"]/);
    expect(profileHeader).toContain("direction={{ base: 'column', md: 'row' }}");
    expect(profileHeader).toContain("w={{ base: '100%', md: 'auto' }}");
    expect(profileHeader).toContain('aria-label="Approvals & Roles"');
    expect(profileHeader).toContain("display={{ base: 'inline-flex', md: 'none' }}");
  });

  it('waits for auth restoration before choosing the wallet or passkey control', () => {
    expect(accountControl).toContain('isAuthHydrated');
    expect(accountControl).toMatch(/if \(!isAuthHydrated\) return null/);
  });

  it('keeps account menus legible on the dark Profile Hub surface', () => {
    expect(passkeyAccountInfo).toContain('bg="gray.900"');
    expect(passkeyAccountInfo).toContain('borderColor="whiteAlpha.300"');
  });

  it('keeps the account dropdown above the Profile Hub cards', () => {
    // The cards below the header are positioned at z-index 2 and render later.
    // Matching that layer lets them cover the dropdown despite its own z-index,
    // because the menu cannot escape the ProfileHeader stacking context.
    const headerLayer = linesAround(profileHeader, 'boxShadow="lg"', 8);
    expect(headerLayer).toContain('position="relative"');
    expect(headerLayer).toContain('zIndex={3}');
    expect(accountControl).toContain('zIndex={1500}');
  });

  it('keeps an explicit sign-out suppressed across reloads in the same tab', () => {
    expect(authContext).toContain('EXPLICIT_SIGN_OUT_KEY');
    expect(authContext).toContain('window.sessionStorage.setItem(EXPLICIT_SIGN_OUT_KEY');
    expect(authContext).toContain('window.sessionStorage.getItem(EXPLICIT_SIGN_OUT_KEY');

    for (const entryPoint of ['const signOut = useCallback', 'const forgetPasskey = useCallback']) {
      const body = blockAfter(authContext, entryPoint);
      expect(body, `${entryPoint} not found`).toBeTruthy();
      expect(body, `${entryPoint} does not persist the suppression flag`)
        .toContain('writeExplicitSignOut(true)');
    }
  });

  it('never renders the previous Profile Hub after authentication is gone', () => {
    expect(profilePage).toContain('isAuthenticated');
    expect(profilePage).toContain('You’re disconnected');
    // ...but only once both auth backends have finished restoring a session,
    // or every reload flashes the disconnected screen at a signed-in user.
    expect(profilePage).toMatch(/if\s*\(\s*isAuthHydrated\s*&&\s*!isAuthenticated\s*\)/);
    expect(authContext).toContain('isAuthHydrated');
    expect(authContext).toMatch(/passkeyRestoreSettled\s*&&/);
    expect(authContext).toContain("eoaStatus !== 'reconnecting'");
    expect(profilePage).toContain('<AccountControl />');
    expect(profilePage).toContain('<div style={glassLayerStyle} />');
    expect(profilePage).toMatch(/color="white"[\s\S]*?You’re disconnected/);
    expect(profilePage).toMatch(/color="gray\.300"[\s\S]*?Sign in again/);
  });

  it('settles auth hydration on every path out of the restore effect', () => {
    // A path that returns without settling is an infinite spinner, not a flash.
    // The two that matter most are the ones this change introduced: a reload
    // after an explicit sign-out, and wagmi having already reconnected.
    const at = authContext.indexOf('// Auto-reconnect: on mount');
    expect(at, 'restore effect not found').toBeGreaterThan(-1);
    const effect = authContext.slice(at, authContext.indexOf('}, []);', at));

    // Settle is latched: any path may call it, a double-call is a no-op, and no
    // path relies on the fragile "I am the only async path" assumption.
    expect(effect, 'settle() is not an idempotent latch')
      .toMatch(/const settle = \(\) => \{[\s\S]*?if \(settled\) return;[\s\S]*?setPasskeyRestoreSettled\(true\);[\s\S]*?\};/);
    expect(effect, 'explicit sign-out / already-connected path never settles')
      .toMatch(/if \(explicitSignOutRef\.current \|\| eoaConnected\) \{\s*\n\s*settle\(\);/);
    // The synchronous fall-through only settles when no async restore owns it,
    // so a future async branch can defer settle() without racing hydration.
    expect(effect, 'synchronous fall-through does not settle')
      .toMatch(/if \(!asyncSettlePending\) settle\(\);/);
    // Only the SSR guard may return before `settle` is even defined; any other
    // bare return there is a path that leaves hydration pending forever.
    const beforeSettle = effect.slice(0, effect.indexOf('const settle'));
    const bareReturns = beforeSettle.match(/\breturn\s*;/g) || [];
    expect(bareReturns.length, 'a non-SSR early return skips settle()').toBe(1);
    expect(beforeSettle).toContain("if (typeof window === 'undefined') return;");
  });
});

describe('UserContext drops stale identity state on disconnect', () => {
  it('derives a lowercase account directly from the active auth address', () => {
    const start = userContext.indexOf('const effectiveAddress');
    const end = userContext.indexOf('// Construct the org-specific user ID', start);
    const derivation = start < 0 ? '' : userContext.slice(start, end < 0 ? undefined : end);
    expect(derivation).toContain('const account');
    expect(derivation).toContain('effectiveAddress');
    expect(derivation).toContain('toLowerCase()');
    expect(derivation).toMatch(/null/);
    expect(userContext).not.toMatch(/const \[account, setAccount\] = useState/);
  });

  it('clears every identity-derived value when the active account changes or disappears', () => {
    const reset = accountResetEffect();
    expect(reset, 'missing account-keyed reset effect').toBeTruthy();
    for (const statement of [
      'setUserData({})',
      "setGraphUsername('')",
      'setClaimedTasks([])',
      'setUserProposals([])',
      'setCompletedModules([])',
      'setOptimisticRoles(null)',
      'optimisticLockRef.current = null',
    ]) {
      expect(reset, `account reset omits ${statement}`).toContain(statement);
    }
  });

  it('delegates account scoping to the runtime-tested rules', () => {
    // lib/user/userScope.test.js covers the semantics; this pins that the
    // context uses those helpers rather than a re-implementation that drifts.
    expect(userContext).toContain("from '../lib/user/userScope'");
    for (const helper of [
      'buildUserScope(orgId, account)',
      'isDataForScope({ data, account, orgUserID })',
      'isUserStateCurrent({ account, orgUserID, resolvedUserScope })',
      'deriveUserDataLoading({',
    ]) {
      expect(userContext, `UserContext does not use ${helper}`).toContain(helper);
    }
  });

  it('settles loading when the user query errors', () => {
    // The Profile Hub gates on !userDataLoading; a query error that never
    // settles the flag is an infinite spinner. Anchor on the effect body rather
    // than a byte offset from a comment, so editing prose cannot fail this.
    const effect = userContext.match(
      /useEffect\(\(\) => \{\s*if \(!error\) \{([\s\S]*?)\}, \[([^\]]*)\]\);/
    );
    expect(effect, 'no error-settles-loading effect').toBeTruthy();
    const [, body, dependencies] = effect;
    expect(body).toContain('setUserDataLoading(false)');
    // Recording the scope is the half that actually clears the derived flag:
    // deriveUserDataLoading stays true while resolvedUserScope !== orgUserID.
    expect(body).toContain('setResolvedUserScope(orgUserID)');
    expect(body).toContain('handledUserErrorRef.current === error');
    expect(body).toContain('handledUserErrorRef.current = error');
    expect(dependencies).toMatch(/\berror\b/);
    expect(dependencies).toMatch(/\borgUserID\b/);
    expect(dependencies).not.toMatch(/\bresolvedUserScope\b/);
  });

  it('cannot derive role authority from Apollo data without an active account', () => {
    const memberRole = memoSlice('hasMemberRole', 'hasApproverRole');
    const approverRole = memoSlice('hasApproverRole', 'refetchUserData');
    for (const [label, source] of [
      ['hasMemberRole', memberRole],
      ['hasApproverRole', approverRole],
    ]) {
      expect(source, `${label} memo was not found`).toBeTruthy();
      expect(source, `${label} is not gated on the current account`)
        .toMatch(/if\s*\(\s*!account(?:\s*\|\|[^)]*)?\)\s*return false/);
      expect(source, `${label} must recompute when account changes`)
        .toMatch(/\[[^\]]*\baccount\b[^\]]*\]/);
    }
  });
});
