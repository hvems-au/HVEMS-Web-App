import { describe, expect, it } from "vitest";
import { csvToRecords, parseCsv, toCsv } from "./csv";

describe("CSV", () => {
  it("parses quoted fields, escaped quotes and CRLF", () => {
    expect(parseCsv('a,b,c\r\n"1, x","say ""hi""",3\r\n')).toEqual([
      ["a", "b", "c"],
      ["1, x", 'say "hi"', "3"],
    ]);
  });
  it("strips a BOM and skips blank lines", () => {
    expect(parseCsv("﻿a,b\n\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
  it("keeps newlines inside quotes", () => {
    expect(parseCsv('n\n"line1\nline2"')).toEqual([["n"], ["line1\nline2"]]);
  });
  it("maps headers to normalised keys and drops empty cells", () => {
    expect(csvToRecords("Asset Number,Asset Class,Make\nEX-1,excavator,\n").records).toEqual([{ asset_number: "EX-1", asset_class: "excavator" }]);
  });
  it("round-trips through toCsv", () => {
    const rows = [["a", 'q"uote', "c,d"], ["1", "", "x\ny"]];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});
