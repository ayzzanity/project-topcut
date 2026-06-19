const POINTS = {
  swissWin: 1,
  topCutEntry: 2,
  swissKing: 5,
  finisher: 8,
  champion: 10
};

function calculatePoints({ swissWins = 0, topCutEntry = false, isSwissKing = false, finalPlacement = null }) {
  let total = swissWins * POINTS.swissWin;

  if (topCutEntry) total += POINTS.topCutEntry;
  if (isSwissKing) total += POINTS.swissKing;

  if (finalPlacement === 1) total += POINTS.champion;
  if (finalPlacement === 2) total += POINTS.finisher;

  return total;
}

function classifyMatchForParticipant(match, participantId, stage) {
  const participantIds = Array.isArray(participantId) ? participantId.map(Number) : [Number(participantId)];
  const playerOneId = Number(match.player1_id);
  const playerTwoId = Number(match.player2_id);
  const winnerId = match.winner_id == null ? null : Number(match.winner_id);

  if (!participantIds.includes(playerOneId) && !participantIds.includes(playerTwoId)) {
    return null;
  }

  const opponentId = participantIds.includes(playerOneId) ? playerTwoId : playerOneId;
  const hasBye = !opponentId;
  const scores = String(match.scores_csv || '').toLowerCase();
  const hasManualReviewSignal = scores.includes('dq') || scores.includes('ff') || scores.includes('forfeit');

  if (hasBye) {
    return { result: 'bye', stage, needsReview: true, pointsAwarded: 0 };
  }

  if (hasManualReviewSignal) {
    return { result: 'forfeit', stage, needsReview: true, pointsAwarded: 0 };
  }

  if (!winnerId) {
    return { result: 'unknown', stage, needsReview: true, pointsAwarded: 0 };
  }

  const result = participantIds.includes(winnerId) ? 'win' : 'loss';

  return {
    result,
    stage,
    needsReview: false,
    pointsAwarded: stage === 'swiss' && result === 'win' ? POINTS.swissWin : 0
  };
}

module.exports = {
  POINTS,
  calculatePoints,
  classifyMatchForParticipant
};
