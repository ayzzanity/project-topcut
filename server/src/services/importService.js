const { supabaseAdmin } = require('../lib/supabase');
const { fetchTournament, parseChallongeIdentifier } = require('./challongeService');
const { fetchGroupStandings } = require('./challongeStandingsService');
const { POINTS, calculatePoints, classifyMatchForParticipant } = require('./scoringService');
const { flagsForPreview } = require('./reviewFlagService');
const { AppError } = require('../utils/errors');

async function previewImport({ mainLink, topCutLink, mainParticipantId, userId = null }) {
  const main = await fetchTournamentWithCache(mainLink, { sourceType: 'main', userId });
  const topCut = topCutLink
    ? await fetchTournamentWithCache(topCutLink, {
        sourceType: 'top_cut',
        userId,
        tournamentId: main.cache?.tournamentId || null
      })
    : null;
  const participantId = Number(mainParticipantId);
  const participant = main.participants.find((item) => Number(item.id) === participantId);

  if (!participant) {
    throw new AppError(404, 'participant_not_found', 'The selected participant was not found in the main Challonge source.');
  }

  const duplicate = await findDuplicate(main.id, participantId);
  if (duplicate) {
    throw new AppError(409, 'duplicate_claim', 'This Challonge participant has already been claimed.', {
      recordId: duplicate.id,
      status: duplicate.status
    });
  }

  const mainHasEmbeddedFinalStage = !topCut && hasEmbeddedFinalStage(main);
  const mainParticipantIds = participantIdsForMatches(participant);
  const matchSummaries = main.matches
    .map((match) => summarizeMatch(match, mainParticipantIds, determineMatchStage(match, mainHasEmbeddedFinalStage), main.id))
    .filter(Boolean);

  const standings = await fetchGroupStandings(main.slug);
  const standingsRow = standings ? findStandingsRow(standings, participant.name) : null;
  const swissRecord = inferSwissRecord(participant, matchSummaries, standingsRow);
  const swissWins = swissRecord.wins;
  const topCutParticipant = topCut ? findTopCutParticipant(topCut.participants, participant) : null;
  const embeddedTopCutEntry = mainHasEmbeddedFinalStage && matchSummaries.some((item) => item.stage === 'top_cut');
  const standingsTopCutEntry = Boolean(standingsRow?.qualifiedForTopCut);
  const topCutEntry = Boolean(topCutParticipant) || embeddedTopCutEntry || standingsTopCutEntry;
  const topCutMatches = topCutParticipant
    ? topCut.matches.map((match) => summarizeMatch(match, Number(topCutParticipant.id), 'top_cut', topCut.id)).filter(Boolean)
    : [];

  const finalPlacement = inferFinalPlacement(topCutParticipant || participant);
  const swissKingStatus = inferSwissKingStatus(main.participants, participant, standingsRow, main.matches);
  const isSwissKing = swissKingStatus === 'confirmed';
  const participantNamesByTournament = new Map([
    [Number(main.id), participantNameMap(main.participants)],
    ...(topCut ? [[Number(topCut.id), participantNameMap(topCut.participants)]] : [])
  ]);
  const combinedMatches = [...matchSummaries, ...topCutMatches].map((match) => ({
    ...match,
    opponentName:
      participantNamesByTournament
        .get(Number(match.sourceChallongeTournamentId))
        ?.get(Number(match.opponentChallongeParticipantId))
      || (match.opponentChallongeParticipantId
        ? `Participant #${match.opponentChallongeParticipantId}`
        : 'Unknown opponent'),
    score: scoreFromPlayerPerspective(match)
  }));

  const preview = {
    main: sourceSummary(main),
    topCut: topCut ? sourceSummary(topCut) : null,
    hasSeparateTopCut: Boolean(topCut),
    selectedParticipant: {
      challongeParticipantId: participantId,
      name: participant.name,
      seed: participant.seed,
      finalRank: participant.final_rank
    },
    topCutParticipant: topCutParticipant ? {
      challongeParticipantId: Number(topCutParticipant.id),
      name: topCutParticipant.name,
      finalRank: topCutParticipant.final_rank
    } : null,
    standingsRow,
    swissRecord,
    swissWins,
    topCutEntry,
    isSwissKing,
    swissKingStatus,
    finalPlacement,
    validWins: swissWins + combinedMatches.filter((item) => item.stage === 'top_cut' && item.result === 'win').length,
    totalPoints: calculatePoints({ swissWins, topCutEntry, isSwissKing, finalPlacement }),
    pointBreakdown: buildPointBreakdown({ swissWins, topCutEntry, isSwissKing, finalPlacement }),
    matchSummaries: combinedMatches
  };

  preview.reviewFlags = flagsForPreview(preview);
  return preview;
}

async function getParticipantsForDropdown(mainLink, userId) {
  const main = await fetchTournamentWithCache(mainLink, { sourceType: 'main', userId });
  const claimed = await claimsForTournament(main.id);
  const userImportedParticipantCount = [...claimed.values()]
    .filter((claim) => claim.user_id === userId)
    .length;

  return {
    source: sourceSummary(main),
    alreadyImportedByUser: userImportedParticipantCount > 0,
    userImportedParticipantCount,
    participants: main.participants.map((participant) => {
      const claim = claimed.get(Number(participant.id));
      return {
        challongeParticipantId: Number(participant.id),
        name: participant.name,
        seed: participant.seed,
        finalRank: participant.final_rank,
        claimed: Boolean(claim),
        disabled: Boolean(claim),
        claimedBy: claim?.user_id || null
      };
    })
  };
}

