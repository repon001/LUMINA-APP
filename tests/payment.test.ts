import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  fromMinorUnits,
  isZeroDecimalCurrency,
  toMinorUnits,
} from "../src/modules/payment/payment.provider";
import { verifyStripeSignature } from "../src/modules/payment/providers/stripe";
import { createCheckoutSchema } from "../src/modules/payment/payment.validation";

describe("minor units", () => {
  it("converts a decimal currency to cents", () => {
    expect(toMinorUnits("10.00", "USD")).toBe(1000);
    expect(toMinorUnits("12.50", "usd")).toBe(1250);
    expect(toMinorUnits("0.99", "EUR")).toBe(99);
  });

  it("leaves a zero-decimal currency alone", () => {
    // 1000 JPY is 1000, not 100000. Getting this wrong charges 100x.
    expect(toMinorUnits("1000.00", "JPY")).toBe(1000);
    expect(toMinorUnits("4500.00", "jpy")).toBe(4500);
    expect(isZeroDecimalCurrency("KRW")).toBe(true);
    expect(isZeroDecimalCurrency("USD")).toBe(false);
  });

  it("rounds rather than truncating a fractional cent", () => {
    expect(toMinorUnits("10.005", "USD")).toBe(1001);
  });

  it("round-trips back to the decimal string", () => {
    expect(fromMinorUnits(1250, "USD")).toBe("12.50");
    expect(fromMinorUnits(1000, "JPY")).toBe("1000.00");
  });

  it("refuses a value that is not a number", () => {
    expect(() => toMinorUnits("free", "USD")).toThrowError(/not a number/);
  });
});

describe("verifyStripeSignature", () => {
  const secret = "whsec_test_secret";
  const body = Buffer.from(JSON.stringify({ id: "evt_1", type: "checkout.session.completed" }));
  const now = 1_760_000_000;

  const sign = (timestamp: number, payload: Buffer, withSecret = secret) =>
    `t=${timestamp},v1=${createHmac("sha256", withSecret)
      .update(`${timestamp}.${payload.toString("utf8")}`)
      .digest("hex")}`;

  it("accepts a signature this secret produced", () => {
    expect(verifyStripeSignature(body, sign(now, body), secret, now)).toBe(true);
  });

  it("rejects a body that changed after signing", () => {
    const tampered = Buffer.from(JSON.stringify({ id: "evt_1", type: "payout.paid" }));
    expect(verifyStripeSignature(tampered, sign(now, body), secret, now)).toBe(false);
  });

  it("rejects a signature made with another secret", () => {
    expect(verifyStripeSignature(body, sign(now, body, "whsec_other"), secret, now)).toBe(false);
  });

  it("rejects a replay from outside the tolerance window", () => {
    const old = now - 600;
    expect(verifyStripeSignature(body, sign(old, body), secret, now)).toBe(false);
    // Just inside five minutes is still fine.
    expect(verifyStripeSignature(body, sign(now - 299, body), secret, now)).toBe(true);
  });

  it("rejects a malformed header instead of throwing", () => {
    for (const header of ["", "nonsense", "t=abc,v1=def", "v1=onlysignature"]) {
      expect(verifyStripeSignature(body, header, secret, now)).toBe(false);
    }
  });
});

describe("createCheckoutSchema", () => {
  const valid = {
    provider: "STRIPE",
    amount: 220,
    currencyCode: "usd",
    description: "Park Hyatt, 2 nights",
  };

  it("normalises amount and currency", () => {
    const parsed = createCheckoutSchema.parse(valid);
    expect(parsed.amount).toBe("220.00");
    expect(parsed.currencyCode).toBe("USD");
  });

  it("refuses a zero or negative charge", () => {
    expect(createCheckoutSchema.safeParse({ ...valid, amount: 0 }).success).toBe(false);
    expect(createCheckoutSchema.safeParse({ ...valid, amount: -1 }).success).toBe(false);
  });

  it("only accepts a known provider", () => {
    expect(createCheckoutSchema.safeParse({ ...valid, provider: "PAYPAL" }).success).toBe(false);
    expect(createCheckoutSchema.safeParse({ ...valid, provider: "SSLCOMMERZ" }).success).toBe(true);
  });

  it("requires a description, which is what the customer sees", () => {
    expect(createCheckoutSchema.safeParse({ ...valid, description: "" }).success).toBe(false);
  });
});
