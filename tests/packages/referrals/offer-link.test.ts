import { expect, it } from "vitest";
import { createOfferLinkCodec } from "../../../packages/referrals/src/offer-link.js";

it("signs a branded public hint without making it an eligibility or authentication proof", () => {
  const codec = createOfferLinkCodec("offer-cookie-secret-longer-than-thirty-two-characters");
  const issued = codec.issue("OWEN20", 1000);
  expect(issued).toContain("HttpOnly; SameSite=Lax; Secure");
  expect(issued).not.toContain("Domain=");
  expect(codec.read(issued, 1001)).toEqual({ code: "OWEN20", expires_at: 1000 + 30 * 86400_000 });
  expect(codec.read(issued, 1000 + 30 * 86400_000)).toBeNull();
  expect(codec.read(issued.replace("dbundle_offer=", "dbundle_offer=x"), 1001)).toBeNull();
  expect(
    createOfferLinkCodec("different-secret-longer-than-thirty-two-characters").read(issued, 1001)
  ).toBeNull();
  expect(codec.read(codec.clear(), 1001)).toBeNull();
});