async function listImportedTournamentSources() {
  const { data, error } = await supabaseAdmin
    .from('tournament_sources')
    .select('id, tournament_id, source_type, challonge_url, challonge_slug, name, tournament_type, imported_at, raw_data, tournaments(id, name, event_date, status)')
    .order('imported_at', { ascending: false });

  if (error) throw error;

  const sourceIds = data.map((source) => source.id);
  const participantCountsBySource = new Map();
  const topCutLinksBySource = new Map();

  if (sourceIds.length) {
    const { data: participantRows, error: participantsError } = await supabaseAdmin
      .from('tournament_participants')
      .select('source_id')
      .in('source_id', sourceIds);

    if (participantsError) throw participantsError;

    for (const participant of participantRows) {
      participantCountsBySource.set(participant.source_id, (participantCountsBySource.get(participant.source_id) || 0) + 1);
    }

    const { data: recordRows, error: recordRowsError } = await supabaseAdmin
      .from('player_tournament_records')
      .select('main_source_id, top_cut_source_id')
      .in('main_source_id', sourceIds)
      .not('top_cut_source_id', 'is', null);

    if (recordRowsError) throw recordRowsError;

    for (const record of recordRows) {
      topCutLinksBySource.set(record.top_cut_source_id, record.main_source_id);
    }
  }

  return data.map((source) => ({
    id: source.id,
    tournamentId: source.tournament_id,
    sourceType: source.source_type,
    challongeUrl: source.challonge_url,
    challongeSlug: source.challonge_slug,
    sourceName: source.name,
    tournamentType: source.tournament_type,
    linkedMainSourceId: topCutLinksBySource.get(source.id) || null,
    participantCount: participantCountsBySource.get(source.id) || participantCountFromSourceSnapshot(source),
    tournamentName: source.tournaments?.name || source.name || 'Imported tournament',
    tournamentDate: source.tournaments?.event_date || null,
    tournamentStatus: source.tournaments?.status || null,
    importedAt: source.imported_at
  }));
}

async function getImportedTournamentDetails(sourceId) {
  const requestedSource = await getTournamentSourceById(sourceId);
  if (!requestedSource) {
    throw new AppError(404, 'tournament_source_not_found', 'Tournament source was not found.');
  }

  const mainSource = await resolveMainSourceForDetails(requestedSource);
  const topCutSource = await findLinkedTopCutSourceForMain(mainSource);
  const [mainParticipants, mainMatches, topCutParticipants, topCutMatches] = await Promise.all([
    participantsForSource(mainSource),
    matchesForSource(mainSource),
    topCutSource ? participantsForSource(topCutSource) : [],
    topCutSource ? matchesForSource(topCutSource) : []
  ]);
  const claimedProfiles = await profilesForClaimedParticipants(mainParticipants);
  const embeddedTopCutMatches = topCutSource ? [] : embeddedTopCutMatchesForSource(mainSource, mainMatches);
  const topCutDetail = topCutSource
      ? {
        ...sourceDetail(topCutSource, topCutParticipants, topCutMatches),
        bracket: bracketRoundsForSource(topCutSource, topCutParticipants, topCutMatches)
      }
    : embeddedTopCutMatches.length
      ? {
          ...sourceDetail(mainSource, mainParticipants, embeddedTopCutMatches),
          sourceType: 'embedded_top_cut',
          name: mainSource.name || mainSource.tournaments?.name || 'Top Cut',
          bracket: bracketRoundsForSource(mainSource, mainParticipants, embeddedTopCutMatches)
        }
      : null;
  const swissStandings = swissStandingsForSource(mainParticipants, mainMatches, claimedProfiles);

  return {
    tournament: {
      id: mainSource.tournament_id,
      name: mainSource.tournaments?.name || mainSource.name || 'Imported tournament',
      eventDate: mainSource.tournaments?.event_date || null,
      status: mainSource.tournaments?.status || null
    },
    main: sourceDetail(mainSource, mainParticipants, mainMatches),
    format: tournamentFormatLabel(mainParticipants.length, topCutDetail),
    summary: tournamentSummary(swissStandings, topCutDetail),
    swissStandings,
    topCut: topCutDetail
  };
}

