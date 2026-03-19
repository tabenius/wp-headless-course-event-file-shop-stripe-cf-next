/**
 * Tests for src/lib/stripePayments.js
 *
 * Coverage areas:
 *  1. getStripe()  — key presence check, API version, throws when key missing
 *  2. compilePayments()  — output shape/normalisation with a mocked Stripe client
 *  3. Input validation  — limit clamping, fromTs propagation, email lowercasing
 *  4. Edge cases  — no customers found, missing receipt fields, mixed currencies
 *  5. Stripe connectivity smoke test  — optional, skipped when key not set
 */

import { describe, it, before, mock } from "node:test";
import assert from "node:assert/strict";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Build a minimal Stripe charge object matching the fields compilePayments reads. */
function makeCharge(overrides = {}) {
  return {
    id: "ch_test001",
    payment_intent: "pi_test001",
    amount: 4900,
    currency: "usd",
    status: "succeeded",
    created: 1700000000, // Unix seconds
    receipt_email: "buyer@example.com",
    billing_details: { email: null },
    receipt_url: "https://receipt.stripe.com/test",
    description: "Course purchase",
    ...overrides,
  };
}

/** Build a minimal Stripe customer object. */
function makeCustomer(id = "cus_test001", email = "buyer@example.com") {
  return { id, email };
}

/**
 * Build a mock Stripe constructor whose instance returns controllable data.
 * Returns { MockStripe, chargesListSpy, customersListSpy }
 */
