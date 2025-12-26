import popbill from "popbill";

const taxinvoiceService = new popbill.TaxinvoiceService();

taxinvoiceService.setLinkID(process.env.POPBILL_LINK_ID || "");
taxinvoiceService.setSecretKey(process.env.POPBILL_SECRET_KEY || "");
taxinvoiceService.setTest(process.env.POPBILL_IS_TEST === "true");

export async function issueTaxInvoice(corpNum, taxInvoice, memo, forceIssue) {
  return new Promise((resolve, reject) => {
    taxinvoiceService.RegistIssue(
      corpNum,
      taxInvoice,
      memo,
      forceIssue,
      (result) => {
        if (result.code) {
          reject(new Error(`[${result.code}] ${result.message}`));
        } else {
          resolve(result);
        }
      }
    );
  });
}

export async function getTaxInvoiceInfo(corpNum, mgtKeyType, mgtKey) {
  return new Promise((resolve, reject) => {
    taxinvoiceService.GetInfo(corpNum, mgtKeyType, mgtKey, (result) => {
      if (result.code) {
        reject(new Error(`[${result.code}] ${result.message}`));
      } else {
        resolve(result);
      }
    });
  });
}
