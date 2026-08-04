"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DebtProviderPermanentError = exports.DebtProviderTemporaryError = void 0;
class DebtProviderTemporaryError extends Error {
    retryable = true;
}
exports.DebtProviderTemporaryError = DebtProviderTemporaryError;
class DebtProviderPermanentError extends Error {
    retryable = false;
}
exports.DebtProviderPermanentError = DebtProviderPermanentError;
//# sourceMappingURL=DebtProvider.js.map