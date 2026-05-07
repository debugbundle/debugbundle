import { NextResponse } from "next/server";

import { debugbundle } from "../../../lib/debugbundle-server";

export async function GET() {
  const error = new Error("Next.js server example failure");

  await debugbundle.captureException(error, {
    tags: { example: "nextjs-basic-server" }
  });

  return NextResponse.json(
    {
      ok: false,
      message: error.message
    },
    { status: 500 }
  );
}