export function getInvoiceLifecycleStatus(invoice = {}) {
  if (
    invoice.invoiceStatus === "cancelled" ||
    invoice.fiscalStatus === "cancelled"
  ) {
    return "cancelled";
  }

  return invoice.status || "draft";
}

export function calculateInvoiceSummaryTotals(invoices = []) {
  return invoices.reduce(
    (totals, invoice) => {
      const amount = Number(invoice.totalAmount) || 0;
      const status = getInvoiceLifecycleStatus(invoice);

      if (status === "pending") {
        totals.facturado += amount;
        totals.pendiente += amount;
      } else if (status === "paid") {
        totals.facturado += amount;
        totals.cobrado += amount;
      }

      return totals;
    },
    { facturado: 0, cobrado: 0, pendiente: 0 },
  );
}
