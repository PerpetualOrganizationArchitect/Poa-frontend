import { createElement } from 'react';

/** Render component content and capture real action handlers without a browser or wallet. */
export function mockChakra(actions = []) {
  const components = {
    useDisclosure: () => ({ isOpen: false, onOpen() {}, onClose() {} }),
    useMediaQuery: () => [false],
    useToast: () => () => {},
  };
  return new Proxy(components, {
    get(target, name) {
      if (name === 'then') return undefined;
      if (!(name in target)) {
        target[name] = function MockChakraComponent({ children, onClick, isDisabled, ...props }) {
          const isButton = name === 'Button';
          if (isButton) actions.push({ children, onClick, isDisabled });
          return createElement(isButton ? 'button' : 'div', {
            disabled: isButton ? isDisabled : undefined,
            'aria-label': props['aria-label'],
          }, children);
        };
      }
      return target[name];
    },
  });
}
