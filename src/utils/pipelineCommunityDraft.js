const clean = (value) => (typeof value === "string" ? value.trim() : "");

export function shouldOfferCommunityCreation(opportunity, nextStage) {
  return (
    nextStage === "won" &&
    opportunity?.stage !== "won" &&
    !clean(opportunity?.clientId)
  );
}

export function buildCommunityDraftFromOpportunity(opportunity = {}) {
  const contactName = clean(opportunity.contactName);
  const address = clean(opportunity.clientAddress) || clean(opportunity.zone);

  return {
    name:
      clean(opportunity.clientName) ||
      contactName ||
      clean(opportunity.name),
    address,
    type: "comunidad",
    contactPerson: contactName,
    contactPhone: clean(opportunity.phone),
    billingAddress: address,
    billingEmail: clean(opportunity.email),
  };
}
