"use client";
import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Download, FileUp, XCircle } from "lucide-react";
import { ASSET_CLASSES, ASSET_IMPORT_COLUMNS, ASSET_IMPORT_MAX_ROWS, csvToRecords, toCsv } from "@hvems/domain";
import type { ImportResult } from "@hvems/types";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form";
import { Card, CardBody, CardHeader, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { importAssetsAction } from "../actions";

function downloadTemplate() {
  const csv = toCsv([
    [...ASSET_IMPORT_COLUMNS],
    ["EQ-1001", "excavator", "Caterpillar", "336F", "2019", "", "", "", "CAT0336FJBN12345", "own", "", "Caboolture Depot", "hours", "", "8250", "", ""],
    ["PM-2001", "prime_mover", "Kenworth", "T909", "2021", "123ABC", "QLD", "6F4T909ZXMA123456", "", "own", "", "", "kilometres", "412000", "", "", ""],
  ]);
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "hvems-asset-import-template.csv" });
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportWizard({ orgId }: { orgId: string }) {
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<Record<string, string>[]>([]);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [busy, setBusy] = React.useState<"trial" | "import" | null>(null);

  async function onFile(file: File | undefined) {
    setResult(null);
    setProblem(null);
    if (!file) return;
    setFileName(file.name);
    const { headers, records } = csvToRecords(await file.text());
    const missing = ["asset_number", "asset_class"].filter((h) => !headers.includes(h));
    if (missing.length) return setProblem(`The file is missing required columns: ${missing.join(", ")}. Download the template for the expected layout.`);
    if (records.length > ASSET_IMPORT_MAX_ROWS) return setProblem(`The file has ${records.length} rows. Split it into files of up to ${ASSET_IMPORT_MAX_ROWS} rows.`);
    setRows(records);
  }

  async function run(dryRun: boolean) {
    setBusy(dryRun ? "trial" : "import");
    setProblem(null);
    const res = await importAssetsAction(orgId, rows, dryRun);
    setBusy(null);
    if (res.status === "error") return setProblem(res.message);
    if (res.status === "success" && res.data) setResult(res.data);
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader
          title="1. Prepare your file"
          description="Use the standard template. Class codes and values are listed below."
          action={
            <Button variant="secondary" size="sm" onClick={downloadTemplate}>
              <Download /> Template
            </Button>
          }
        />
        <CardBody className="text-[13px] text-ink-muted">
          <p>
            <strong>asset_class</strong>: {ASSET_CLASSES.map((c) => c.code).join(", ")}. <strong>owner_type</strong>: own, client_owned, hired_in.{" "}
            <strong>meter_type</strong>: none, kilometres, hours, both. <strong>client</strong> and <strong>site</strong> must match existing names.
            Provide <strong>duplicate_reason</strong> when a VIN, serial or registration is already used.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="2. Choose the file and run a trial" />
        <CardBody className="flex flex-col gap-4">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[10px] border-2 border-dashed border-stroke px-4 py-8 text-center hover:border-brand">
            <FileUp className="size-7 text-brand" aria-hidden />
            <span className="text-[14px] font-medium text-ink">{fileName ?? "Choose a CSV file"}</span>
            <span className="text-[12.5px] text-ink-subtle">{rows.length ? `${rows.length} rows ready` : "Up to 1,000 rows"}</span>
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
          </label>
          {problem ? <FormAlert>{problem}</FormAlert> : null}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void run(true)} disabled={!rows.length || busy !== null}>
              {busy === "trial" ? "Checking…" : "Run trial"}
            </Button>
            {result?.dry_run && result.valid ? (
              <Button variant="outline" onClick={() => void run(false)} disabled={busy !== null}>
                {busy === "import" ? "Importing…" : `Import ${result.row_count} assets`}
              </Button>
            ) : null}
          </div>
        </CardBody>
      </Card>

      {result ? (
        <Card>
          <CardHeader title="3. Results" />
          <CardBody>
            {!result.dry_run && result.created > 0 ? (
              <div className="flex items-center gap-3 rounded-[10px] border border-ok/30 bg-[#e8f7e7] p-4">
                <CheckCircle2 className="size-6 text-[#0a7a00]" />
                <div>
                  <p className="font-semibold text-[#0a6b00]">{result.created} assets imported</p>
                  <Link href={`/customer/${orgId}/equipment`} className="text-[14px] text-link hover:underline">
                    View equipment register
                  </Link>
                </div>
              </div>
            ) : result.valid ? (
              <FormAlert tone="success">All {result.row_count} rows passed the trial. Nothing has been saved yet.</FormAlert>
            ) : (
              <>
                <div className="mb-3 flex items-center gap-2 text-[14px] font-semibold text-danger">
                  <XCircle className="size-5" /> {result.errors.length} problem(s) found. Nothing has been saved.
                </div>
                <Table>
                  <THead>
                    <tr>
                      <TH>Row</TH>
                      <TH>Column</TH>
                      <TH>Problem</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {result.errors.map((e, i) => (
                      <TR key={i}>
                        <TD>{e.row ?? "File"}</TD>
                        <TD className="font-mono text-[12px]">{e.field ?? "—"}</TD>
                        <TD>{e.message}</TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </>
            )}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
