/**
 * ProtectedAsset — the resource preview and the original archive mark.
 *
 * The artwork here is OUR OWN inline SVG, drawn in this file. Nothing is photographed, copied
 * from the reference screenshots, or downloaded: the reference pack's pages are paper
 * photographs used as art direction, not as assets to paste over the app. Provenance is
 * recorded in `docs/ASSET_PROVENANCE.md`, as the UI lock requires.
 *
 * The stack of papers shows the shape of the thing — a sealed record, one page deep, with a
 * keyhole stamped on it — and carries no text, so it cannot imply a document that does not
 * exist. It is decorative and is hidden from assistive technology; the title beside it is the
 * real content.
 */

/** The archive mark from the storyboard, redrawn from scratch as a shield with a keyhole. */
export function VaultMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 46"
      width="28"
      height="32"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M20 1.6 37 9v11.4c0 12.6-7.6 20.4-17 24.4C10.6 40.8 3 33 3 20.4V9Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M20 13.5a5.4 5.4 0 0 1 5.4 5.4v3.2h-10.8v-3.2A5.4 5.4 0 0 1 20 13.5Z"
        stroke="#A7613C"
        strokeWidth="1.8"
      />
      <rect x="17.1" y="21.4" width="5.8" height="7.4" rx="1.2" fill="#A7613C" />
    </svg>
  );
}

/**
 * The sealed record: three offset pages and a stamped keyhole.
 *
 * Mirrors the archival stack in the visual target. It is a drawing of a sealed document, not a
 * claim about its contents.
 */
function SealedRecordArt() {
  return (
    <svg
      className="resource__art"
      viewBox="0 0 150 122"
      width="150"
      height="122"
      aria-hidden="true"
      focusable="false"
    >
      {/* Back pages, offset to read as a stack */}
      <path d="M45 8h78v86H45z" fill="#EFE5D5" stroke="#A99A82" strokeWidth="1.2" />
      <path d="M33 22h78v86H33z" fill="#F9F7F1" stroke="#A99A82" strokeWidth="1.2" />
      {/* Front page */}
      <path d="M21 36h78v86H21z" fill="#F9F7F1" stroke="#A99A82" strokeWidth="1.2" />

      {/* Ruled text lines — abstract, no words */}
      <path
        d="M33 60h54M33 70h42M33 80h48M33 90h34"
        stroke="#D0C6B6"
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {/* The stamp: a keyhole, the one warm mark on the page */}
      <path
        d="M72 100v-5.5a8 8 0 0 1 16 0V100"
        stroke="#A7613C"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
      />
      <rect x="69.5" y="99" width="21" height="16" rx="2" fill="#A7613C" />
      <circle cx="80" cy="105.5" r="1.8" fill="#F9F7F1" />
      <path d="M80 107v3.4" stroke="#F9F7F1" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export interface ProtectedAssetProps {
  name: string;
  sublabel: string;
}

export function ProtectedAsset({ name, sublabel }: ProtectedAssetProps) {
  return (
    <div className="resource">
      <div className="resource__art-well">
        <SealedRecordArt />
      </div>
      <div className="resource__meta">
        <p className="label resource__eyebrow">Protected resource</p>
        <h3 className="display resource__name">{name}</h3>
        <p className="resource__sublabel">{sublabel}</p>
      </div>
    </div>
  );
}
