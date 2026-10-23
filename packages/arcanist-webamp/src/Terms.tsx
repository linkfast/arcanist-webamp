import { useEffect, useState } from "react";
import { ArcanistMark } from "./desktop/Taskbar";
import { language, t } from "./i18n";
import { Button, Checkbox } from "./ui/ui";

interface LegalSection {
  id: string;
  title: string;
  paragraphs: string[];
}

/** The server's terms and disclaimer for its users (`GET /rest/v1/legal/terms?audience=USER`). */
export interface LegalTerms {
  version: string;
  title: string;
  sections: LegalSection[];
  disclaimerTitle: string;
  disclaimer: LegalSection[];
  accept: string;
  issuesUrl: string;
}

const storageKey = "arcanist.terms";

export async function loadTerms(): Promise<LegalTerms | null> {
  try {
    const response = await fetch(`/rest/v1/legal/terms?audience=USER&language=${language}`);
    return response.ok ? ((await response.json()) as LegalTerms) : null;
  } catch {
    return null;
  }
}

/** Whether this browser accepted this version of the terms (kept in the browser, not on the server). */
export function termsAccepted(terms: LegalTerms): boolean {
  try {
    return localStorage.getItem(storageKey) === terms.version;
  } catch {
    return false;
  }
}

function remember(terms: LegalTerms): void {
  try {
    localStorage.setItem(storageKey, terms.version);
  } catch {
    // Without storage it is asked again next time.
  }
}

/** A paragraph with the issues address as a link. */
function Paragraph({ text, url }: { text: string; url: string }) {
  const index = url ? text.indexOf(url) : -1;
  if (index < 0) return <p className="text-muted-foreground">{text}</p>;
  return (
    <p className="text-muted-foreground">
      {text.slice(0, index)}
      <a className="break-all underline" href={url} target="_blank" rel="noopener noreferrer">
        {url}
      </a>
      {text.slice(index + url.length)}
    </p>
  );
}

/**
 * The first time a user enters (and whenever the terms change): the terms and the disclaimer, which must be accepted
 * to use the player. It stays open until they are.
 */
export function TermsGate({ terms, onAccepted }: { terms: LegalTerms; onAccepted: () => void }) {
  const [checked, setChecked] = useState(false);
  useEffect(() => setChecked(false), [terms.version]);

  return (
    <div className="ui fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="terms-title">
      <div className="grid max-h-[calc(100dvh-2rem)] w-full max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto] gap-4 rounded-xl border bg-[var(--card)] p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <ArcanistMark className="size-8" />
          <h1 id="terms-title" className="text-lg font-semibold">
            {terms.title}
          </h1>
        </div>
        <div className="grid gap-4 overflow-y-auto rounded-lg border p-4 text-sm">
          {terms.sections.map((section) => (
            <section key={section.id} className="grid gap-1">
              <h2 className="font-medium">{section.title}</h2>
              {section.paragraphs.map((p, i) => (
                <Paragraph key={i} text={p} url={terms.issuesUrl} />
              ))}
            </section>
          ))}
          <h2 className="border-t pt-4 font-semibold">{terms.disclaimerTitle}</h2>
          {terms.disclaimer.map((section) => (
            <section key={section.id} className="grid gap-1">
              <h3 className="font-medium">{section.title}</h3>
              {section.paragraphs.map((p, i) => (
                <Paragraph key={i} text={p} url={terms.issuesUrl} />
              ))}
            </section>
          ))}
        </div>
        <div className="grid gap-3">
          <Checkbox checked={checked} onChange={setChecked} label={terms.accept} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <a className="text-xs text-muted-foreground underline" href={terms.issuesUrl} target="_blank" rel="noopener noreferrer">
              {t("terms.issues")}
            </a>
            <Button
              disabled={!checked}
              onClick={() => {
                remember(terms);
                onAccepted();
              }}
            >
              {t("terms.accept")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
