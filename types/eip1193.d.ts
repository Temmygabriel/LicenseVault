/**
 * Minimal EIP-1193 surface used by LicenseVault.
 * We request account access only after a user gesture and never request seed phrases/private keys.
 */
export interface LicenseVaultEip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?: (event: string, listener: (value: unknown) => void) => void;
  removeListener?: (event: string, listener: (value: unknown) => void) => void;
  isMetaMask?: boolean;
}

declare global {
  interface Window {
    ethereum?: LicenseVaultEip1193Provider;
  }
}

export {};
