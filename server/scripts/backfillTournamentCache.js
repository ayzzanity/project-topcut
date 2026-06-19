const { supabaseAdmin } = require('../src/lib/supabase');
const { fetchTournament } = require('../src/services/challongeService');

async function main() {
  const forceAll = process.argv.includes('--all');
  const sources = await listSources({ forceAll });

  if (sources.length === 0) {
    console.log('No imported tournament sources need cache backfill.');
    return;
  }

  console.log(
    `${forceAll ? 'Refetching' : 'Backfilling'} ${sources.length} imported tournament source${sources.length === 1 ? '' : 's'}...`
  );

  let completed = 0;
  let failed = 0;

  for (const source of sources) {
    try {
      const tournament = await fetchTournament(source.challonge_url);
      await updateTournament(source.tournament_id, tournament);
      await updateSource(source.id, tournament);
      await upsertParticipants(source.tournament_id, source.id, tournament.participants);

      completed += 1;
      console.log(`OK ${source.name || tournament.name} (${tournament.participants.length} participants, ${tournament.matches.length} matches)`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${source.name || source.challonge_url}: ${error.message}`);
    }
  }

  console.log(`Done. ${completed} backfilled, ${failed} failed.`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

async function listSources({ forceAll = false } = {}) {
  const { data, error } = await supabaseAdmin
    .from('tournament_sources')
    .select('id, tournament_id, source_type, challonge_url, challonge_slug, name, raw_data')
    .order('imported_at', { ascending: true });

  if (error) throw error;

  return forceAll ? data || [] : (data || []).filter((source) => !source.raw_data?.snapshot);
}

async function updateTournament(tournamentId, tournament) {
  const { error } = await supabaseAdmin
    .from('tournaments')
    .update({
      name: tournament.name,
      challonge_started_at: tournament.startedAt || null,
      challonge_completed_at: tournament.completedAt || null,
      event_date: dateFromTimestamp(tournament.startedAt)
    })
    .eq('id', tournamentId);

  if (error) throw error;
}

async function updateSource(sourceId, tournament) {
  const snapshot = tournamentSnapshot(tournament);
  const { error } = await supabaseAdmin
    .from('tournament_sources')
    .update({
      challonge_tournament_id: Number(tournament.id),
      challonge_url: tournament.url,
      challonge_slug: tournament.slug,
      name: tournament.name,
      tournament_type: tournament.tournamentType,
      raw_data: {
        raw: tournament.raw || {},
        snapshot
      }
    })
    .eq('id', sourceId);

  if (error) throw error;
}

async function upsertParticipants(tournamentId, sourceId, participants) {
  if (!participants?.length) return;

  const rows = participants.map((participant) => ({
    tournament_id: tournamentId,
    source_id: sourceId,
    challonge_participant_id: Number(participant.id),
    name: participant.name,
    seed: participant.seed || null,
    final_rank: participant.final_rank || null,
    raw_data: participant
  }));

  const { error } = await supabaseAdmin
    .from('tournament_participants')
    .upsert(rows, { onConflict: 'source_id,challonge_participant_id' });

  if (error) throw error;
}

function tournamentSnapshot(tournament) {
  return {
    ...tournament,
    raw: tournament.raw || {},
    cacheSavedAt: new Date().toISOString()
  };
}

function dateFromTimestamp(value) {
  if (!value) return null;

  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
