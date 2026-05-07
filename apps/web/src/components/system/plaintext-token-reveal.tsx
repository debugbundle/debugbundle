import { CopyIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "../ui/button.js";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card.js";

export interface PlaintextTokenRevealProps {
  value: string;
  title?: string;
  description?: string;
  regionLabel?: string;
  copyLabel?: string;
}

export function PlaintextTokenReveal({
  value,
  title = "New token secret",
  description = "This plaintext token is shown once. Copy it into your CLI or automation secret store now.",
  regionLabel = "New token secret",
  copyLabel = "Copy secret"
}: PlaintextTokenRevealProps): JSX.Element {
  const [copied, setCopied] = useState(false);

  async function handleCopy(): Promise<void> {
    if (typeof navigator === "undefined" || navigator.clipboard === undefined) {
      toast.error("Clipboard is not available in this browser.");
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Secret copied.");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy secret.");
    }
  }

  return (
    <Card role="region" aria-label={regionLabel} className="border-primary/20 bg-primary/8">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{description}</p>
        <div className="flex flex-col gap-3 rounded-md border border-border bg-background/80 p-4 lg:flex-row lg:items-center lg:justify-between">
          <code className="overflow-x-auto font-mono text-sm text-foreground">{value}</code>
          <Button type="button" variant="outline" size="sm" onClick={() => void handleCopy()}>
            <CopyIcon data-icon="inline-start" />
            {copied ? "Copied" : copyLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}