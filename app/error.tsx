"use client";

import { Button, Empty } from "../components/ui";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <Empty title="This page didn't load" body="Nothing was lost. Try again, and if it keeps happening, tell your manager.">
        <Button onClick={reset}>Try again</Button>
      </Empty>
    </main>
  );
}