async function getTournamentSourceById(sourceId) {
  const { data, error } = await supabaseAdmin
    .from('tournament_sources')
    .select('*, tournaments(id, name, event_date, status)')
    .eq('id', sourceId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function resolveMainSourceForDetails(source) {
  const { data: linkedRecord, error: linkedRecordError } = await supabaseAdmin
    .from('player_tournament_records')
    .select('main_source_id')
    .eq('top_cut_source_id', source.id)
    .limit(1)
    .maybeSingle();

  if (linkedRecordError) throw linkedRecordError;

  if (linkedRecord?.main_source_id) {
    const linkedMainSource = await getTournamentSourceById(linkedRecord.main_source_id);
    if (linkedMainSource) return linkedMainSource;
  }

  if (source.source_type !== 'top_cut') return source;

  const { data, error } = await supabaseAdmin
    .from('tournament_sources')
    .select('*, tournaments(id, name, event_date, status)')
    .eq('tournament_id', source.tournament_id)
    .neq('source_type', 'top_cut')
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || source;
}

async function findLinkedTopCutSourceForMain(mainSource) {
  const { data: linkedRecord, error: linkedRecordError } = await supabaseAdmin
    .from('player_tournament_records')
    .select('top_cut_source_id')
    .eq('main_source_id', mainSource.id)
    .not('top_cut_source_id', 'is', null)
    .limit(1)
    .maybeSingle();

  if (linkedRecordError) throw linkedRecordError;

  if (linkedRecord?.top_cut_source_id) {
    return getTournamentSourceById(linkedRecord.top_cut_source_id);
  }

  const { data, error } = await supabaseAdmin
    .from('tournament_sources')
    .select('*, tournaments(id, name, event_date, status)')
    .eq('tournament_id', mainSource.tournament_id)
    .eq('source_type', 'top_cut')
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function participantsForSource(source) {
  const { data, error } = await supabaseAdmin
    .from('tournament_participants')
    .select('challonge_participant_id, name, seed, final_rank, claimed_by, claimed_record_id, raw_data')
    .eq('source_id', source.id);

  if (error) throw error;
  if (data.length) {
    return data.map((participant) => ({
      ...participant.raw_data,
      id: Number(participant.challonge_participant_id),
      name: participant.name,
      seed: participant.seed,
      final_rank: participant.final_rank,
      claimed_by: participant.claimed_by,
      claimed_record_id: participant.claimed_record_id
    }));
  }

  return snapshotParticipants(source);
}

async function profilesForClaimedParticipants(participants) {
  const claimedUserIds = [...new Set(
    participants
      .map((participant) => participant.claimed_by)
      .filter(Boolean)
  )];

  if (!claimedUserIds.length) return new Map();

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, display_name')
    .in('id', claimedUserIds);

  if (error) throw error;
  return new Map(data.map((profile) => [profile.id, profile]));
}

async function matchesForSource(source) {
  const cachedMatches = snapshotMatches(source);
  if (cachedMatches.length) {
    return cachedMatches;
  }

  const { data, error } = await supabaseAdmin
    .from('match_records')
    .select('challonge_match_id, round_number, player_challonge_participant_id, opponent_challonge_participant_id, result, raw_data')
    .eq('source_id', source.id);

  if (error) throw error;
  if (data.length) {
    return data.map((match) => ({
      ...match.raw_data,
      id: Number(match.challonge_match_id),
      round: match.round_number,
      player1_id: match.raw_data?.player1_id,
      player2_id: match.raw_data?.player2_id,
      winner_id: match.raw_data?.winner_id,
      scores_csv: match.raw_data?.scores_csv || ''
    }));
  }

  return snapshotMatches(source);
}

function sourceDetail(source, participants, matches) {
  return {
    sourceId: source.id,
    sourceType: source.source_type,
    challongeTournamentId: Number(source.challonge_tournament_id),
    name: source.name || source.tournaments?.name || 'Imported tournament',
    challongeUrl: source.challonge_url,
    challongeSlug: source.challonge_slug,
    tournamentType: source.tournament_type,
    participantCount: participants.length,
    matchCount: matches.length
  };
}

function tournamentFormatLabel(participantCount, topCutDetail) {
  const topCutCount = topCutDetail?.bracket?.fieldSize || (
    topCutDetail?.bracket?.mainRounds?.[0]?.matches?.length
      ? topCutDetail.bracket.mainRounds[0].matches.length * 2
      : 0
  );
  const topCutText = topCutCount || 'Top Cut';

  return `Groups (${participantCount} -> ${topCutText}) then Single Elimination`;
}

function tournamentSummary(swissStandings, topCutDetail) {
  const swissKing = swissStandings[0]?.name || 'N/A';
  const finalRound = topCutDetail?.bracket?.mainRounds?.at(-1);
  const finalMatch = finalRound?.matches?.[0];
  const champion = finalMatch ? winnerNameFromBracketMatch(finalMatch) : 'N/A';
  const finisher = finalMatch ? loserNameFromBracketMatch(finalMatch) : 'N/A';

  return {
    champion,
    finisher,
    swissKing
  };
}

function winnerNameFromBracketMatch(match) {
  if (match.winnerId === match.playerOneId) return match.playerOneName;
  if (match.winnerId === match.playerTwoId) return match.playerTwoName;
  return 'N/A';
}

function loserNameFromBracketMatch(match) {
  if (match.winnerId === match.playerOneId) return match.playerTwoName;
  if (match.winnerId === match.playerTwoId) return match.playerOneName;
  return 'N/A';
}

function swissStandingsForSource(participants, matches, claimedProfiles = new Map()) {
  const swissMatches = swissMatchesForStandings(matches);
  const hasSwissMatchData = swissMatches.length > 0;
  const participantNames = participantNameMap(participants);
  const winsByParticipant = new Map();
  const lossesByParticipant = new Map();
  const tiesByParticipant = new Map();
  const historyByParticipant = new Map();

  for (const participant of participants) {
    const ids = participantIdsForMatches(participant);

    winsByParticipant.set(Number(participant.id), 0);
    lossesByParticipant.set(Number(participant.id), 0);
    tiesByParticipant.set(Number(participant.id), 0);
    historyByParticipant.set(Number(participant.id), []);

    if (!hasSwissMatchData) {
      winsByParticipant.set(Number(participant.id), numberFromParticipant(participant, ['wins', 'matches_won', 'match_wins']) || 0);
      lossesByParticipant.set(Number(participant.id), numberFromParticipant(participant, ['losses', 'matches_lost', 'match_losses']) || 0);
      tiesByParticipant.set(Number(participant.id), numberFromParticipant(participant, ['ties', 'matches_tied', 'match_ties']) || 0);
      continue;
    }

    for (const match of swissMatches) {
      const playerOneId = Number(match.player1_id);
      const playerTwoId = Number(match.player2_id);
      const winnerId = Number(match.winner_id);
      const played = ids.includes(playerOneId) || ids.includes(playerTwoId);
      if (!played || !isCompletedMatch(match)) continue;

      const participantId = Number(participant.id);
      const opponentId = ids.includes(playerOneId) ? playerTwoId : playerOneId;
      let result = 'tie';

      if (!Number.isFinite(winnerId) || winnerId === 0) {
        tiesByParticipant.set(participantId, (tiesByParticipant.get(participantId) || 0) + 1);
      } else if (ids.includes(winnerId)) {
        result = 'win';
        winsByParticipant.set(participantId, (winsByParticipant.get(participantId) || 0) + 1);
      } else {
        result = 'loss';
        lossesByParticipant.set(participantId, (lossesByParticipant.get(participantId) || 0) + 1);
      }

      historyByParticipant.set(participantId, [
        ...(historyByParticipant.get(participantId) || []),
        {
          round: Number(match.round) || null,
          result,
          opponentId: Number.isFinite(opponentId) ? opponentId : null,
          opponentName: participantNames.get(Number(opponentId)) || (opponentId ? `Participant #${opponentId}` : 'Bye'),
          score: scoreForParticipant(match, ids)
        }
      ]);
    }
  }

  return participants
    .map((participant) => ({
      id: Number(participant.id),
      seed: participant.seed || null,
      name: participant.name,
      finalRank: participant.final_rank || null,
      claimed: Boolean(participant.claimed_by),
      claimedBy: participant.claimed_by || null,
      claimedRecordId: participant.claimed_record_id || null,
      claimedByProfile: participant.claimed_by ? claimedProfiles.get(participant.claimed_by) || null : null,
      wins: winsByParticipant.get(Number(participant.id)) || 0,
      losses: lossesByParticipant.get(Number(participant.id)) || 0,
      ties: tiesByParticipant.get(Number(participant.id)) || 0,
      matchHistory: (historyByParticipant.get(Number(participant.id)) || []).sort((a, b) => (a.round || 0) - (b.round || 0))
    }))
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses || (a.finalRank || 9999) - (b.finalRank || 9999) || a.name.localeCompare(b.name))
    .map((participant, index) => ({ ...participant, rank: index + 1 }));
}

function swissMatchesForStandings(matches) {
  const groupedMatches = matches.filter((match) => match.group_id);
  if (groupedMatches.length) return groupedMatches;

  return matches.filter((match) => {
    const round = Number(match.round);
    return Number.isFinite(round) && round > 0 && round <= 5;
  });
}

function embeddedTopCutMatchesForSource(source, matches) {
  if (!hasEmbeddedFinalStage(snapshotSource(source))) return [];

  return matches.filter((match) => !match.group_id);
}

function snapshotSource(source) {
  const snapshot = source.raw_data?.snapshot;

  return {
    tournamentType: source.tournament_type || snapshot?.tournamentType || source.raw_data?.tournament_type,
    raw: snapshot?.raw || source.raw_data?.raw || source.raw_data || {},
    participants: snapshotParticipants(source),
    matches: snapshotMatches(source)
  };
}

function isCompletedMatch(match) {
  const state = String(match.state || match.raw?.state || '').toLowerCase();
  if (state && !['complete', 'completed'].includes(state)) return false;

  return Boolean(match.completed_at || match.raw?.completed_at || match.scores_csv || match.winner_id || !state);
}

function scoreForParticipant(match, participantIds) {
  const rawScore = String(match.scores_csv || match.raw?.scores_csv || '').trim();
  const scoreParts = rawScore.match(/\d+/g)?.map(Number) || [];
  if (scoreParts.length < 2) return rawScore || '-';

  const playerOneId = Number(match.player1_id);
  const participantIsPlayerOne = participantIds.includes(playerOneId);
  const [playerOneScore, playerTwoScore] = scoreParts;

  return participantIsPlayerOne ? `${playerOneScore}-${playerTwoScore}` : `${playerTwoScore}-${playerOneScore}`;
}

function bracketRoundsForSource(source, participants, matches) {
  const names = participantNameMap(participants);
  const seeds = participantSeedMap(participants);
  const finalRanks = participantFinalRankMap(participants);
  const rounds = new Map();

  for (const match of matches) {
    const round = Number(match.round) || 1;
    const playerOneId = Number(match.player1_id);
    const playerTwoId = Number(match.player2_id);
    const winnerId = Number(match.winner_id);
    const row = {
      id: Number(match.id),
      round,
      playerOneName: names.get(playerOneId) || (playerOneId ? `Participant #${playerOneId}` : 'TBD'),
      playerTwoName: names.get(playerTwoId) || (playerTwoId ? `Participant #${playerTwoId}` : 'TBD'),
      playerOneSeed: seeds.get(playerOneId) || null,
      playerTwoSeed: seeds.get(playerTwoId) || null,
      playerOneFinalRank: finalRanks.get(playerOneId) || null,
      playerTwoFinalRank: finalRanks.get(playerTwoId) || null,
      playerOneId,
      playerTwoId,
      winnerId: Number.isFinite(winnerId) ? winnerId : null,
      score: match.scores_csv || ''
    };

    rounds.set(round, [...(rounds.get(round) || []), row]);
  }

  const roundRows = [...rounds.entries()]
    .sort(([a], [b]) => a - b)
    .map(([round, roundMatches]) => ({
      round,
      label: bracketRoundLabel(round, rounds.size),
      matches: roundMatches.sort((a, b) => a.id - b.id)
    }));

  return splitMainAndExtraBracketRounds(roundRows);
}

function splitMainAndExtraBracketRounds(rounds) {
  if (!rounds.length) return { mainRounds: [], extraMatches: [] };

  const allMatches = rounds.flatMap((round) => round.matches);
  const fieldSize = mainBracketFieldSize(allMatches);
  const finalMatch = findChampionshipFinalMatch(allMatches);
  const finalRound = finalMatch?.round || rounds.at(-1)?.round;
  const candidateRounds = rounds.filter((round) => round.round <= finalRound);
  const expectedCounts = expectedMainBracketCounts(candidateRounds, allMatches);
  const mainRounds = candidateRounds.map((round, index) => ({
    ...round,
    label: bracketRoundLabel(index + 1, candidateRounds.length),
    matches: round.matches.slice(0, expectedCounts[index])
  }));
  const extraMatches = [
    ...candidateRounds.flatMap((round, index) => round.matches.slice(expectedCounts[index])),
    ...rounds.filter((round) => round.round > finalRound).flatMap((round) => round.matches)
  ]
    .map((match, matchIndex) => ({
      ...match,
      label: placementMatchLabel(match, matchIndex)
    }));

  return { mainRounds, extraMatches, fieldSize };
}

function expectedMainBracketCounts(rounds, matches = []) {
  const fieldSize = mainBracketFieldSize(matches);

  if (fieldSize >= 2) {
    const lowerPowerOfTwo = highestPowerOfTwoLessThanOrEqual(fieldSize);
    const playInCount = fieldSize === lowerPowerOfTwo ? 0 : fieldSize - lowerPowerOfTwo;
    const bracketCounts = [];

    if (playInCount > 0) bracketCounts.push(playInCount);

    for (let remainingPlayers = fieldSize - playInCount; remainingPlayers > 1; remainingPlayers /= 2) {
      bracketCounts.push(remainingPlayers / 2);
    }

    if (bracketCounts.length >= rounds.length) {
      return rounds.map((round, index) => Math.min(round.matches.length, bracketCounts[index] || 0));
    }
  }

  const expectedCounts = [];

  for (let index = rounds.length - 1; index >= 0; index -= 1) {
    const actualCount = rounds[index].matches.length;

    if (index === rounds.length - 1) {
      expectedCounts[index] = Math.min(actualCount, 1);
      continue;
    }

    const nextExpected = expectedCounts[index + 1];
    const doubled = nextExpected * 2;
    expectedCounts[index] = index === 0 && actualCount < doubled
      ? Math.min(actualCount, nextExpected)
      : Math.min(actualCount, doubled);
  }

  return expectedCounts;
}

function mainBracketFieldSize(matches) {
  const participantIds = new Set();

  for (const match of matches) {
    if (match.playerOneId) participantIds.add(match.playerOneId);
    if (match.playerTwoId) participantIds.add(match.playerTwoId);
  }

  return participantIds.size;
}

function highestPowerOfTwoLessThanOrEqual(value) {
  let power = 1;

  while (power * 2 <= value) {
    power *= 2;
  }

  return power;
}

function findChampionshipFinalMatch(matches) {
  return (
    matches.find((match) =>
      [match.playerOneFinalRank, match.playerTwoFinalRank].includes(1)
      && [match.playerOneFinalRank, match.playerTwoFinalRank].includes(2)
    )
    || matches.find((match) =>
      (match.winnerId === match.playerOneId && match.playerOneFinalRank === 1)
      || (match.winnerId === match.playerTwoId && match.playerTwoFinalRank === 1)
    )
    || [...matches].reverse().find((match) => match.winnerId)
    || null
  );
}

function placementMatchLabel(_match, index) {
  return index === 0 ? 'Extra / Placement Match' : `Extra / Placement Match ${index + 1}`;
}

function participantSeedMap(participants) {
  const seeds = new Map();

  for (const participant of participants || []) {
    seeds.set(Number(participant.id), participant.seed || null);
    for (const groupPlayerId of participant.group_player_ids || []) {
      seeds.set(Number(groupPlayerId), participant.seed || null);
    }
  }

  return seeds;
}

function participantFinalRankMap(participants) {
  const ranks = new Map();

  for (const participant of participants || []) {
    ranks.set(Number(participant.id), participant.final_rank || null);
    for (const groupPlayerId of participant.group_player_ids || []) {
      ranks.set(Number(groupPlayerId), participant.final_rank || null);
    }
  }

  return ranks;
}

function bracketRoundLabel(round, roundCount) {
  if (round === roundCount) return 'Final';
  if (round === roundCount - 1) return 'Semifinal';
  if (round === roundCount - 2) return 'Quarterfinal';
  return `Round ${round}`;
}

function snapshotParticipants(source) {
  const snapshot = source.raw_data?.snapshot;
  const participants = snapshot?.participants || source.raw_data?.participants || [];
  return participants.map((participant) => participant.participant || participant);
}

function snapshotMatches(source) {
  const snapshot = source.raw_data?.snapshot;
  const matches = snapshot?.matches || source.raw_data?.matches || [];
  return matches.map((match) => match.match || match);
}

function participantCountFromSourceSnapshot(source) {
  const snapshotParticipants = source.raw_data?.snapshot?.participants;
  if (Array.isArray(snapshotParticipants)) return snapshotParticipants.length;

  const rawParticipants = source.raw_data?.participants;
  if (Array.isArray(rawParticipants)) return rawParticipants.length;

  return 0;
}

async function confirmImport({ userId, preview, deck = {} }) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('player_tournament_records')
    .select('id, status')
    .eq('main_challonge_tournament_id', preview.main.challongeTournamentId)
    .eq('main_challonge_participant_id', preview.selectedParticipant.challongeParticipantId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) {
    throw new AppError(409, 'duplicate_claim', 'This Challonge participant has already been claimed.', existing);
  }

  const { tournament, mainSource, topCutSource } = await findOrCreateTournamentWithSources(userId, preview);

  const { data: record, error: recordError } = await supabaseAdmin
    .from('player_tournament_records')
    .insert({
      tournament_id: tournament.id,
      user_id: userId,
      main_source_id: mainSource.id,
      main_challonge_tournament_id: preview.main.challongeTournamentId,
      main_challonge_participant_id: preview.selectedParticipant.challongeParticipantId,
      player_name: preview.selectedParticipant.name,
      top_cut_source_id: topCutSource?.id || null,
      top_cut_participant_id: preview.topCutParticipant?.challongeParticipantId || null,
      deck,
      swiss_wins: preview.swissWins,
      top_cut_entry: preview.topCutEntry,
      is_swiss_king: preview.isSwissKing,
      final_placement: preview.finalPlacement,
      total_points: preview.totalPoints,
      valid_wins: preview.validWins,
      import_summary: preview
    })
    .select()
    .single();

  if (recordError) throw recordError;

  await persistClaimedParticipants(tournament.id, mainSource.id, topCutSource?.id || null, record.id, userId, preview);
  await persistMatchRecords(tournament.id, mainSource.id, topCutSource?.id || null, record.id, preview.matchSummaries);

  if (preview.reviewFlags.length > 0) {
    const { error: flagsError } = await supabaseAdmin
      .from('review_flags')
      .insert(preview.reviewFlags.map((flag) => ({
        ...flag,
        tournament_id: tournament.id,
        player_record_id: record.id,
        source_id: flag.context?.sourceId || null,
        created_by: userId
      })));

    if (flagsError) throw flagsError;
  }

  return {
    tournamentId: tournament.id,
    recordId: record.id,
    status: record.status,
    reviewFlagCount: preview.reviewFlags.length
  };
}

async function fetchTournamentWithCache(input, { sourceType = 'main', userId = null, tournamentId = null } = {}) {
  const identifier = parseChallongeIdentifier(input);
  const cachedSource = await findCachedTournamentSource(identifier, input);
  const cachedTournament = cachedSource ? tournamentFromCachedSource(cachedSource, input, identifier) : null;

  if (cachedTournament) {
    return cachedTournament;
  }

  const tournament = await fetchTournament(input);
  return persistTournamentSnapshot({ tournament, sourceType, userId, tournamentId });
}

async function findCachedTournamentSource(identifier, input) {
  const select = '*, tournaments(*)';
  const { data: bySlug, error: slugError } = await supabaseAdmin
    .from('tournament_sources')
    .select(select)
    .eq('challonge_slug', identifier)
    .maybeSingle();

  if (slugError) throw slugError;
  if (bySlug) return bySlug;

  const { data: byUrl, error: urlError } = await supabaseAdmin
    .from('tournament_sources')
    .select(select)
    .eq('challonge_url', input)
    .maybeSingle();

  if (urlError) throw urlError;
  return byUrl;
}

function tournamentFromCachedSource(source, input, identifier) {
  const snapshot = source.raw_data?.snapshot;
  if (!snapshot?.participants || !snapshot?.matches) return null;

  return {
    ...snapshot,
    id: Number(snapshot.id || source.challonge_tournament_id),
    url: input || snapshot.url || source.challonge_url,
    slug: snapshot.slug || source.challonge_slug || identifier,
    participants: snapshot.participants || [],
    matches: snapshot.matches || [],
    raw: snapshot.raw || source.raw_data?.raw || source.raw_data || {},
    cache: {
      sourceId: source.id,
      tournamentId: source.tournament_id,
      hit: true
    }
  };
}

async function persistTournamentSnapshot({ tournament, sourceType, userId, tournamentId }) {
  const existingSource = await findSourceByChallongeTournamentId(tournament.id);

  if (existingSource && tournamentId && existingSource.tournament_id !== tournamentId) {
    throw new AppError(409, 'top_cut_source_conflict', 'This Challonge source is already linked to another tournament.');
  }

  const linkedTournamentId = tournamentId || existingSource?.tournament_id || null;
  const tournamentRow = linkedTournamentId
    ? await updateTournamentFromSnapshot(linkedTournamentId, tournament)
    : await createTournamentFromSnapshot(userId, tournament);

  const source = existingSource
    ? await updateSourceSnapshot(existingSource.id, tournament, sourceType)
    : await createSourceFromSnapshot(tournamentRow.id, tournament, sourceType);

  await persistSourceParticipants(tournamentRow.id, source.id, tournament.participants);

  return {
    ...tournament,
    cache: {
      sourceId: source.id,
      tournamentId: tournamentRow.id,
      hit: false
    }
  };
}

async function findSourceByChallongeTournamentId(challongeTournamentId) {
  const { data, error } = await supabaseAdmin
    .from('tournament_sources')
    .select('*')
    .eq('challonge_tournament_id', challongeTournamentId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function createTournamentFromSnapshot(userId, tournament) {
  const { data, error } = await supabaseAdmin
    .from('tournaments')
    .insert({
      name: tournament.name,
      challonge_started_at: tournament.startedAt || null,
      challonge_completed_at: tournament.completedAt || null,
      event_date: dateFromTimestamp(tournament.startedAt),
      status: 'pending_review',
      submitted_by: userId,
      metadata: { cachedFromChallonge: true }
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function updateTournamentFromSnapshot(tournamentId, tournament) {
  const { data, error } = await supabaseAdmin
    .from('tournaments')
    .update({
      name: tournament.name,
      challonge_started_at: tournament.startedAt || null,
      challonge_completed_at: tournament.completedAt || null,
      event_date: dateFromTimestamp(tournament.startedAt)
    })
    .eq('id', tournamentId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function createSourceFromSnapshot(tournamentId, tournament, sourceType) {
  const { data, error } = await supabaseAdmin
    .from('tournament_sources')
    .insert(sourceInsertPayload(tournamentId, tournamentSnapshot(tournament), sourceType, sourceType === 'top_cut'))
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function updateSourceSnapshot(sourceId, tournament, sourceType) {
  const { data, error } = await supabaseAdmin
    .from('tournament_sources')
    .update(sourceUpdatePayload(tournamentSnapshot(tournament), sourceType))
    .eq('id', sourceId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function persistSourceParticipants(tournamentId, sourceId, participants) {
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

function sourceUpdatePayload(source, sourceType) {
  return {
    challonge_url: source.url,
    challonge_slug: source.slug,
    name: source.name,
    tournament_type: source.tournamentType,
    is_authoritative_top_cut: sourceType === 'top_cut',
    raw_data: sourceRawData(source)
  };
}

function sourceRawData(source) {
  return {
    raw: source.raw || {},
    snapshot: source
  };
}
async function persistClaimedParticipants(tournamentId, mainSourceId, topCutSourceId, recordId, userId, preview) {
  const rows = [
    {
      tournament_id: tournamentId,
      source_id: mainSourceId,
      challonge_participant_id: preview.selectedParticipant.challongeParticipantId,
      name: preview.selectedParticipant.name,
      seed: preview.selectedParticipant.seed || null,
      final_rank: preview.selectedParticipant.finalRank || null,
      claimed_by: userId,
      claimed_record_id: recordId,
      claimed_at: new Date().toISOString(),
      raw_data: preview.selectedParticipant
    }
  ];

  if (topCutSourceId && preview.topCutParticipant) {
    rows.push({
      tournament_id: tournamentId,
      source_id: topCutSourceId,
      challonge_participant_id: preview.topCutParticipant.challongeParticipantId,
      name: preview.topCutParticipant.name,
      seed: null,
      final_rank: preview.topCutParticipant.finalRank || null,
      claimed_by: userId,
      claimed_record_id: recordId,
      claimed_at: new Date().toISOString(),
      raw_data: preview.topCutParticipant
    });
  }

  const { error } = await supabaseAdmin
    .from('tournament_participants')
    .upsert(rows, { onConflict: 'source_id,challonge_participant_id' });

  if (error) throw error;
}

async function persistMatchRecords(tournamentId, mainSourceId, topCutSourceId, recordId, matchSummaries) {
  if (!matchSummaries || matchSummaries.length === 0) return;

  const rows = matchSummaries.map((match) => ({
    tournament_id: tournamentId,
    source_id: match.stage === 'top_cut' && topCutSourceId ? topCutSourceId : mainSourceId,
    player_record_id: recordId,
    challonge_match_id: match.challongeMatchId,
    stage: match.stage,
    round_number: match.roundNumber || null,
    player_challonge_participant_id: match.playerChallongeParticipantId,
    opponent_challonge_participant_id: match.opponentChallongeParticipantId || null,
    result: match.result,
    points_awarded: match.pointsAwarded,
    needs_review: match.needsReview,
    raw_data: match.raw || match
  }));

  const { error } = await supabaseAdmin
    .from('match_records')
    .upsert(rows, { onConflict: 'source_id,challonge_match_id,player_challonge_participant_id' });

  if (error) throw error;
}

async function findOrCreateTournamentWithSources(userId, preview) {
  const { data: existingMainSource, error: existingSourceError } = await supabaseAdmin
    .from('tournament_sources')
    .select('*, tournaments(*)')
    .eq('challonge_tournament_id', preview.main.challongeTournamentId)
    .maybeSingle();

  if (existingSourceError) throw existingSourceError;

  if (existingMainSource) {
    const tournament = await syncTournamentDates(existingMainSource.tournaments, preview.main);
    const topCutSource = preview.topCut
      ? await ensureTopCutSource(existingMainSource.tournament_id, preview.topCut)
      : null;

    return {
      tournament,
      mainSource: existingMainSource,
      topCutSource
    };
  }

  const { data: tournament, error: tournamentError } = await supabaseAdmin
    .from('tournaments')
    .insert({
      name: preview.main.name,
      challonge_started_at: preview.main.startedAt,
      challonge_completed_at: preview.main.completedAt,
      event_date: preview.main.tournamentDate,
      status: 'pending_review',
      submitted_by: userId,
      metadata: { hasSeparateTopCut: preview.hasSeparateTopCut }
    })
    .select()
    .single();

  if (tournamentError) throw tournamentError;

  const { data: mainSource, error: mainSourceError } = await supabaseAdmin
    .from('tournament_sources')
    .insert(sourceInsertPayload(tournament.id, preview.main, 'main', false))
    .select()
    .single();

  if (mainSourceError) throw mainSourceError;

  const topCutSource = preview.topCut
    ? await ensureTopCutSource(tournament.id, preview.topCut)
    : null;

  return { tournament, mainSource, topCutSource };
}

async function syncTournamentDates(tournament, mainPreview) {
  const eventDate = mainPreview.tournamentDate;
  const startedAt = mainPreview.startedAt || null;
  const completedAt = mainPreview.completedAt || null;

  if (
    tournament.event_date === eventDate
    && tournament.challonge_started_at === startedAt
    && tournament.challonge_completed_at === completedAt
  ) {
    return tournament;
  }

  const { data, error } = await supabaseAdmin
    .from('tournaments')
    .update({
      event_date: eventDate,
      challonge_started_at: startedAt,
      challonge_completed_at: completedAt
    })
    .eq('id', tournament.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function ensureTopCutSource(tournamentId, topCutPreview) {
  const { data: existingTopCut, error: existingTopCutError } = await supabaseAdmin
    .from('tournament_sources')
    .select('*')
    .eq('challonge_tournament_id', topCutPreview.challongeTournamentId)
    .maybeSingle();

  if (existingTopCutError) throw existingTopCutError;

  if (existingTopCut) {
    if (existingTopCut.tournament_id !== tournamentId) {
      throw new AppError(409, 'top_cut_source_conflict', 'This Top Cut Challonge source is already linked to another tournament.');
    }

    return existingTopCut;
  }

  const { data, error } = await supabaseAdmin
    .from('tournament_sources')
    .insert(sourceInsertPayload(tournamentId, topCutPreview, 'top_cut', true))
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function findDuplicate(mainChallongeTournamentId, mainChallongeParticipantId) {
  const { data, error } = await supabaseAdmin
    .from('player_tournament_records')
    .select('id, user_id, status')
    .eq('main_challonge_tournament_id', mainChallongeTournamentId)
    .eq('main_challonge_participant_id', mainChallongeParticipantId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function claimsForTournament(mainChallongeTournamentId) {
  const { data, error } = await supabaseAdmin
    .from('player_tournament_records')
    .select('main_challonge_participant_id, user_id')
    .eq('main_challonge_tournament_id', mainChallongeTournamentId);

  if (error) throw error;
  return new Map(data.map((row) => [Number(row.main_challonge_participant_id), row]));
}

function summarizeMatch(match, participantId, stage, sourceChallongeTournamentId) {
  const classified = classifyMatchForParticipant(match, participantId, stage);
  if (!classified) return null;
  const participantIds = Array.isArray(participantId) ? participantId.map(Number) : [Number(participantId)];
  const matchedParticipantId = participantIds.includes(Number(match.player1_id)) ? Number(match.player1_id) : Number(match.player2_id);

  return {
    challongeMatchId: Number(match.id),
    sourceChallongeTournamentId,
    stage: classified.stage,
    roundNumber: match.round,
    playerChallongeParticipantId: matchedParticipantId,
    opponentChallongeParticipantId: Number(match.player1_id) === matchedParticipantId ? match.player2_id : match.player1_id,
    result: classified.result,
    pointsAwarded: classified.pointsAwarded,
    needsReview: classified.needsReview,
    raw: match
  };
}

function participantNameMap(participants) {
  const names = new Map();

  for (const participant of participants || []) {
    names.set(Number(participant.id), participant.name);
    for (const groupPlayerId of participant.group_player_ids || []) {
      names.set(Number(groupPlayerId), participant.name);
    }
  }

  return names;
}

function scoreFromPlayerPerspective(match) {
  const rawScore = String(match.raw?.scores_csv || '').trim();
  const scoreParts = rawScore.match(/\d+/g)?.map(Number) || [];
  if (scoreParts.length < 2) return rawScore || null;

  const [firstScore, secondScore] = scoreParts;
  const higherScore = Math.max(firstScore, secondScore);
  const lowerScore = Math.min(firstScore, secondScore);

  if (match.result === 'win') return `${higherScore}-${lowerScore}`;
  if (match.result === 'loss') return `${lowerScore}-${higherScore}`;
  return `${firstScore}-${secondScore}`;
}

function participantIdsForMatches(participant) {
  return [
    Number(participant.id),
    ...(Array.isArray(participant.group_player_ids) ? participant.group_player_ids.map(Number) : [])
  ].filter((id) => Number.isFinite(id));
}

function determineMatchStage(match, hasEmbeddedFinalStage) {
  if (match.group_id) return 'swiss';
  return hasEmbeddedFinalStage ? 'top_cut' : 'swiss';
}

function sourceSummary(source) {
  return {
    challongeTournamentId: Number(source.id),
    name: source.name,
    url: source.url,
    slug: source.slug,
    tournamentType: source.tournamentType,
    startedAt: source.startedAt,
    completedAt: source.completedAt,
    tournamentDate: dateFromTimestamp(source.startedAt),
    participantCount: source.participants.length,
    matchCount: source.matches.length,
    apiVersion: source.apiVersion || 'v1'
  };
}

function dateFromTimestamp(value) {
  if (!value) return null;

  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function hasEmbeddedFinalStage(source) {
  const type = String(source.tournamentType || source.raw?.tournament_type || '').toLowerCase();
  const description = [
    source.raw?.description,
    source.raw?.description_source,
    source.raw?.tournament_type,
    source.raw?.url
  ].join(' ').toLowerCase();
  const hasGroupedParticipants = source.participants.some((participant) => isParticipantFromGroupStage(participant));

  return type.includes('group') || description.includes('group') || hasGroupedParticipants;
}

function inferSwissRecord(participant, matchSummaries, standingsRow = null) {
  if (standingsRow) {
    return {
      wins: standingsRow.wins,
      losses: standingsRow.losses,
      ties: standingsRow.ties,
      source: 'challonge_standings_html',
      rank: standingsRow.rank,
      qualifiedForTopCut: standingsRow.qualifiedForTopCut,
      matchHistory: standingsRow.matchHistory,
      isComplete: true
    };
  }

  const wins = numberFromParticipant(participant, ['wins', 'matches_won', 'match_wins']);
  const losses = numberFromParticipant(participant, ['losses', 'matches_lost', 'match_losses']);
  const ties = numberFromParticipant(participant, ['ties', 'matches_tied', 'match_ties']);

  if (wins != null || losses != null || ties != null) {
    return {
      wins: wins || 0,
      losses: losses || 0,
      ties: ties || 0,
      source: 'challonge_participant_standings',
      isComplete: true
    };
  }

  const swissMatches = matchSummaries.filter((item) => item.stage === 'swiss');
  if (swissMatches.length > 0) {
    return {
      wins: swissMatches.filter((item) => item.result === 'win').length,
      losses: swissMatches.filter((item) => item.result === 'loss').length,
      ties: swissMatches.filter((item) => item.result === 'tie').length,
      source: 'match_summaries',
      isComplete: true
    };
  }

  if (isParticipantFromGroupStage(participant)) {
    return {
      wins: 0,
      losses: 0,
      ties: 0,
      source: 'challonge_two_stage_group_stage_unavailable',
      isComplete: false,
      message: 'Challonge v1 returned the final-stage bracket but did not expose this player’s group-stage match history or Swiss/group wins.'
    };
  }

  return {
    wins: matchSummaries.filter((item) => item.stage === 'swiss' && item.result === 'win').length,
    losses: matchSummaries.filter((item) => item.stage === 'swiss' && item.result === 'loss').length,
    ties: matchSummaries.filter((item) => item.stage === 'swiss' && item.result === 'tie').length,
    source: 'match_summaries',
    isComplete: true
  };
}

function isParticipantFromGroupStage(participant) {
  return Boolean(
    participant?.group_id
    || (Array.isArray(participant?.group_player_ids) && participant.group_player_ids.length > 0)
  );
}

function numberFromParticipant(participant, keys) {
  for (const key of keys) {
    const value = Number(participant?.[key]);
    if (Number.isFinite(value)) return value;
  }

  return null;
}

function buildPointBreakdown({ swissWins, topCutEntry, isSwissKing, finalPlacement }) {
  return [
    {
      key: 'swiss_wins',
      label: 'Swiss wins',
      value: swissWins,
      points: swissWins
    },
    {
      key: 'top_cut_entry',
      label: 'Top Cut entry',
      value: topCutEntry ? 'Yes' : 'No',
      points: topCutEntry ? POINTS.topCutEntry : 0
    },
    {
      key: 'swiss_king',
      label: 'Swiss King',
      value: isSwissKing ? 'Yes' : 'No',
      points: isSwissKing ? POINTS.swissKing : 0
    },
    {
      key: 'final_placement',
      label: 'Final placement',
      value: finalPlacement || 'Unplaced',
      points: placementPoints(finalPlacement)
    }
  ];
}

function placementPoints(finalPlacement) {
  if (finalPlacement === 1) return POINTS.champion;
  if (finalPlacement === 2) return POINTS.finisher;
  return 0;
}

function sourceInsertPayload(tournamentId, source, sourceType, isAuthoritativeTopCut) {
  return {
    tournament_id: tournamentId,
    source_type: sourceType,
    challonge_tournament_id: source.challongeTournamentId || Number(source.id),
    challonge_url: source.url,
    challonge_slug: source.slug,
    name: source.name,
    tournament_type: source.tournamentType,
    is_authoritative_top_cut: isAuthoritativeTopCut,
    raw_data: source.raw || source
  };
}

function inferFinalPlacement(participant) {
  const rank = Number(participant.final_rank);
  return [1, 2, 3, 4, 5, 6, 7, 8].includes(rank) ? rank : null;
}

function inferSwissKingStatus(participants, selectedParticipant, standingsRow = null, matches = []) {
  if (standingsRow?.rank != null) {
    return standingsRow.rank === 1 ? 'confirmed' : 'not_swiss_king';
  }

  const selectedWins = numberFromParticipant(selectedParticipant, ['wins', 'matches_won', 'match_wins']);
  const participantWins = participants
    .map((participant) => numberFromParticipant(participant, ['wins', 'matches_won', 'match_wins']))
    .filter((wins) => wins != null);

  if (selectedWins != null && participantWins.length > 0) {
    return selectedWins === Math.max(...participantWins) ? 'confirmed' : 'not_swiss_king';
  }

  const groupedWins = groupedSwissWinsByParticipant(participants, matches);
  const selectedGroupedWins = groupedWins.get(Number(selectedParticipant.id));
  if (selectedGroupedWins != null && groupedWins.size > 0) {
    const maxWins = Math.max(...groupedWins.values());
    const playersAtMax = [...groupedWins.values()].filter((wins) => wins === maxWins).length;

    if (selectedGroupedWins < maxWins) return 'not_swiss_king';
    return playersAtMax === 1 ? 'confirmed' : 'unclear';
  }

  if (isParticipantFromGroupStage(selectedParticipant)) {
    return 'unclear';
  }

  const ranks = participants
    .map((participant) => Number(participant.final_rank))
    .filter((rank) => Number.isFinite(rank));

  if (ranks.length === 0) return 'unclear';

  const bestRank = Math.min(...ranks);
  return Number(selectedParticipant.final_rank) === bestRank ? 'confirmed' : 'not_swiss_king';
}

function groupedSwissWinsByParticipant(participants, matches) {
  const groupPlayerToParticipant = new Map();
  const winsByParticipant = new Map();

  for (const participant of participants) {
    const participantId = Number(participant.id);
    winsByParticipant.set(participantId, 0);

    for (const groupPlayerId of participant.group_player_ids || []) {
      groupPlayerToParticipant.set(Number(groupPlayerId), participantId);
    }
  }

  for (const match of matches) {
    if (!match.group_id || match.winner_id == null) continue;

    const winnerParticipantId = groupPlayerToParticipant.get(Number(match.winner_id));
    if (winnerParticipantId == null) continue;

    winsByParticipant.set(winnerParticipantId, (winsByParticipant.get(winnerParticipantId) || 0) + 1);
  }

  return winsByParticipant;
}

function findStandingsRow(standings, participantName) {
  const selectedName = normalizeName(participantName);
  return standings.find((row) => normalizeName(row.participantName) === selectedName) || null;
}

function findTopCutParticipant(participants, mainParticipant) {
  const normalizedName = normalizeName(mainParticipant.name);
  return participants.find((participant) => normalizeName(participant.name) === normalizedName) || null;
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

module.exports = {
  previewImport,
  getParticipantsForDropdown,
  getImportedTournamentDetails,
  listImportedTournamentSources,
  confirmImport
};




