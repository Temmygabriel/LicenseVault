/**
 * The browser wallet the page may ask for an address.
 *
 * Declared rather than installed. EIP-1193 is a two-method surface for what this build needs —
 * the page reads an address and never asks for a signature — so pulling in a connector library
 * to reach it would add a dependency that does real work for no benefit. The UI lock also
 * forbids a new runtime dependency on this pass.
 *
 * `request` is typed loosely on purpose: the shapes a wallet returns are not uniform, and every
 * value that comes back from here is validated before it is used.
 */
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      isMetaMask?: boolean;
    };
  }
}

export {};