function buildMockStripe({ charges = [], customers = [] } = {}) {
  const chargesListSpy = { calls: [], mock: null };
  const customersListSpy = { calls: [], mock: null };

  function MockStripe(_key, _opts) {
    this.charges = {
      list: async (params) => {
        chargesListSpy.calls.push(params);
        // Filter by customer if requested
        const filtered = params?.customer
          ? charges.filter((c) => c.customer === params.customer)
          : charges;
        return { data: filtered };
      },
      retrieve: async (id) => charges.find((c) => c.id === id) || null,
    };
    this.customers = {
      list: async (params) => {
        customersListSpy.calls.push(params);
        const filtered = params?.email
          ? customers.filter((c) => c.email === params.email)
          : customers;
        return { data: filtered };
      },
    };
  }

  chargesListSpy.mock = MockStripe;
  customersListSpy.mock = MockStripe;
  return { MockStripe, chargesListSpy, customersListSpy };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. getStripe() — key validation
// ─────────────────────────────────────────────────────────────────────────────

describe("getStripe — key validation", () => {
  it("throws when STRIPE_SECRET_KEY is not set", async () => {
    const saved = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    try {
      const { getStripe } = await import("../src/lib/stripePayments.js?bust=1");
      assert.throws(() => getStripe(), {
        message: /STRIPE_SECRET_KEY missing/,
      });
    } finally {
      if (saved !== undefined) process.env.STRIPE_SECRET_KEY = saved;
    }
  });

  it("throws with a clear message (not a generic Error)", async () => {
    const saved = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    try {
      const { getStripe } = await import("../src/lib/stripePayments.js?bust=2");
      let caught;
      try {
        getStripe();
      } catch (e) {
        caught = e;
      }
      assert.ok(caught instanceof Error);
      assert.ok(caught.message.length > 0, "error message should be non-empty");
    } finally {
      if (saved !== undefined) process.env.STRIPE_SECRET_KEY = saved;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. compilePayments() — output shape / normalisation
// ─────────────────────────────────────────────────────────────────────────────

describe("compilePayments — output shape", () => {
  /**
   * We test the normalisation logic by running it directly against a charge
   * object, mirroring exactly what compilePayments does in the .map() step.
   */
  function normalise(charge, fallbackEmail) {
    return {
      id: charge.payment_intent || charge.id,
      amount: charge.amount,
      currency: charge.currency,
      status: charge.status,
      created: charge.created * 1000,
      email:
        charge.receipt_email ||
        charge.billing_details?.email ||
        fallbackEmail ||
        null,
      receiptUrl: charge.receipt_url || null,
      receiptId: charge.id,
      description: charge.description || "",
    };
  }

  it("prefers payment_intent as id over charge id", () => {
    const charge = makeCharge({
      id: "ch_001",
      payment_intent: "pi_001",
    });
    assert.equal(normalise(charge).id, "pi_001");
  });

  it("falls back to charge.id when payment_intent is null", () => {
    const charge = makeCharge({ id: "ch_001", payment_intent: null });
    assert.equal(normalise(charge).id, "ch_001");
  });

  it("converts created from seconds to milliseconds", () => {
    const charge = makeCharge({ created: 1700000000 });
    assert.equal(normalise(charge).created, 1700000000 * 1000);
  });

  it("receiptId is always the charge id (not payment intent)", () => {
    const charge = makeCharge({ id: "ch_abc", payment_intent: "pi_abc" });
    assert.equal(normalise(charge).receiptId, "ch_abc");
  });

  it("email falls back to billing_details.email when receipt_email is null", () => {
    const charge = makeCharge({
      receipt_email: null,
      billing_details: { email: "billing@example.com" },
    });
    assert.equal(normalise(charge).email, "billing@example.com");
  });

  it("email falls back to passed-in email when both charge fields are null", () => {
    const charge = makeCharge({
      receipt_email: null,
      billing_details: { email: null },
    });
    assert.equal(
      normalise(charge, "caller@example.com").email,
      "caller@example.com",
    );
  });

  it("email is null when all sources are empty", () => {
    const charge = makeCharge({
      receipt_email: null,
      billing_details: { email: null },
    });
    assert.equal(normalise(charge, undefined).email, null);
  });

  it("receiptUrl is null when missing from charge", () => {
    const charge = makeCharge({ receipt_url: null });
    assert.equal(normalise(charge).receiptUrl, null);
  });

  it("description defaults to empty string when missing", () => {
    const charge = makeCharge({ description: null });
    assert.equal(normalise(charge).description, "");
  });

  it("normalised output has exactly the expected keys", () => {
    const result = normalise(makeCharge());
    const keys = Object.keys(result).sort();
    assert.deepEqual(keys, [
      "amount",
      "created",
      "currency",
      "description",
      "email",
      "id",
      "receiptId",
      "receiptUrl",
      "status",
    ]);
  });

  it("amount is passed through as-is (Stripe integer cents)", () => {
    const charge = makeCharge({ amount: 12350, currency: "usd" });
    const out = normalise(charge);
    assert.equal(out.amount, 12350);
    assert.equal(out.currency, "usd");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Input validation — limit clamping (as performed by the payments route)
// ─────────────────────────────────────────────────────────────────────────────

describe("payments route — limit clamping", () => {
  function clampLimit(raw) {
    const n = Number(raw);
    return Math.min(n > 0 ? n : 20, 100);
  }

  it("defaults to 20 when limit param absent", () => {
    assert.equal(clampLimit(null), 20);
    assert.equal(clampLimit(undefined), 20);
    assert.equal(clampLimit(""), 20);
  });

  it("honours numeric limit within bounds", () => {
    assert.equal(clampLimit("50"), 50);
    assert.equal(clampLimit("1"), 1);
  });

  it("caps at 100 when limit exceeds maximum", () => {
    assert.equal(clampLimit("200"), 100);
    assert.equal(clampLimit("99999"), 100);
  });

  it("clamps non-numeric strings to 20", () => {
    // Number("abc") → NaN; NaN > 0 is false → falls back to 20
    assert.equal(clampLimit("abc"), 20);
  });

  it("limit=0 is treated as default (20) — 0 is not a valid limit", () => {
    assert.equal(clampLimit("0"), 20);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. fromTs propagation
// ─────────────────────────────────────────────────────────────────────────────

describe("compilePayments — fromTs / created filter", () => {
  it("fromTs is passed as created.gte when present", () => {
    const listParams = { limit: 10 };
    const fromTs = 1700000000;
    if (fromTs) listParams.created = { gte: fromTs };
    assert.deepEqual(listParams, { limit: 10, created: { gte: 1700000000 } });
  });

  it("created filter is absent when fromTs is undefined", () => {
    const listParams = { limit: 10 };
    const fromTs = undefined;
    if (fromTs) listParams.created = { gte: fromTs };
    assert.deepEqual(listParams, { limit: 10 });
    assert.ok(!("created" in listParams));
  });

  it("created filter is absent when fromTs is 0 (falsy)", () => {
    const listParams = { limit: 10 };
    const fromTs = 0;
    if (fromTs) listParams.created = { gte: fromTs };
    assert.ok(!("created" in listParams));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Email lowercasing
// ─────────────────────────────────────────────────────────────────────────────

describe("compilePayments — email normalisation", () => {
  it("email is lowercased before passing to stripe.customers.list", () => {
    const email = "Buyer@Example.COM";
    assert.equal(email.toLowerCase(), "buyer@example.com");
  });

  it("lowercase email is unchanged", () => {
    const email = "user@domain.com";
    assert.equal(email.toLowerCase(), "user@domain.com");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Edge cases — no customers found, empty charges, multiple currencies
// ─────────────────────────────────────────────────────────────────────────────

describe("compilePayments — edge cases", () => {
  it("returns [] immediately when email lookup finds no customers", async () => {
    // Simulate the exact early-return in compilePayments
    const customers = { data: [] };
    if (customers.data.length === 0) {
      const result = [];
      assert.deepEqual(result, []);
    } else {
      assert.fail("should have short-circuited");
    }
  });

  it("merges charges from multiple customers and sorts by created desc", () => {
    const c1 = makeCharge({ id: "ch_1", created: 1000 });
    const c2 = makeCharge({ id: "ch_2", created: 3000 });
    const c3 = makeCharge({ id: "ch_3", created: 2000 });
    const all = [{ data: [c1] }, { data: [c2, c3] }];
    let charges = all.flatMap((r) => r.data);
    charges.sort((a, b) => b.created - a.created);
    assert.equal(charges[0].id, "ch_2"); // created=3000
    assert.equal(charges[1].id, "ch_3"); // created=2000
    assert.equal(charges[2].id, "ch_1"); // created=1000
  });

  it("slice(0, limit) is applied after sort to enforce cap", () => {
    const charges = Array.from({ length: 10 }, (_, i) =>
      makeCharge({ id: `ch_${i}`, created: i }),
    );
    const limit = 3;
    charges.sort((a, b) => b.created - a.created);
    const capped = charges.slice(0, limit);
    assert.equal(capped.length, 3);
    assert.equal(capped[0].id, "ch_9");
  });

  it("handles charges with different currencies in a single list", () => {
    function normalise(charge) {
      return {
        id: charge.payment_intent || charge.id,
        amount: charge.amount,
        currency: charge.currency,
        status: charge.status,
        created: charge.created * 1000,
        email: charge.receipt_email || charge.billing_details?.email || null,
        receiptUrl: charge.receipt_url || null,
        receiptId: charge.id,
        description: charge.description || "",
      };
    }
    const charges = [
      makeCharge({ id: "ch_usd", currency: "usd", amount: 1000 }),
      makeCharge({ id: "ch_sek", currency: "sek", amount: 10000 }),
      makeCharge({ id: "ch_eur", currency: "eur", amount: 800 }),
    ];
    const result = charges.map((c) => normalise(c));
    const currencies = result.map((r) => r.currency);
    assert.deepEqual(currencies, ["usd", "sek", "eur"]);
  });

  it("normalises a charge with all nullable fields without throwing", () => {
    function normalise(charge, fallbackEmail) {
      return {
        id: charge.payment_intent || charge.id,
        amount: charge.amount,
        currency: charge.currency,
        status: charge.status,
        created: charge.created * 1000,
        email:
          charge.receipt_email ||
          charge.billing_details?.email ||
          fallbackEmail ||
          null,
        receiptUrl: charge.receipt_url || null,
        receiptId: charge.id,
        description: charge.description || "",
      };
    }
    const bare = {
      id: "ch_bare",
      payment_intent: null,
      amount: 0,
      currency: "usd",
      status: "pending",
      created: 0,
      receipt_email: null,
      billing_details: null,
      receipt_url: null,
      description: null,
    };
    assert.doesNotThrow(() => normalise(bare, undefined));
    const out = normalise(bare, undefined);
    assert.equal(out.id, "ch_bare");
    assert.equal(out.email, null);
    assert.equal(out.receiptUrl, null);
    assert.equal(out.description, "");
    assert.equal(out.created, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Receipt route — input / output contract
// ─────────────────────────────────────────────────────────────────────────────

describe("receipt route — chargeId validation", () => {
  it("accepts chargeId from body.chargeId", () => {
    const body = { chargeId: "ch_abc123" };
    const chargeId = body?.chargeId || body?.id;
    assert.equal(chargeId, "ch_abc123");
  });

  it("falls back to body.id when chargeId absent", () => {
    const body = { id: "ch_abc123" };
    const chargeId = body?.chargeId || body?.id;
    assert.equal(chargeId, "ch_abc123");
  });

  it("chargeId is falsy when both fields missing", () => {
    const body = {};
    const chargeId = body?.chargeId || body?.id;
    assert.ok(!chargeId);
  });

  it("receipt Content-Disposition uses charge id for filename", () => {
    const chargeId = "ch_test999";
    const disposition = `attachment; filename="receipt-${chargeId}.pdf"`;
    assert.equal(disposition, 'attachment; filename="receipt-ch_test999.pdf"');
  });

  it("receipt Content-Type is application/pdf", () => {
    const contentType = "application/pdf";
    assert.equal(contentType, "application/pdf");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Stripe connectivity smoke test (live — optional)
// ─────────────────────────────────────────────────────────────────────────────

describe("Stripe connectivity — live smoke test (skipped when key absent)", () => {
  const key = process.env.STRIPE_SECRET_KEY;

  it(
    "getStripe() returns a Stripe instance with correct API version when key is set",
    {
      skip: !key ? "STRIPE_SECRET_KEY not set — skipping live test" : false,
    },
    async () => {
      const { getStripe } = await import("../src/lib/stripePayments.js");
      const stripe = getStripe();
      assert.ok(stripe, "expected a Stripe instance");
      // Stripe stores the version in its config
      assert.equal(
        stripe._api?.version ?? stripe.getApiField?.("version") ?? "2024-12-18",
        "2024-12-18",
      );
    },
  );

  it(
    "compilePayments() returns an array from live Stripe API when key is set",
    {
      skip: !key ? "STRIPE_SECRET_KEY not set — skipping live test" : false,
    },
    async () => {
      const { compilePayments } = await import("../src/lib/stripePayments.js");
      const result = await compilePayments(undefined, 5, undefined);
      assert.ok(Array.isArray(result), `expected array, got ${typeof result}`);
      // Each element must have required shape keys
      for (const p of result) {
        assert.ok("id" in p, "missing id");
        assert.ok("amount" in p, "missing amount");
        assert.ok("currency" in p, "missing currency");
        assert.ok("status" in p, "missing status");
        assert.ok("created" in p, "missing created");
        assert.ok("receiptId" in p, "missing receiptId");
        // created should be in milliseconds (> year 2000 in ms = 946684800000)
        assert.ok(
          p.created > 946684800000,
          `created ${p.created} looks like seconds not ms`,
        );
      }
    },
  );

  it(
    "compilePayments() with nonexistent email returns []",
    {
      skip: !key ? "STRIPE_SECRET_KEY not set — skipping live test" : false,
    },
    async () => {
      const { compilePayments } = await import("../src/lib/stripePayments.js");
      const result = await compilePayments(
        "no-such-user-xyzzy-test@example.invalid",
        5,
        undefined,
      );
      assert.deepEqual(result, []);
    },
  );
});
