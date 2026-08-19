import { describe, expect, it } from "vitest";
import { renumber, validateFullOrder } from "../src/utils/ordering";

/** Records every write so the two-pass behaviour is visible to the test. */
const recorder = () => {
  const writes: [string, number][] = [];
  return {
    writes,
    setPosition: async (id: string, position: number) => {
      writes.push([id, position]);
    },
  };
};

describe("renumber", () => {
  it("lands every row on its index in the given order", async () => {
    const { writes, setPosition } = recorder();
    await renumber(setPosition, ["b", "c", "a"]);

    const final = writes.slice(3);
    expect(final).toEqual([
      ["b", 0],
      ["c", 1],
      ["a", 2],
    ]);
  });

  it("parks rows out of range first, so no two rows share a position", async () => {
    const { writes, setPosition } = recorder();
    await renumber(setPosition, ["b", "c", "a"]);

    const parked = writes.slice(0, 3);
    expect(parked.map(([, position]) => position)).toEqual([10000, 10001, 10002]);

    // At no point does a write reuse a position that is still occupied.
    const seen = new Map<string, number>();
    for (const [id, position] of writes) {
      for (const [otherId, otherPosition] of seen) {
        if (otherId !== id) expect(otherPosition).not.toBe(position);
      }
      seen.set(id, position);
    }
  });

  it("does nothing for an empty list", async () => {
    const { writes, setPosition } = recorder();
    await renumber(setPosition, []);
    expect(writes).toEqual([]);
  });
});

describe("validateFullOrder", () => {
  it("accepts a complete permutation", () => {
    expect(validateFullOrder(["b", "a"], ["a", "b"])).toEqual({ ok: true });
  });

  it("rejects a repeated id", () => {
    expect(validateFullOrder(["a", "a"], ["a", "b"])).toEqual({ ok: false, reason: "duplicate" });
  });

  it("rejects a partial order", () => {
    expect(validateFullOrder(["a"], ["a", "b"])).toEqual({ ok: false, reason: "mismatch" });
  });

  it("rejects an id that belongs to something else", () => {
    expect(validateFullOrder(["a", "z"], ["a", "b"])).toEqual({ ok: false, reason: "mismatch" });
  });
});
