import { useCallback, useEffect, useRef, useState } from "react";
import type { SetURLSearchParams } from "react-router-dom";
import {
  confirmBillingCheckout,
  getBillingSummary,
  isInvalidSessionError,
  type BillingSummaryRecord
} from "../lib/api.js";
import type { CheckoutReturnDialogState } from "./billing-page-dialogs.js";
import {
  billingReflectsCheckout,
  clearPendingBillingCheckout,
  readPendingBillingCheckout
} from "./billing-page-helpers.js";

const BILLING_CHECKOUT_POLL_INTERVAL_MS = 250;
const BILLING_CHECKOUT_MAX_POLL_ATTEMPTS = 6;

interface BillingCheckoutSyncOptions {
  checkoutSessionId: string | null;
  checkoutStatus: string | null;
  billingStateRevisionRef: { current: number };
  commitBilling: (billing: BillingSummaryRecord) => void;
  refreshSession: () => Promise<unknown>;
  setCheckoutReturnDialog: (state: CheckoutReturnDialogState | null) => void;
  setIsForbidden: (forbidden: boolean) => void;
  setSearchParams: SetURLSearchParams;
}

interface BillingCheckoutSyncState {
  loadError: boolean;
  isRetrying: boolean;
  retry: () => void;
}

/** Read retries preserve the original checkout context; they never start another purchase. */
export function useBillingCheckoutSync({
  checkoutSessionId,
  checkoutStatus,
  billingStateRevisionRef,
  commitBilling,
  refreshSession,
  setCheckoutReturnDialog,
  setIsForbidden,
  setSearchParams
}: BillingCheckoutSyncOptions): BillingCheckoutSyncState {
  const [attempt, setAttempt] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [isRetrying, setIsRetrying] = useState(true);
  const requestPending = useRef(false);
  const retry = useCallback(() => {
    if (requestPending.current) return;
    requestPending.current = true;
    setIsRetrying(true);
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    requestPending.current = true;
    setIsRetrying(true);
    let pollTimer: ReturnType<typeof setTimeout> | undefined;

    const clearCheckoutReturn = (): void => {
      clearPendingBillingCheckout();
      setSearchParams(
        (currentParams) => {
          const nextParams = new URLSearchParams(currentParams);
          nextParams.delete("checkout");
          nextParams.delete("session_id");
          return nextParams;
        },
        { replace: true }
      );
    };

    const loadBillingSummary = async (): Promise<BillingSummaryRecord | null> => {
      const revisionAtStart = billingStateRevisionRef.current;
      try {
        const nextBilling = await getBillingSummary();
        if (cancelled) {
          return null;
        }

        if (revisionAtStart === billingStateRevisionRef.current) {
          commitBilling(nextBilling);
        }
        setIsForbidden(false);
        setLoadError(false);
        return nextBilling;
      } catch (error) {
        if (cancelled) {
          return null;
        }

        if (error instanceof Error && error.message === "forbidden") {
          setIsForbidden(true);
          setLoadError(false);
          return null;
        }

        if (isInvalidSessionError(error)) {
          setLoadError(false);
          return null;
        }

        setLoadError(true);
        setCheckoutReturnDialog(null);
        return null;
      } finally {
        if (!cancelled) {
          requestPending.current = false;
          setIsRetrying(false);
        }
      }
    };

    const pendingCheckout = checkoutStatus === "success" ? readPendingBillingCheckout() : null;

    const completeCheckoutReturn = (nextBilling: BillingSummaryRecord): void => {
      commitBilling(nextBilling);
      if (cancelled) {
        return;
      }

      setCheckoutReturnDialog({ status: "success", plan: nextBilling.plan });
      clearCheckoutReturn();
      void refreshSession().catch(() => undefined);
    };

    const pollForCheckoutUpdate = async (
      baseline: BillingSummaryRecord,
      attemptsRemaining: number
    ): Promise<void> => {
      const nextBilling = await loadBillingSummary();
      if (cancelled || nextBilling === null) {
        return;
      }

      if (billingReflectsCheckout(nextBilling, pendingCheckout, baseline)) {
        completeCheckoutReturn(nextBilling);
        return;
      }

      if (attemptsRemaining <= 0) {
        setCheckoutReturnDialog({ status: "delayed" });
        clearCheckoutReturn();
        return;
      }

      pollTimer = setTimeout(() => {
        void pollForCheckoutUpdate(baseline, attemptsRemaining - 1);
      }, BILLING_CHECKOUT_POLL_INTERVAL_MS);
    };

    void (async () => {
      const initialBilling = await loadBillingSummary();
      if (cancelled || initialBilling === null || checkoutStatus === null) {
        return;
      }

      if (checkoutStatus === "canceled") {
        setCheckoutReturnDialog({ status: "canceled" });
        clearCheckoutReturn();
        return;
      }

      if (checkoutStatus !== "success") {
        clearCheckoutReturn();
        return;
      }

      setCheckoutReturnDialog({ status: "syncing" });

      if (checkoutSessionId !== null) {
        try {
          const confirmedBilling = await confirmBillingCheckout(checkoutSessionId);
          if (cancelled) {
            return;
          }

          completeCheckoutReturn(confirmedBilling);
          return;
        } catch {
          if (cancelled) {
            return;
          }
        }
      }

      if (billingReflectsCheckout(initialBilling, pendingCheckout, null)) {
        completeCheckoutReturn(initialBilling);
        return;
      }

      await pollForCheckoutUpdate(initialBilling, BILLING_CHECKOUT_MAX_POLL_ATTEMPTS);
    })();

    return () => {
      cancelled = true;
      if (pollTimer !== undefined) {
        clearTimeout(pollTimer);
      }
    };
  }, [
    attempt,
    billingStateRevisionRef,
    checkoutSessionId,
    checkoutStatus,
    commitBilling,
    refreshSession,
    setCheckoutReturnDialog,
    setIsForbidden,
    setSearchParams
  ]);

  return { loadError, isRetrying, retry };
}
