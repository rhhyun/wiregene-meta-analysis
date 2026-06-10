import { NextResponse } from "next/server";
import { summarizeImportedRecords } from "@/lib/meta-analysis-records";

export const runtime = "nodejs";

type ImportRequest = {
  records?: unknown;
};

export async function POST(request: Request) {
  let payload: ImportRequest;

  try {
    payload = (await request.json()) as ImportRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof payload.records !== "string") {
    return NextResponse.json({ error: "records must be a string." }, { status: 400 });
  }

  return NextResponse.json({
    summary: summarizeImportedRecords(payload.records),
  });
}
