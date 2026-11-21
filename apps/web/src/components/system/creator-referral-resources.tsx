import { DownloadIcon } from "lucide-react";
import { resolveDocumentationUrl } from "../../lib/external-links.js";
import { Button } from "../ui/button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "../ui/card.js";
import { ReadOnlyCopyInput } from "./read-only-copy-input.js";

export function CreatorReferralResources(): JSX.Element {
  const docs = resolveDocumentationUrl();
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Creator starter kit</CardTitle>
          <CardDescription>
            DebugBundle artwork, a sample incident bundle, and a short guide.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ReadOnlyCopyInput
            id="creator-caption"
            label="Sample caption"
            copyLabel="Copy sample caption"
            value="Here’s how I use DebugBundle to give my coding agent the context behind an incident. Try it with my referral link [your referral link]."
          />
          <ReadOnlyCopyInput
            id="creator-disclosure"
            label="Affiliate disclosure"
            copyLabel="Copy affiliate disclosure"
            value="I may earn a commission if you purchase through my referral link."
          />
        </CardContent>
        <CardFooter className="bg-transparent">
          <Button asChild>
            <a href={`${import.meta.env.BASE_URL}creator-kit.zip`} download>
              <DownloadIcon aria-hidden="true" data-icon="inline-start" /> Download kit
            </a>
          </Button>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Ideas for your first post</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul className="flex list-disc flex-col gap-3 pl-5 text-sm">
            <li>
              <strong>Walk through a checkout incident.</strong> Read the timeline and follow the
              evidence to a likely cause.
            </li>
            <li>
              <strong>Show an agent using a bundle.</strong> Ask your coding agent to summarise the
              failure and suggest what to inspect next.
            </li>
            <li>
              <strong>Record a local-first setup.</strong> Capture a test exception and inspect the
              bundle before connecting a hosted project.
            </li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <a
                href={new URL("/demos/checkout.bundle.json", docs).href}
                target="_blank"
                rel="noreferrer"
              >
                Inspect the sample bundle
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={new URL("/docs/mcp/workflows/", docs).href} target="_blank" rel="noreferrer">
                Agent workflows
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
