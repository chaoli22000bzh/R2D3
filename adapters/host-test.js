/* R2D3 Lot C - adaptateur d'essai, sans transport HTTP ni décision pédagogique. */
import { createEngine, restoreEngine } from "../src/r2d3-core.js";

const copy = value => JSON.parse(JSON.stringify(value));

/**
 * L'hôte possède le contexte de copie opaque, l'autorisation et le stockage.
 * Contrat de banc : load(copyKey) -> state|null ;
 * save(copyKey, savedState, expectedRevision) -> {ok:boolean, reason?:string}.
 */
export async function openHostedEngine({ scenario, host, copyKey }) {
  if (!host || typeof host.load !== "function" || typeof host.save !== "function")
    throw new TypeError("Hôte invalide");
  if (copyKey === undefined || copyKey === null)
    throw new TypeError("Contexte opaque absent");

  const stored = await host.load(copyKey);
  let engine = stored === null ? createEngine(scenario) : restoreEngine(scenario, stored);
  const listeners = new Set();
  let inflight = false;

  return {
    getSnapshot() { return engine.getSnapshot(); },
    exportState() { return engine.exportState(); },
    query(request) { return engine.query(request); },
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("Abonné invalide");
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async dispatch(command) {
      if (inflight) return {status:"rejected",code:"operation_in_progress",revision:engine.getSnapshot().revision};
      inflight = true;
      try {
        const before = engine.exportState();
        // Travail en instance provisoire : l'état observable ne change pas avant le succès du stockage.
        const candidate = restoreEngine(scenario, before);
        const result = candidate.dispatch(command);
        if (result.status !== "applied") return result;
        let saved;
        try {
          saved = await host.save(copyKey, candidate.exportState(), before.revision);
        } catch (error) {
          return {status:"failed",code:"save_failed",revision:before.revision,message:"Enregistrement non confirmé"};
        }
        if (!saved || saved.ok !== true)
          return {status:"failed",code:saved?.reason === "conflict"?"revision_conflict":"save_failed",revision:before.revision,message:"Enregistrement non confirmé"};
        engine = candidate;
        for (const listener of [...listeners]) {
          try { listener(result.revision); } catch (_) { /* Vue défaillante isolée */ }
        }
        return {...result,persisted:true};
      } finally {
        inflight = false;
      }
    }
  };
}

/**
 * Stockage intégralement en mémoire pour les tests. Ne remplace pas le stockage C².
 * La clé de copie n'est ni créée ni interprétée par R2D3.
 */
export function createMemoryTestHost() {
  const states = new Map();
  let failNext = false;
  return {
    async load(key) { return states.has(key) ? copy(states.get(key)) : null; },
    async save(key, state, expectedRevision) {
      if (failNext) { failNext=false; return {ok:false,reason:"write_failed"}; }
      const current = states.get(key);
      const currentRevision = current ? current.revision : 0;
      if (currentRevision !== expectedRevision) return {ok:false,reason:"conflict"};
      states.set(key,copy(state));
      return {ok:true};
    },
    failNextSave() { failNext=true; }
  };
}
