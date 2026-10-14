/**
 * LicenseVault's original archival illustration system.
 *
 * The shield/keyhole mark and both drawings are original inline SVGs. They are not screenshots,
 * stock images, or a claim that the listed pack files have been recovered; the actual opened
 * payload is the integrity-checked JSON manifest.
 */

export function VaultMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 46" width="28" height="32" fill="none" aria-hidden="true" focusable="false">
      <path d="M20 1.6 37 9v11.4c0 12.6-7.6 20.4-17 24.4C10.6 40.8 3 33 3 20.4V9Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M20 13.5a5.4 5.4 0 0 1 5.4 5.4v3.2h-10.8v-3.2A5.4 5.4 0 0 1 20 13.5Z" stroke="#A7613C" strokeWidth="1.8" />
      <rect x="17.1" y="21.4" width="5.8" height="7.4" rx="1.2" fill="#A7613C" />
    </svg>
  );
}

/** Large editorial illustration used beside the proposition. */
export function ArchiveHeroArt({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 560 250" fill="none" role="img" aria-label="Illustration of a sealed archival compartment holding a protected brand record">
      <path d="M18 226H542" stroke="#D4D0C5" strokeWidth="1.3" />
      <path d="M58 225V99C58 48 101 12 154 12S250 48 250 99V225" fill="#EAE2D4" stroke="#BDB3A2" strokeWidth="1.3" />
      <path d="M76 225V101C76 61 109 31 154 31S232 61 232 101V225" fill="#F9F7F1" stroke="#BDB3A2" strokeWidth="1.3" />
      <path d="M95 225V104C95 70 120 50 154 50S213 70 213 104V225" fill="#F0E7D8" stroke="#D4D0C5" strokeWidth="1.2" />
      <path d="M95 155H213M95 183H213" stroke="#D4D0C5" strokeWidth="1" />
      <path d="M111 86h87M111 96h61M111 106h76" stroke="#C9BDAA" strokeLinecap="round" strokeWidth="2" />
      <rect x="127" y="124" width="54" height="64" fill="#F9F7F1" stroke="#A99A82" strokeWidth="1.3" />
      <path d="M137 139h34M137 148h28M137 157h32" stroke="#D4D0C5" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M151 173v-4a7 7 0 0 1 14 0v4" stroke="#A7613C" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="148" y="172" width="20" height="16" rx="2" fill="#A7613C" />
      <circle cx="158" cy="178" r="1.6" fill="#F9F7F1" /><path d="M158 180v3" stroke="#F9F7F1" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M289 225V73H441V225" fill="#EFE5D5" stroke="#BDB3A2" strokeWidth="1.3" />
      <path d="M306 225V91H424V225" fill="#F9F7F1" stroke="#D4D0C5" strokeWidth="1.2" />
      <path d="M321 111h88M321 122h64M321 133h76" stroke="#C9BDAA" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="321" y="150" width="22" height="22" fill="#A7613C" />
      <rect x="348" y="150" width="22" height="22" fill="#526575" />
      <rect x="375" y="150" width="22" height="22" fill="#2E6650" />
      <path d="M320 185h88M320 193h59M320 201h78" stroke="#D4D0C5" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M472 117h42v77h-42z" fill="#EAE2D4" stroke="#BDB3A2" strokeWidth="1.2" />
      <path d="M482 131h22M482 140h22M482 149h18M482 158h22" stroke="#BDB3A2" strokeWidth="1.4" strokeLinecap="round" />
      <rect x="463" y="187" width="60" height="26" fill="#F9F7F1" stroke="#D4D0C5" strokeWidth="1.2" />
      <path d="M473 196h40M473 203h28" stroke="#C9BDAA" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="269" cy="56" r="13" fill="#F9F7F1" stroke="#D4D0C5" strokeWidth="1.2" />
      <path d="M269 49v14M262 56h14" stroke="#A7613C" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M26 242H128M432 242H534" stroke="#D4D0C5" strokeWidth="1" />
    </svg>
  );
}

/** Compact access-docket illustration: sealed folders and a lock, not a generic Web3 card. */
function SealedRecordArt() {
  return (
    <svg className="resource__art" viewBox="0 0 174 136" width="174" height="136" fill="none" aria-hidden="true" focusable="false">
      <path d="M42 8h94v101H42z" fill="#EFE5D5" stroke="#BDB3A2" strokeWidth="1.2" />
      <path d="M29 20h94v101H29z" fill="#F9F7F1" stroke="#BDB3A2" strokeWidth="1.2" />
      <path d="M17 33h94v101H17z" fill="#F9F7F1" stroke="#A99A82" strokeWidth="1.2" />
      <path d="M31 53h63M31 64h53M31 75h58M31 86h41" stroke="#D0C6B6" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="72" y="97" width="27" height="22" rx="2" fill="#A7613C" />
      <path d="M78 98v-4a7.5 7.5 0 0 1 15 0v4" stroke="#A7613C" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="85.5" cy="105.5" r="2" fill="#F9F7F1" /><path d="M85.5 108v4" stroke="#F9F7F1" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export interface ProtectedAssetProps { name: string; sublabel: string; }

export function ProtectedAsset({ name, sublabel }: ProtectedAssetProps) {
  return (
    <div className="resource">
      <div className="resource__art-well"><SealedRecordArt /></div>
      <div className="resource__meta">
        <p className="label resource__eyebrow">Protected resource</p>
        <h3 className="display resource__name">{name}</h3>
        <p className="resource__sublabel">{sublabel}</p>
      </div>
    </div>
  );
}
