import { expect, test } from "vitest";
import { findPhysicalClasses } from "../scripts/check-physical-css.mjs";

test("flags physical classes, including with variants", () => {
  expect(findPhysicalClasses('className="ml-2 md:pr-4 -mr-1 text-left border-l"')).toEqual([
    "ml-2",
    "pr-4",
    "mr-1",
    "text-left",
    "border-l",
  ]);
});

test("allows logical classes and unrelated words", () => {
  expect(
    findPhysicalClasses('className="ms-2 pe-4 text-start border-s border-line rounded-row html-left"'),
  ).toEqual([]);
});
