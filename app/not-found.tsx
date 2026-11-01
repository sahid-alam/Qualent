import { Empty, LinkButton } from "../components/ui";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <Empty title="This page doesn't exist" body="The link may be old, or this lead may have been erased.">
        <LinkButton href="/">Go to your clients</LinkButton>
      </Empty>
    </main>
  );
}
