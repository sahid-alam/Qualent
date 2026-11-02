"use client";

import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import Link from "next/link";
import { useId, useOptimistic, useState, useTransition } from "react";
import { moveStageAction } from "../app/c/[tenantId]/actions";
import { ArrowRightLeft } from "lucide-react";
import { Avatar, Banner, cx, LinkButton, ScorePill } from "./ui";

export type BoardStage = { id: string; name: string; kind: string };
export type BoardCard = { id: string; stageId: string; name: string; temperature: string | null; score: number | null; delivered: boolean; owner: string | null };

function Card({ card, stages, tenantId, onMove }: { card: BoardCard; stages: BoardStage[]; tenantId: string; onMove: (leadId: string, stageId: string) => void }) {
  const { listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id });
  return (
    <li
      ref={setNodeRef}
      {...listeners}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      className={cx("flex cursor-grab items-center gap-2.5 rounded-row border border-line bg-panel p-3.5 transition-colors duration-(--dur-fast) hover:border-line-hover", isDragging && "relative z-10 shadow-pop")}
    >
      <Avatar name={card.name} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.75">
          <Link href={`/c/${tenantId}/leads/${card.id}`} draggable={false} className="min-w-0 truncate text-sm font-semibold hover:underline">{card.name}</Link>
          <ScorePill temperature={card.temperature} score={card.score} />
        </span>
        <span className="block truncate text-2xs text-fg-muted">{card.owner ?? "No owner"}</span>
      </span>
      {/* The keyboard and touch way to move: a native dropdown behind a small icon. */}
      <label title="Move to another stage" className="relative grid size-7 shrink-0 cursor-pointer place-items-center rounded-control text-fg-muted hover:bg-hover hover:text-fg has-focus-visible:outline-2 has-focus-visible:outline-ring pointer-coarse:size-11">
        <ArrowRightLeft size={14} aria-hidden />
        <span className="sr-only">Move {card.name} to</span>
        <select
          value=""
          onChange={(event) => onMove(card.id, event.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          <option value="" disabled className="bg-panel">Move to…</option>
          {stages.filter((stage) => stage.id !== card.stageId).map((stage) => (
            <option key={stage.id} value={stage.id} className="bg-panel">{stage.name}</option>
          ))}
        </select>
      </label>
    </li>
  );
}

function Column({ stage, cards, stages, tenantId, onMove }: { stage: BoardStage; cards: BoardCard[]; stages: BoardStage[]; tenantId: string; onMove: (leadId: string, stageId: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <section ref={setNodeRef} aria-label={stage.name} className={cx("grid w-70 shrink-0 content-start gap-2 rounded-panel border border-line bg-card p-2.5", isOver && "outline-2 outline-accent")}>
      <header className="flex items-center justify-between px-1.5 pt-1">
        <h2 className="text-2xs font-medium tracking-label text-fg-muted uppercase">{stage.name}</h2>
        <span className="text-2xs text-fg-muted tabular-nums">{cards.length}</span>
      </header>
      <ul className="grid gap-2">
        {cards.map((card) => (
          <Card key={card.id} card={card} stages={stages} tenantId={tenantId} onMove={onMove} />
        ))}
      </ul>
    </section>
  );
}

export function Board({ tenantId, stages, cards }: { tenantId: string; stages: BoardStage[]; cards: BoardCard[] }) {
  const id = useId();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [justQualified, setJustQualified] = useState<BoardCard | null>(null);
  const [optimistic, applyMove] = useOptimistic(cards, (current, move: { leadId: string; stageId: string }) =>
    current.map((card) => (card.id === move.leadId ? { ...card, stageId: move.stageId } : card)),
  );

  function move(leadId: string, stageId: string) {
    const card = optimistic.find((item) => item.id === leadId);
    if (!card || card.stageId === stageId) return;
    setError(null);
    startTransition(async () => {
      applyMove({ leadId, stageId });
      const form = new FormData();
      form.set("tenantId", tenantId);
      form.set("leadId", leadId);
      form.set("stageId", stageId);
      const result = await moveStageAction(null, form);
      if (result.error) return setError(result.error);
      const target = stages.find((stage) => stage.id === stageId);
      setJustQualified(target?.kind === "qualified" && !card.delivered ? card : null);
    });
  }

  function onDragEnd(event: DragEndEvent) {
    if (event.over) move(String(event.active.id), String(event.over.id));
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <p role="status" aria-live="polite" className="text-sm text-bad empty:hidden">{error}</p>
      {justQualified && (
        <Banner
          tone="accent"
          action={<LinkButton size="sm" variant="primary" href={`/c/${tenantId}/leads/${justQualified.id}#deliver`}>Send to client&apos;s agent</LinkButton>}
        >
          {justQualified.name} is qualified. Ready to send to the client&apos;s agent?
        </Banner>
      )}
      <div aria-busy={pending} className="relative flex items-start gap-2.5 overflow-x-auto pb-2">
        <DndContext id={id} sensors={sensors} onDragEnd={onDragEnd}>
          {stages.map((stage) => (
            <Column key={stage.id} stage={stage} stages={stages} tenantId={tenantId} onMove={move} cards={optimistic.filter((card) => card.stageId === stage.id)} />
          ))}
        </DndContext>
      </div>
    </div>
  );
}
