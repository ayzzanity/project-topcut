import { CalendarOutlined, CrownOutlined, FireOutlined, RiseOutlined, TrophyOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Empty, Modal, Spin, Table, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import PageBreadcrumb from '../components/PageBreadcrumb.jsx';
import ResponsiveTableWrapper from '../components/ResponsiveTableWrapper.jsx';
import StatusTag from '../components/StatusTag.jsx';
import { ErrorCard, LoadingCard } from '../components/StateCard.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { api } from '../lib/apiClient.js';
import { formatDate, formatPlacement, titleize } from '../utils/formatters.js';

export default function ProfilePage() {
  const { user, profile } = useAuth();
  const { userId: routeUserId } = useParams();
  const [stats, setStats] = useState(null);
  const [recentHistory, setRecentHistory] = useState([]);
  const [overallRank, setOverallRank] = useState(null);
  const [monthlyRank, setMonthlyRank] = useState(null);
  const [selectedHistoryRecord, setSelectedHistoryRecord] = useState(null);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [historyDetails, setHistoryDetails] = useState(null);
  const [loadingHistoryDetails, setLoadingHistoryDetails] = useState(false);
  const [historyDetailsError, setHistoryDetailsError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const targetUserId = routeUserId || user.id;
  const isOwnProfile = targetUserId === user.id;

  async function loadStats() {
    setLoading(true);
    setError(null);
    try {
      const [nextStats, leaderboard, monthlyLeaderboard, history] = await Promise.all([
        api.getPlayerStats(targetUserId),
        api.getLeaderboard(),
        api.getMonthlyLeaderboard(),
        api.getPlayerHistory(targetUserId)
      ]);
      setStats(nextStats);
      setRecentHistory(history || []);
      setOverallRank((leaderboard || []).findIndex((row) => row.user_id === targetUserId) + 1 || null);
      setMonthlyRank((monthlyLeaderboard || []).findIndex((row) => row.user_id === targetUserId) + 1 || null);
    } catch (nextError) {
      setError(nextError);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStats();
  }, [targetUserId]);

  async function openHistoryDetails(record) {
    setSelectedHistoryRecord(record);
    setHistoryDetails(null);
    setHistoryDetailsError(null);
    setLoadingHistoryDetails(true);

    try {
      setHistoryDetails(await api.getPlayerHistoryDetails(targetUserId, record.id));
    } catch (nextError) {
      setHistoryDetailsError(nextError);
    } finally {
      setLoadingHistoryDetails(false);
    }
  }

  function closeHistoryDetails() {
    setSelectedHistoryRecord(null);
    setHistoryDetails(null);
    setHistoryDetailsError(null);
  }

  if (loading) return <LoadingCard message="Loading your stats..." />;
  if (error) return <ErrorCard error={error} onRetry={loadStats} />;

  const displayName = stats?.display_name || (isOwnProfile ? profile?.display_name : null) || 'BBX Player';
  const totalPoints = stats?.total_points || 0;
  const verifiedPoints = stats?.verified_points || 0;
  const validWins = stats?.total_valid_wins || 0;
  const totalEvents = stats?.tournament_count || 0;
  const verifiedEvents = stats?.approved_tournament_count || 0;
  const pendingEvents = stats?.pending_tournament_count || 0;
  const podiumFinishCount =
    stats?.podium_finish_count ??
    (stats?.champion_count || 0) +
      (stats?.finisher_count || 0) +
      (stats?.third_place_count || 0) +
      (stats?.fourth_place_count || 0);
  const bladerOfMonthCount = stats?.blader_of_month_count || 0;
  const winRate = stats?.total_matches ? `${Math.round((validWins / stats.total_matches) * 1000) / 10}%` : 'N/A';
  const sortedHistory = [...recentHistory].sort(sortHistoryByLatest);
  const latestHistory = sortedHistory.slice(0, 5);
  const historyColumns = [
    {
      title: 'Tournament',
      dataIndex: 'tournament_name',
      render: (value, record) => (
        <Button className="bbx-history-tournament-link" type="link" onClick={() => openHistoryDetails(record)}>
          {value}
        </Button>
      )
    },
    { title: 'Alias Used', dataIndex: 'player_name' },
    {
      title: 'Swiss Record',
      dataIndex: 'swiss_record'
    },
    {
      title: 'Placement',
      dataIndex: 'final_placement',
      render: (value, record) => (
        <span>
          <Tag color={placementTagColor(value)}>{formatPlacement(value)}</Tag>
          {record.isSwissKing && <Tag color="gold">SWISS KING</Tag>}
        </span>
      )
    },
    {
      title: 'Points Earned',
      dataIndex: 'total_points',
      render: (value, record) => <PointsDisplay total={value} verified={record.verified_points} />
    },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (value) => <StatusTag status={value} />
    },
    { title: 'Date', dataIndex: 'event_date', render: formatDate }
  ];
  const currentMonthLabel = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    timeZone: 'Asia/Manila',
    year: 'numeric'
  }).format(new Date());

  return (
    <div className="bbx-profile-page">
      <PageBreadcrumb items={[{ label: 'Profile', to: '/profile' }, { label: isOwnProfile ? 'My Profile' : displayName }]} />

      <div className="bbx-profile-grid">
        <main className="min-w-0">
          <Card className="bbx-card bbx-profile-hero">
            <div className="bbx-profile-player">
              <img src="/brand/zamboanga-fallen-logo.jpg" alt="" className="bbx-profile-avatar" />
              <div>
                <Typography.Title level={2} className="m-0 text-bbx-ink">
                  {displayName}
                </Typography.Title>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Tag className="bbx-profile-rank-tag" color="red">
                    <TrophyOutlined /> {overallRank ? `#${overallRank} Overall Rank` : 'Overall Unranked'}
                  </Tag>
                  <Tag className="bbx-profile-rank-tag" color="gold">
                    <CalendarOutlined />{' '}
                    {monthlyRank ? `${currentMonthLabel} #${monthlyRank}` : `${currentMonthLabel} Unranked`}
                  </Tag>
                </div>
                <p className="mt-3 max-w-xs text-sm leading-6 text-bbx-muted">
                  Includes submitted tournament records. Verified points are shown separately.
                </p>
              </div>
            </div>
            <div className="bbx-profile-points">
              <span className="bbx-profile-points-laurel" aria-hidden="true" />
              <div className="text-xs font-black uppercase text-bbx-muted">Total Points</div>
              <div className="bbx-profile-points-value stat-number">{totalPoints}</div>
              <div className="text-xs font-semibold text-bbx-muted">({verifiedPoints} pts verified)</div>
            </div>
          </Card>

          <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <ProfileStat
              icon={<CalendarOutlined />}
              label="Tournaments Joined"
              value={totalEvents}
              hint={`${verifiedEvents} verified${pendingEvents ? `, ${pendingEvents} unverified` : ''}`}
            />
            <ProfileStat icon={<FireOutlined />} label="Total Match Wins" value={validWins} hint="Wins" />
            <ProfileStat
              icon={<RiseOutlined />}
              label="Win Rate"
              value={winRate}
              hint={stats?.total_matches ? `Of ${stats.total_matches} matches` : 'Needs match total'}
            />
            <ProfileStat icon={<CrownOutlined />} label="Champion" value={stats?.champion_count || 0} hint="First Place" />
            <ProfileStat icon={<TrophyOutlined />} label="Finisher" value={stats?.finisher_count || 0} hint="Second Place" />
            <ProfileStat
              icon={<CrownOutlined />}
              label="Swiss King"
              value={stats?.swiss_king_count || 0}
              hint={`${stats?.swiss_king_count === 1 ? 'time' : 'times'}`}
            />
          </section>

          <Card
            className="bbx-card bbx-profile-history"
            title="Recent Tournament History"
            extra={
              <Button
                className="bbx-outline-button"
                disabled={sortedHistory.length <= 5}
                onClick={() => setShowAllHistory(true)}
              >
                View All History
              </Button>
            }
          >
            {recentHistory.length ? (
              <ResponsiveTableWrapper>
                <Table
                  size="small"
                  rowKey={(row) => row.id || `${row.tournament_name}-${row.date}`}
                  dataSource={latestHistory}
                  pagination={false}
                  scroll={{ x: 760 }}
                  columns={historyColumns}
                />
              </ResponsiveTableWrapper>
            ) : (
              <Empty description="Recent tournament history is not available yet." />
            )}
          </Card>
        </main>

        <aside className="bbx-profile-sidebar">
          <Card className="bbx-card bbx-achievements-card" title="Achievements">
            <Achievement
              icon={<TrophyOutlined />}
              title="Champion"
              detail={`${stats?.champion_count || 0} time${stats?.champion_count === 1 ? '' : 's'}`}
            />
            <Achievement
              icon={<RiseOutlined />}
              title="Podium Finish"
              detail={`${podiumFinishCount} finish${podiumFinishCount === 1 ? '' : 'es'}`}
            />
            <Achievement
              icon={<CrownOutlined />}
              title="Swiss King"
              detail={`${stats?.swiss_king_count || 0} award${stats?.swiss_king_count === 1 ? '' : 's'}`}
            />
            <Achievement
              icon={<CalendarOutlined />}
              title="Blader of the Month"
              detail={`${bladerOfMonthCount} month${bladerOfMonthCount === 1 ? '' : 's'}`}
            />
            <div className="bbx-profile-callout">
              <TrophyOutlined />
              <div>
                <strong>{overallRank === 1 ? 'Top Local Player' : 'Keep Climbing'}</strong>
                <p>
                  {overallRank === 1
                    ? 'Keep competing to defend your rank.'
                    : 'Submit results to climb while admin review catches up.'}
                </p>
              </div>
            </div>
          </Card>
        </aside>
      </div>

      <Modal
        className="bbx-history-details-modal"
        open={Boolean(selectedHistoryRecord)}
        width={820}
        title={selectedHistoryRecord?.tournament_name || 'Tournament Details'}
        onCancel={closeHistoryDetails}
        footer={
          <Button type="primary" onClick={closeHistoryDetails}>
            Close
          </Button>
        }
      >
        {loadingHistoryDetails ? (
          <div className="flex min-h-48 items-center justify-center">
            <Spin />
          </div>
        ) : historyDetailsError ? (
          <Alert
            type="error"
            showIcon
            message="Could not load tournament details"
            description={historyDetailsError.message}
          />
        ) : historyDetails ? (
          <HistoryDetails details={historyDetails} />
        ) : null}
      </Modal>

      <Modal
        className="bbx-history-all-modal"
        open={showAllHistory}
        width={1100}
        title={`All Tournament History ${recentHistory.length ? `(${recentHistory.length})` : ''}`}
        onCancel={() => setShowAllHistory(false)}
        footer={
          <Button type="primary" onClick={() => setShowAllHistory(false)}>
            Close
          </Button>
        }
      >
        <ResponsiveTableWrapper>
          <Table
            size="small"
            rowKey={(row) => row.id || `${row.tournament_name}-${row.date}`}
            dataSource={sortedHistory}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            scroll={{ x: 760 }}
            columns={historyColumns}
          />
        </ResponsiveTableWrapper>
      </Modal>
    </div>
  );
}

