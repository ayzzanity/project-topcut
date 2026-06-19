import { ArrowLeftOutlined, LinkOutlined, TrophyOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Empty, Spin, Table, Tooltip } from 'antd';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PageBreadcrumb from '../components/PageBreadcrumb.jsx';
import ResponsiveTableWrapper from '../components/ResponsiveTableWrapper.jsx';
import { api } from '../lib/apiClient.js';
import { formatDate } from '../utils/formatters.js';

export default function TournamentDetailsPage() {
  const { sourceId } = useParams();
  const navigate = useNavigate();
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;

    async function loadDetails() {
      setLoading(true);
      setError(null);

      try {
        const result = await api.getImportedTournamentDetails(sourceId);
        if (alive) setDetails(result);
      } catch (nextError) {
        if (alive) setError(nextError);
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadDetails();

    return () => {
      alive = false;
    };
  }, [sourceId]);

  if (loading) {
    return (
      <div className="bbx-tournament-details-page">
        <div className="flex min-h-72 items-center justify-center">
          <Spin />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bbx-tournament-details-page">
        <Alert type="error" showIcon message={error.message} />
      </div>
    );
  }

  return (
    <div className="bbx-tournament-details-page space-y-5">
      <PageBreadcrumb
        items={[
          { label: 'Tournaments', to: '/tournaments' },
          { label: details.tournament?.name || details.main?.name || 'Tournament Details' }
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/tournaments')}>
          Back to Tournaments
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {details.main?.challongeUrl ? (
            <Button icon={<LinkOutlined />} href={details.main.challongeUrl} target="_blank">
              Open Challonge
            </Button>
          ) : null}
          {hasSeparateTopCutLink(details) ? (
            <Button icon={<LinkOutlined />} href={details.topCut.challongeUrl} target="_blank">
              Open Top Cut
            </Button>
          ) : null}
        </div>
      </div>

      <Card className="bbx-card bbx-tournament-detail-hero">
        <div>
          <div className="bbx-tournament-detail-kicker">Tournament</div>
          <h2>{details.tournament?.name || details.main?.name}</h2>
          <div className="bbx-tournament-detail-meta">
            <span>{formatDate(details.tournament?.eventDate)}</span>
            <span>{details.format}</span>
          </div>
        </div>
        <div className="bbx-tournament-detail-stats">
          <DetailMetric label="Champion" value={details.summary?.champion || 'N/A'} />
          <DetailMetric label="Finisher" value={details.summary?.finisher || 'N/A'} />
          <DetailMetric label="Swiss King" value={details.summary?.swissKing || 'N/A'} />
        </div>
      </Card>

      <Card className="bbx-card" title="Swiss Rankings">
        {details.swissStandings?.length ? (
          <ResponsiveTableWrapper>
            <Table
              className="bbx-tournament-standings-table"
              size="small"
              rowKey="id"
              dataSource={details.swissStandings}
              pagination={false}
              columns={[
                { title: 'Rank', dataIndex: 'rank', width: 90 },
                {
                  title: 'Participant',
                  dataIndex: 'name',
                  render: (value, record) => (
                    <ParticipantName participant={{ ...record, name: value }} />
                  )
                },
                {
                  title: 'Record',
                  render: (_, record) => `${record.wins} - ${record.losses} - ${record.ties}`
                },
                {
                  title: 'Match History',
                  dataIndex: 'matchHistory',
                  render: (history) => <MatchHistory history={history} />
                },
                {
                  title: 'Claim',
                  width: 150,
                  render: (_, record) => (
                    <ClaimParticipantButton
                      participant={record}
                      sourceId={details.main?.sourceId}
                      onClaim={() => navigate('/tournaments', {
                        state: {
                          claimSourceId: details.main?.sourceId,
                          claimParticipantId: record.id
                        }
                      })}
                    />
                  )
                }
              ]}
            />
          </ResponsiveTableWrapper>
        ) : (
          <Empty description="No Swiss standings were imported for this tournament." />
        )}
      </Card>

      <Card className="bbx-card bbx-top-cut-bracket-card" title="Top Cut Bracket">
        {details.topCut?.bracket?.mainRounds?.length ? (
          <BracketBoard bracket={details.topCut.bracket} />
        ) : (
          <Empty description="No Top Cut bracket was imported for this tournament." />
        )}
      </Card>
    </div>
  );
}

function ParticipantName({ participant }) {
  return (
    <span className="font-black text-bbx-ink">
      {participant.name}
      {participant.claimedBy ? (
        <span className="font-semibold text-bbx-muted">
          {' ('}
          <Link className="font-black text-bbx-red hover:text-bbx-red-dark" to={`/players/${participant.claimedBy}`}>
            {participant.claimedByProfile?.display_name || 'BBX Player'}
          </Link>
          {')'}
        </span>
      ) : null}
    </span>
  );
}

function ClaimParticipantButton({ participant, sourceId, onClaim }) {
  if (participant.claimed) {
    return <Button size="small" disabled>Already claimed</Button>;
  }

  return (
    <Button size="small" type="primary" disabled={!sourceId} onClick={onClaim}>
      Claim
    </Button>
  );
}

function hasSeparateTopCutLink(details) {
  const topCutUrl = details.topCut?.challongeUrl;
  if (!topCutUrl || details.topCut?.sourceType === 'embedded_top_cut') return false;

  return topCutUrl !== details.main?.challongeUrl;
}

function DetailMetric({ label, value }) {
  return (
    <div className="bbx-tournament-detail-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function BracketBoard({ bracket }) {
  const layout = buildBracketLayout(bracket.mainRounds);

  return (
    <div>
      <div className="bbx-bracket-scroll" style={{ height: layout.height }}>
        <div
          className="bbx-bracket-board"
          style={{
            width: layout.width,
            height: layout.height
          }}
        >
          <svg className="bbx-bracket-connectors" width={layout.width} height={layout.height} aria-hidden="true">
            {layout.connectors.map((connector) => (
              <path key={connector.key} d={connector.path} />
            ))}
          </svg>
          {layout.rounds.map((round) => (
            <section
              key={round.round}
              className="bbx-bracket-round"
              style={{ left: round.left, width: BRACKET_LAYOUT.roundWidth }}
            >
              <div className="bbx-bracket-round-title">{round.label}</div>
              <div className="bbx-bracket-round-body">
                {round.matches.map((match) => (
                  <BracketMatch key={match.id} match={match} top={match.top} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
      {bracket.extraMatches?.length ? <ExtraBracketMatches matches={bracket.extraMatches} /> : null}
    </div>
  );
}

function BracketMatch({ match }) {
  return (
    <article className="bbx-bracket-match" style={{ top: match.top }}>
      <BracketPlayer
        name={match.playerOneName}
        seed={match.playerOneSeed}
        score={scoreForPlayer(match.score, 0)}
        winner={match.winnerId && match.winnerId === match.playerOneId}
      />
      <BracketPlayer
        name={match.playerTwoName}
        seed={match.playerTwoSeed}
        score={scoreForPlayer(match.score, 1)}
        winner={match.winnerId && match.winnerId === match.playerTwoId}
      />
    </article>
  );
}

const BRACKET_LAYOUT = {
  roundWidth: 220,
  roundGap: 28,
  headerHeight: 30,
  matchHeight: 44,
  baseGap: 7,
  bottomPadding: 24
};

function buildBracketLayout(rounds) {
  const slot = BRACKET_LAYOUT.matchHeight + BRACKET_LAYOUT.baseGap;
  const maxRoundCount = Math.max(...rounds.map((round) => round.matches.length), 1);
  const width = rounds.length * BRACKET_LAYOUT.roundWidth + Math.max(0, rounds.length - 1) * BRACKET_LAYOUT.roundGap;

  const layoutRounds = rounds.map((round, roundIndex) => {
    const left = roundIndex * (BRACKET_LAYOUT.roundWidth + BRACKET_LAYOUT.roundGap);
    const stride = slot * (maxRoundCount / Math.max(round.matches.length, 1));
    const offset = (stride - BRACKET_LAYOUT.matchHeight) / 2;

    return {
      ...round,
      left,
      matches: round.matches.map((match, matchIndex) => ({
        ...match,
        top: BRACKET_LAYOUT.headerHeight + offset + matchIndex * stride
      }))
    };
  });
  const maxMatchBottom = Math.max(
    ...layoutRounds.flatMap((round) => round.matches.map((match) => match.top + BRACKET_LAYOUT.matchHeight)),
    BRACKET_LAYOUT.headerHeight
  );
  const height = maxMatchBottom + BRACKET_LAYOUT.bottomPadding;

  const connectors = [];
  for (let roundIndex = 0; roundIndex < layoutRounds.length - 1; roundIndex += 1) {
    const round = layoutRounds[roundIndex];
    const nextRound = layoutRounds[roundIndex + 1];

    for (const [matchIndex, match] of round.matches.entries()) {
      const target = findNextBracketMatch(match, nextRound.matches) || nextRound.matches[Math.floor(matchIndex / 2)];
      if (!target) continue;

      const x1 = round.left + BRACKET_LAYOUT.roundWidth;
      const x2 = nextRound.left;
      const xMid = x1 + (x2 - x1) / 2;
      const y1 = match.top + BRACKET_LAYOUT.matchHeight / 2;
      const y2 = target.top + BRACKET_LAYOUT.matchHeight / 2;

      connectors.push({
        key: `${round.round}-${match.id}-${target.id}`,
        path: `M ${x1} ${y1} H ${xMid} V ${y2} H ${x2}`
      });
    }
  }

  return { rounds: layoutRounds, connectors, width, height };
}

function findNextBracketMatch(match, nextMatches) {
  if (!match.winnerId) return null;

  return nextMatches.find((nextMatch) =>
    nextMatch.playerOneId === match.winnerId || nextMatch.playerTwoId === match.winnerId
  ) || null;
}

function ExtraBracketMatches({ matches }) {
  return (
    <div className="bbx-extra-bracket">
      {matches.map((match) => (
        <div key={match.id} className="bbx-extra-bracket-item">
          <div className="bbx-extra-bracket-title">{match.label}</div>
          <BracketMatch match={match} />
        </div>
      ))}
    </div>
  );
}

function MatchHistory({ history = [] }) {
  if (!history.length) return <span className="text-bbx-muted">-</span>;

  return (
    <div className="bbx-match-history-chips">
      {history.map((match, index) => (
        <Tooltip key={`${match.round || index}-${match.result}`} title={matchHistoryTooltip(match)}>
          <span className={`bbx-match-history-chip is-${match.result}`} tabIndex={0}>
            {resultLabel(match.result)}
          </span>
        </Tooltip>
      ))}
    </div>
  );
}

function matchHistoryTooltip(match) {
  const score = match.score || '-';
  const opponent = match.opponentName || 'Unknown opponent';
  return `${score} vs ${opponent}`;
}

function resultLabel(result) {
  if (result === 'win') return 'W';
  if (result === 'loss') return 'L';
  return 'T';
}

function BracketPlayer({ name, seed, score, winner }) {
  return (
    <div className={`bbx-bracket-player ${winner ? 'is-winner' : ''}`}>
      <span className="bbx-bracket-seed">{seed || '-'}</span>
      <span className="bbx-bracket-name">{winner ? <TrophyOutlined /> : null}{name}</span>
      <strong>{score}</strong>
    </div>
  );
}

function scoreForPlayer(score, index) {
  const parts = String(score || '').match(/\d+/g);
  return parts?.[index] || '-';
}
