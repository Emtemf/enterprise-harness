// Public Verify receipt API.  Skills must not import runtime/lib directly.
export {
  parseValidationTestCaseCoverage,
  persistVerificationReceipts,
  validateVerificationReceipt,
  validateVerificationReceiptsForStageResult,
  verificationEvidenceDirectoryRef,
  verificationReceiptRef,
} from '../lib/verification-receipts.mjs';