function HistoryDetails({ details }) {
  const pointRows = (details.pointBreakdown || []).map((row, index) => ({
    ...row,
    key: row.key || `${row.label}-${index}`
  }));
  const matchRows = details.matches || [];

  return (
    <div className="bbx-history-details">
      <div className="bbx-history-summary-table">
        <DetailSummaryItem label="Player" value={details.playerName} />
        <DetailSummaryItem label="Tournament Date" value={formatDate(details.eventDate)} />
        <DetailSummaryItem label="Swiss Record" value={details.swissRecord} />
        <DetailSummaryItem label="Final Placement" value={formatPlacement(details.finalPlacement)} subtle />
        <DetailSummaryItem label="Top Cut" value={details.topCutEntry ? 'Entered' : 'Not entered'} />
        <DetailSummaryItem label="Swiss King" value={details.isSwissKing ? 'Yes' : 'No'} />
        <DetailSummaryItem label="Status" value={<StatusTag status={details.status} />} />
        <div className="bbx-history-summary-total">
          <span>Total Points</span>
          <strong>
            {details.totalPoints}
            <small> ({details.verifiedPoints || 0} pts verified)</small>
          </strong>
        </div>
      </div>

      <h3 className="bbx-history-detail-title">Points Calculation</h3>
      <Table
        size="small"
        rowKey="key"
        dataSource={pointRows}
        pagination={false}
        columns={[
          { title: 'Item', dataIndex: 'label' },
          { title: 'Value', dataIndex: 'value' },
          {
            title: 'Points',
            dataIndex: 'points',
            align: 'right',
            render: (value) => <strong className="text-bbx-red">{value}</strong>
          }
        ]}
      />

      <h3 className="bbx-history-detail-title">Match Results</h3>
      <Table
        size="small"
        rowKey="id"
        dataSource={matchRows}
        pagination={false}
        rowClassName={(record, index) =>
          record.stage === 'top_cut' && matchRows[index - 1]?.stage !== 'top_cut' ? 'bbx-match-stage-divider' : ''
        }
        locale={{ emptyText: 'No persisted match results for this tournament.' }}
        columns={[
          {
            title: 'Stage',
            dataIndex: 'stage',
            width: '48%',
            render: (value, record) => (
              <span>
                <Tag color={value === 'swiss' ? 'gray' : 'gold'}>{titleize(value).toUpperCase()}</Tag>
                <span> vs {record.opponentName}</span>
              </span>
            )
          },
          { title: 'Match', dataIndex: 'round', render: (value) => value || 'N/A' },
          { title: 'Score', dataIndex: 'score', render: (value) => value || '-' },
          {
            title: 'Result',
            dataIndex: 'result',
            render: (value) => (
              <Tag color={value === 'win' ? 'green' : value === 'loss' ? 'red' : 'gold'}>
                {titleize(value).toUpperCase()}
              </Tag>
            )
          }
        ]}
      />
      {matchRows.some((match) => match.round == null) ? (
        <p className="bbx-match-round-note">
          N/A matches are extra bracket matches, such as a battle for third place or another placement match.
        </p>
      ) : null}
    </div>
  );
}

