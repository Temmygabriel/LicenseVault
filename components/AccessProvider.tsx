"use client";

/**
 * The access flow, in one client component tree.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHERE THE VERDICT COMES FROM
 *
 * The browser does not decide anything here. It sends an address to
 * `/api/verify-license`, which performs a real `eth_call` to the vault's read condition on
 * Aeneid, and it renders the answer. If the fetch fails, the response is not a verdict, or the
 * shape is unrecognisable, the result is `VERIFICATION_ERROR` — never `NO_LICENSE`, and never
 * any kind of success.
 *
 * The state machine is `lib/access/state.ts`, unchanged and un-forked: its successful states
 * still cannot be constructed without evidence, and this component has no branch that produces
 * one. The mapping from a chain answer to an event is `lib/access/verify.ts`, the same pure
 * function the tests cover and the same rule the CLI harness obeys.
 *
 * WHY THE HEADER AND THE DOCKET SHARE THIS
 *
 * Two components need the address under test — the wallet chip in the header and the
 * LICENSE HOLDER row in the docket. A context keeps them one value instead of two copies that
 * can disagree, and keeps the address honest: both show the address the chain was actually
 * asked about, not whatever is currently typed in the input.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getAddress, isAddress, type Address } from "viem";

import { INITIAL_ACCESS_STATE, reduceAccess, type AccessState } from "@/lib/access/state";
import { eventForVerdict, isProbeVerdict } from "@/lib/access/verify";
import { CANONICAL_VAULT } from "@/lib/protocol/canonical-vault";

export interface AccessContextValue {
  state: AccessState;
  /** What is currently typed in the address field. */
  draft: string;
  setDraft: (value: string) => void;
  /** The address the chain was last asked about — the one the docket reports. */
  checkedAddress: Address | null;
  /** A rejected input or a transport failure, shown beside the field. Cleared on each attempt. */
  problem: string | null;
  busy: boolean;
  /** Verify the draft address. Rejects locally without asking the chain if it is not an address. */
  verify: (address?: string) => void;
  reset: () => void;
  /** Fill the field from the browser wallet, if one is present, and check it. */
  useInjectedWallet: () => void;
}

const AccessContext = createContext<AccessContextValue | null>(null);

export function useAccess(): AccessContextValue {
  const value = useContext(AccessContext);
  if (value === null) {
    throw new Error("useAccess must be used inside <AccessProvider>.");
  }
  return value;
}

/** What the route sends back on success. Every field is checked before it is used. */
export function AccessProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reduceAccess, INITIAL_ACCESS_STATE);
  const [draft, setDraft] = useState("");
  const [checkedAddress, setCheckedAddress] = useState<Address | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const inFlight = useRef(false);

  const busy = state.phase === "CHECKING" || state.phase === "ACCESSING";

  const verify = useCallback(
    (address?: string) => {
      const candidate = (address ?? draft).trim();

      if (inFlight.current) return;
      setProblem(null);

      if (!isAddress(candidate)) {
        // A rejected input never reaches the chain, so it can never be a licensing answer.
        // It is reported beside the field and the state machine is left exactly where it was.
        setProblem(
          "That is not a valid EVM address. Nothing was asked of the chain, so nothing was decided.",
        );
        return;
      }

      const wallet = getAddress(candidate);
      inFlight.current = true;

      try {
        dispatch({ type: "VERIFY_REQUESTED" });
      } catch {
        inFlight.current = false;
        return;
      }
      setCheckedAddress(wallet);
      setDraft(wallet);

      void (async () => {
        try {
          const response = await fetch("/api/verify-license", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ address: wallet }),
          });

          let payload: unknown = null;
          try {
            payload = await response.json();
          } catch {
            payload = null;
          }

          const record =
            typeof payload === "object" && payload !== null
              ? (payload as Record<string, unknown>)
              : null;

          if (!response.ok || record === null || !isProbeVerdict(record["verdict"])) {
            const detail =
              record !== null && typeof record["error"] === "string"
                ? record["error"]
                : `The check did not return a verdict (HTTP ${response.status}).`;
            dispatch({
              type: "VERIFICATION_FAILED",
              failure: {
                kind: "INFRASTRUCTURE_FAILURE",
                detail: `${detail} No licensing decision was made.`,
              },
            });
            setProblem(detail);
            return;
          }

          const { verdict, checkedAt, chainId } = record;

          if (typeof chainId !== "number" || chainId !== CANONICAL_VAULT.chainId) {
            dispatch({
              type: "VERIFICATION_FAILED",
              failure: {
                kind: "WRONG_NETWORK",
                detail: `The answer did not come from Aeneid (chain ${String(chainId)}).`,
              },
            });
            setProblem(
              `The answer did not come from Aeneid (chain ${String(chainId)}), so it was not used.`,
            );
            return;
          }

          dispatch(
            eventForVerdict({
              verdict,
              context: {
                wallet,
                chainId,
                vaultUuid: CANONICAL_VAULT.uuid,
                ipId: CANONICAL_VAULT.ipId,
                licenseTermsId: CANONICAL_VAULT.licenseTermsId,
                licenseTokenIds: [CANONICAL_VAULT.licenseTokenId],
                checkedAt:
                  typeof checkedAt === "string" ? checkedAt : new Date().toISOString(),
              },
            }),
          );
        } catch (caught) {
          const detail = caught instanceof Error ? caught.message : String(caught);
          // A transport failure is not a statement about anyone's rights.
          dispatch({
            type: "VERIFICATION_FAILED",
            failure: {
              kind: "INFRASTRUCTURE_FAILURE",
              detail: `The check could not be sent: ${detail}`,
            },
          });
          setProblem(`The check could not be sent: ${detail}`);
        } finally {
          inFlight.current = false;
        }
      })();
    },
    [draft],
  );

  const reset = useCallback(() => {
    dispatch({ type: "RESET" });
    setCheckedAddress(null);
    setProblem(null);
    inFlight.current = false;
  }, []);

  const useInjectedWallet = useCallback(() => {
    void (async () => {
      const provider = typeof window === "undefined" ? undefined : window.ethereum;
      if (provider?.request === undefined) {
        setProblem(
          "No browser wallet was found, so there is no address to read. Paste one instead — " +
            "a check never needs a signature.",
        );
        return;
      }
      try {
        const accounts = (await provider.request({ method: "eth_requestAccounts" })) as unknown;
        const first = Array.isArray(accounts) ? accounts[0] : undefined;
        if (typeof first !== "string") {
          setProblem("The wallet returned no account.");
          return;
        }
        setDraft(first);
        verify(first);
      } catch (caught) {
        const detail = caught instanceof Error ? caught.message : String(caught);
        // A cancelled connection is not a licensing answer either; the machine is untouched.
        setProblem(`The wallet did not share an address: ${detail}`);
      }
    })();
  }, [verify]);

  const value = useMemo<AccessContextValue>(
    () => ({
      state,
      draft,
      setDraft,
      checkedAddress,
      problem,
      busy,
      verify,
      reset,
      useInjectedWallet,
    }),
    [state, draft, checkedAddress, problem, busy, verify, reset, useInjectedWallet],
  );

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}
