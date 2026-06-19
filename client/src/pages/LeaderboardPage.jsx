import {
  BarChartOutlined,
  CalendarOutlined,
  CrownOutlined,
  DownOutlined,
  FilterOutlined,
  SearchOutlined,
  StarFilled,
  TeamOutlined,
  TrophyOutlined
} from '@ant-design/icons';
import { Button, Card, Divider, Dropdown, Empty, Segmented, Select, Spin, Table } from 'antd';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageBreadcrumb from '../components/PageBreadcrumb.jsx';
import RankingBadge from '../components/RankingBadge.jsx';
import ResponsiveTableWrapper from '../components/ResponsiveTableWrapper.jsx';
import { ErrorCard } from '../components/StateCard.jsx';
import { api } from '../lib/apiClient.js';
import { formatDate } from '../utils/formatters.js';

const MONTH_OPTIONS = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' }
];

export default function LeaderboardPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [queueType, setQueueType] = useState('casual');
  const [mode, setMode] = useState('overall');
  const [customYear, setCustomYear] = useState(currentManilaYear());
  const [customMonth, setCustomMonth] = useState(undefined);

  async function loadLeaderboard(nextMode = mode, nextCustomFilter = { year: customYear, month: customMonth }) {
    setLoading(true);
    setError(null);
    try {
      let nextRows;

      if (nextMode === 'current-month') {
        nextRows = await api.getMonthlyLeaderboard();
      } else if (nextMode === 'current-year') {
        nextRows = await api.getFilteredLeaderboard({ year: currentManilaYear() });
      } else if (nextMode === 'custom') {
        nextRows = await api.getFilteredLeaderboard(nextCustomFilter);
      } else {
        nextRows = await api.getLeaderboard();
      }

      setRows(nextRows);
    } catch (nextError) {
      setError(nextError);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLeaderboard();
  }, []);

  const currentYear = currentManilaYear();
  const currentMonth = currentManilaMonth();
  const yearOptions = buildYearOptions(currentYear);
  const rankedRows = rows.map((row, index) => ({ ...row, rank: index + 1 }));
  const topPlayers = [rankedRows[0] || null, rankedRows[1] || null, rankedRows[2] || null];
  const summaryLabel = buildFilterSummary(mode, currentYear, currentMonth, customYear, customMonth);

  function handleQuickFilter(nextMode) {
    setMode(nextMode);
    loadLeaderboard(nextMode, { year: customYear, month: customMonth });
  }

  function handleApplyCustomFilter() {
    const nextFilter = { year: customYear, month: customMonth };
    setMode('custom');
    loadLeaderboard('custom', nextFilter);
  }

  return (
    <div className="bbx-leaderboard-page">
      <PageBreadcrumb items={[{ label: 'Leaderboard' }]} />

      <div className="bbx-leaderboard-filterbar">
        <div className="bbx-leaderboard-filterbar-group">
          <Segmented
            className="bbx-leaderboard-queue-toggle"
            value={queueType}
            options={[
              {
                label: (
                  <span className="bbx-leaderboard-filter-option">
                    <TeamOutlined />
                    <span>Casual</span>
                  </span>
                ),
                value: 'casual'
              },
              {
                label: (
                  <span className="bbx-leaderboard-filter-option">
                    <TrophyOutlined />
                    <span>Ranked</span>
                  </span>
                ),
                value: 'ranked'
              }
            ]}
            onChange={(value) => setQueueType(value)}
          />
        </div>

        <Divider type="vertical" className="bbx-leaderboard-filter-divider" />

        <div className="bbx-leaderboard-filterbar-group">
          <Segmented
            className="bbx-leaderboard-mode-toggle"
            value={mode === 'current-year' || mode === 'current-month' ? mode : 'overall'}
            options={[
              {
                label: (
                  <span className="bbx-leaderboard-filter-option">
                    <BarChartOutlined />
                    <span>Overall</span>
                  </span>
                ),
                value: 'overall'
              },
              {
                label: (
                  <span className="bbx-leaderboard-filter-option">
                    <CalendarOutlined />
                    <span>{currentYear}</span>
                  </span>
                ),
                value: 'current-year'
              },
              {
                label: (
                  <span className="bbx-leaderboard-filter-option">
                    <CalendarOutlined />
                    <span>{currentMonth.shortLabel}</span>
                  </span>
                ),
                value: 'current-month'
              }
            ]}
            onChange={(value) => handleQuickFilter(value)}
          />
        </div>

        <div className="bbx-leaderboard-header-actions">
          <Dropdown
            trigger={['click']}
            placement="bottomRight"
            menu={{ items: [] }}
            dropdownRender={() => (
              <div className="bbx-leaderboard-filter-dropdown">
                <div className="bbx-leaderboard-filter-dropdown-title">Specific Month / Year</div>
                <div className="bbx-leaderboard-filter-dropdown-panel">
                  <Select
                    className="bbx-leaderboard-filter-select"
                    placeholder="Select year"
                    value={customYear}
                    options={yearOptions}
                    onChange={(value) => setCustomYear(value)}
                  />
                  <Select
                    allowClear
                    className="bbx-leaderboard-filter-select"
                    placeholder="Whole year"
                    value={customMonth}
                    options={MONTH_OPTIONS}
                    onChange={(value) => setCustomMonth(value)}
                  />
                  <Button type="primary" icon={<SearchOutlined />} onClick={handleApplyCustomFilter}>
                    Apply
                  </Button>
                </div>
              </div>
            )}
          >
            <Button
              type={mode === 'custom' ? 'primary' : 'default'}
              className={mode === 'custom' ? undefined : 'bbx-outline-button'}
              icon={<CalendarOutlined />}
            >
              Custom Range <DownOutlined />
            </Button>
          </Dropdown>
        </div>
      </div>

      <Card className="bbx-card bbx-leaderboard-shell">

        {loading ? (
          <div className="flex min-h-40 items-center justify-center gap-3 py-8">
            <Spin />
            <span className="text-bbx-muted">Loading leaderboard...</span>
          </div>
        ) : error ? (
          <ErrorCard error={error} onRetry={loadLeaderboard} />
        ) : rows.length === 0 ? (
          <div className="py-10">
            <Empty description={`No tournament results found for ${summaryLabel.toLowerCase()}.`} />
          </div>
        ) : (
          <>
            <section className="bbx-podium-grid mb-5">
              <PodiumCard player={topPlayers[1]} rank={2} />
              <PodiumCard player={topPlayers[0]} rank={1} featured />
              <PodiumCard player={topPlayers[2]} rank={3} />
            </section>

            <div className="bbx-leaderboard-table-card">
              <ResponsiveTableWrapper>
                <Table
                  rowKey="user_id"
                  dataSource={rankedRows}
                  scroll={{ x: 980 }}
                  pagination={rankedRows.length > 10 ? { pageSize: 10, showSizeChanger: false } : false}
                  columns={[
                    {
                      title: 'Rank',
                      dataIndex: 'rank',
                      width: 100,
                      render: (rank) => <RankingBadge rank={rank} />
                    },
                    {
                      title: 'Player',
                      dataIndex: 'display_name',
                      sorter: (a, b) => a.display_name.localeCompare(b.display_name),
                      render: (value, record) => <PlayerCell name={value} userId={record.user_id} />
                    },
                    {
                      title: 'Points',
                      dataIndex: 'total_points',
                      sorter: (a, b) => a.total_points - b.total_points,
                      render: (value, record) => <PointsDisplay total={value} verified={record.verified_points} />
                    },
                    { title: 'Champion', dataIndex: 'champion_count' },
                    { title: 'Swiss King', dataIndex: 'swiss_king_count' },
                    { title: 'Match Wins', dataIndex: 'total_valid_wins' },
                    {
                      title: 'Tournaments',
                      dataIndex: 'tournament_count',
                      render: (value, record) => `${value || 0} (${record.approved_tournament_count || 0} verified)`
                    },
                    {
                      title: 'Most Recent',
                      dataIndex: 'most_recent_tournament_date',
                      render: formatDate
                    }
                  ]}
                />
              </ResponsiveTableWrapper>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function PodiumCard({ player, rank, featured = false }) {
  const cardClassName = `bbx-card bbx-podium-card ${featured ? 'is-featured' : 'is-empty'}`;

  if (!player) {
    return (
      <Card className={cardClassName}>
        <div className={`bbx-podium-ribbon rank-${rank}`}>{rank}</div>
        <div className="bbx-podium-empty">
          <div className="bbx-podium-empty-icon">
            <CrownOutlined />
          </div>
          <div className="font-black text-bbx-muted">No player yet</div>
        </div>

        <div className="bbx-podium-metrics">
          <MiniMetric icon={<TrophyOutlined />} label="Champion" value="-" />
          <MiniMetric icon={<CrownOutlined />} label="Swiss King" value="-" />
          <MiniMetric icon={<StarFilled />} label="Match Wins" value="-" />
          <MiniMetric icon={<CalendarOutlined />} label="Tournaments" value="-" />
        </div>
      </Card>
    );
  }

  return (
    <Link to={`/players/${player.user_id}`} className="bbx-podium-card-link">
      <Card className={cardClassName}>
        <div className={`bbx-podium-ribbon rank-${rank}`}>{rank}</div>
        <div className="bbx-podium-logo-wrap">
          {featured ? <CrownOutlined className="bbx-podium-crown" /> : null}
          <span className={`bbx-podium-laurel rank-${rank}`} aria-hidden="true" />
          <img src="/brand/zamboanga-pincers-logo.jpg" alt="" className="bbx-podium-logo" />
        </div>
        <div className="mt-3 text-center">
          <div className="bbx-podium-player-name text-2xl font-black leading-tight text-bbx-ink">{player.display_name}</div>
          <div className="stat-number mt-2 text-4xl font-black leading-none text-bbx-red">{player.total_points || 0}</div>
          <div className="text-xs font-black uppercase text-bbx-red">points</div>
          <div className="mt-1 text-xs font-semibold text-bbx-muted">{player.verified_points || 0} pts verified</div>
        </div>

        <div className="bbx-podium-metrics">
          <MiniMetric icon={<TrophyOutlined />} label="Champion" value={player?.champion_count ?? '-'} />
          <MiniMetric icon={<CrownOutlined />} label="Swiss King" value={player?.swiss_king_count ?? '-'} />
          <MiniMetric icon={<StarFilled />} label="Match Wins" value={player?.total_valid_wins ?? '-'} />
          <MiniMetric icon={<CalendarOutlined />} label="Tournaments" value={player?.tournament_count ?? '-'} />
        </div>
      </Card>
    </Link>
  );
}

function PointsDisplay({ total = 0, verified = 0 }) {
  return (
    <div>
      <strong className="text-xl text-bbx-red">{total || 0}</strong>
      <div className="text-xs font-semibold text-bbx-muted">({verified || 0} pts verified)</div>
    </div>
  );
}

function MiniMetric({ icon, label, value }) {
  return (
    <div className="text-center">
      <div className="font-black text-bbx-red">
        <span className="mr-1">{icon}</span>
        {value}
      </div>
      <div className="mt-1 text-[11px] font-semibold text-bbx-ink">{label}</div>
    </div>
  );
}

function PlayerCell({ name, userId }) {
  return (
    <div className="flex items-center gap-3">
      <img src="/brand/zamboanga-pincers-logo.jpg" alt="" className="h-9 w-9 rounded object-contain" />
      <Link to={`/players/${userId}`} className="bbx-leaderboard-player-link font-black text-bbx-ink">
        {name}
      </Link>
    </div>
  );
}

function currentManilaYear() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric'
  }).format(new Date());
}

function currentManilaMonth() {
  const currentDate = new Date();
  const value = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    month: '2-digit'
  }).format(currentDate);
  const shortLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short'
  }).format(currentDate);

  return { value, shortLabel };
}

function buildYearOptions(currentYear) {
  const startYear = Number(currentYear);
  return Array.from({ length: 3 }, (_, index) => {
    const value = String(startYear - index);
    return { value, label: value };
  });
}

function buildFilterSummary(mode, currentYear, currentMonth, customYear, customMonth) {
  if (mode === 'current-month') {
    return `${currentMonth.shortLabel} ${currentYear} leaderboard`;
  }

  if (mode === 'current-year') {
    return `${currentYear} leaderboard`;
  }

  if (mode === 'custom') {
    const monthLabel = MONTH_OPTIONS.find((option) => option.value === customMonth)?.label;
    return monthLabel ? `${monthLabel} ${customYear}` : `${customYear} leaderboard`;
  }

  return 'Overall leaderboard';
}
