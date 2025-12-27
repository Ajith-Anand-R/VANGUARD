export function assertExecutionContext(context) {
    if (!context) throw new Error("CONTEXT_MISSING");

    // Budget Contract
    // Negotiator requires budget_approved to be present (number)
    // We allow explicit 0, but it must be defined.
    if (context.approved_budget === undefined && context.budget_approved === undefined) {
        throw new Error("CONTRACT_VIOLATION: budget_approved (or approved_budget) missing from context");
    }

    // Normalized Budget
    const budget = context.approved_budget !== undefined ? context.approved_budget : context.budget_approved;
    if (typeof budget !== 'number') {
        throw new Error(`CONTRACT_VIOLATION: budget must be a number, got ${typeof budget}`);
    }

    // Options Contract
    // Check deep path for options if not at top level
    let options = context.options;
    if (!options) {
        // Fallback lookups that negotiator does, but we should standardize.
        // For now, if we can't find options, it's a violation for Negotiator.
        if (context.options_data?.options) options = context.options_data.options;
        else if (context.previous_data?.options) options = context.previous_data.options;
        else if (context.previous_data?.previous_data?.options) options = context.previous_data.previous_data.options;
    }

    if (!options || !Array.isArray(options)) {
        throw new Error("CONTRACT_VIOLATION: options missing or not an array");
    }

    return {
        budget,
        options
    };
}