function DetailSummaryItem({ label, value, subtle = false }) {
  return (
    <div className="bbx-history-summary-cell">
      <span>{label}</span>
      <strong className={subtle ? 'is-subtle' : ''}>{value}</strong>
    </div>
  );
}

function PointsDisplay({ total = 0, verified = 0 }) {
  return (
    <span>
      <strong>{total || 0}</strong>
      <span className="ml-2 text-xs font-semibold text-bbx-muted">({verified || 0} pts verified)</span>
    </span>
  );
}

function placementTagColor(placement) {
  const rank = Number(placement);
  if (!rank) return 'default';
  if (rank === 1) return 'gold';
  if (rank === 2) return 'default';
  if (rank === 3) return 'volcano';
  return 'blue';
}

function sortHistoryByLatest(a, b) {
  return historyTimestamp(b) - historyTimestamp(a);
}

function historyTimestamp(record) {
  const value = record?.event_date || record?.date || record?.created_at;
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function ProfileStat({ icon, label, value, hint, success = false }) {
  return (
    <Card className="bbx-card bbx-profile-stat">
      <div className={`bbx-profile-stat-icon ${success ? 'is-success' : ''}`}>{icon}</div>
      <div>
        <div className="text-xs font-black uppercase text-bbx-muted">{label}</div>
        <div className={`stat-number mt-1 text-3xl font-black leading-none ${success ? 'text-green-700' : 'text-bbx-ink'}`}>
          {success ? <Tag color="green">{value}</Tag> : value}
        </div>
        <div className="mt-2 text-xs font-semibold text-bbx-muted">{hint}</div>
      </div>
    </Card>
  );
}

function Achievement({ icon, title, detail }) {
  return (
    <div className="bbx-achievement">
      <div className="bbx-achievement-icon">{icon}</div>
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
    </div>
  );
}
