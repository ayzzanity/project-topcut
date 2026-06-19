import {
  CheckOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  EyeOutlined,
  ExportOutlined,
  FlagOutlined,
  ReloadOutlined,
  SearchOutlined,
  WarningFilled
} from '@ant-design/icons';
import {
  Alert,
  Badge,
  Button,
  Card,
  Descriptions,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import ResponsiveTableWrapper from '../components/ResponsiveTableWrapper.jsx';
import { EmptyCard, ErrorCard, LoadingCard } from '../components/StateCard.jsx';
import StatusTag from '../components/StatusTag.jsx';
import { api } from '../lib/apiClient.js';
import { formatDate, formatPlacement, titleize } from '../utils/formatters.js';

export default function AdminReviewPage() {
  const [flags, setFlags] = useState([]);
  const [pendingRecords, setPendingRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [decidingId, setDecidingId] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [reviewTarget, setReviewTarget] = useState(null);
  const [activeTab, setActiveTab] = useState('pending');

  async function loadReviewData() {
    setLoading(true);
    setError(null);
    try {
      const [nextPendingRecords, nextFlags] = await Promise.all([api.getPendingRecords(), api.getReviewFlags()]);
      setPendingRecords(nextPendingRecords);
      setFlags(nextFlags);
    } catch (nextError) {
      setError(nextError);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReviewData();
  }, []);

  async function decide(item, status) {
    const recordId = item.player_record_id || item.id;
    const actionLabel = status === 'approved' ? 'Verify' : 'Reject';
    Modal.confirm({
      title: `${actionLabel} this record?`,
      content:
        status === 'approved'
          ? 'This verifies the player tournament record and includes it in rankings.'
          : 'This permanently removes the submitted record and releases the participant name so it can be imported again.',
      okText: actionLabel,
      okButtonProps: { danger: status === 'rejected' },
      async onOk() {
        setDecidingId(item.id);
        try {
          await api.decideRecord(recordId, status);
          message.success(status === 'approved' ? 'Record verified.' : 'Record rejected.');
          setReviewTarget(null);
          await loadReviewData();
        } finally {
          setDecidingId(null);
        }
      }
    });
  }

  const filteredPendingRecords = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return pendingRecords;
    return pendingRecords.filter((record) => {
      const haystack = [record.tournament?.name, record.submitted_by_profile?.display_name, record.player_name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [pendingRecords, query]);

  const filteredFlags = useMemo(() => {
    return flags.filter((flag) => severityFilter === 'all' || flag.severity === severityFilter);
  }, [flags, severityFilter]);

  if (loading) return <LoadingCard message="Loading review queues..." />;
  if (error) return <ErrorCard error={error} onRetry={loadReviewData} />;

  const hasPendingRecords = pendingRecords.length > 0;
  const hasFlags = flags.length > 0;
  const highSeverityCount = flags.filter((flag) => flag.severity === 'high').length;

  return (
    <div className="bbx-admin-page">
      <div className="mb-5 flex justify-end">
        <Button className="bbx-outline-button" icon={<ReloadOutlined />} onClick={loadReviewData}>
          Refresh
        </Button>
      </div>

      {!hasPendingRecords && !hasFlags ? (
        <EmptyCard description="No pending records or open review flags." />
      ) : (
        <>
          <section className="mb-7 grid gap-5 md:grid-cols-3">
            <AdminSummaryCard
              tone="pending"
              icon={<ClockCircleOutlined />}
              label="Pending Records"
              value={pendingRecords.length}
              hint="Waiting for review"
            />
            <AdminSummaryCard
              tone="flags"
              icon={<FlagOutlined />}
              label="Open Review Flags"
              value={flags.length}
              hint="Need attention"
            />
            <AdminSummaryCard
              tone="danger"
              icon={<WarningFilled />}
              label="High Severity Flags"
              value={highSeverityCount}
              hint="Require immediate review"
            />
          </section>

          <Tabs
            className="bbx-admin-tabs"
            activeKey={activeTab}
            onChange={setActiveTab}
            items={[
              {
                key: 'pending',
                label: (
                  <span>
                    Pending Records <Badge count={pendingRecords.length} size="small" />
                  </span>
                ),
                children: (
                  <PendingRecordsCard
                    records={filteredPendingRecords}
                    query={query}
                    setQuery={setQuery}
                    decidingId={decidingId}
                    decide={decide}
                    onReview={(record) => setReviewTarget({ type: 'record', item: record })}
                  />
                )
              },
              {
                key: 'flags',
                label: (
                  <span>
                    Open Review Flags <Badge count={flags.length} size="small" />
                  </span>
                ),
                children: (
                  <ReviewFlagsCard
                    flags={filteredFlags}
                    severityFilter={severityFilter}
                    setSeverityFilter={setSeverityFilter}
                    decidingId={decidingId}
                    onReview={(flag) => setReviewTarget({ type: 'flag', item: flag })}
                  />
                )
              }
            ]}
          />

          <Alert
            className="mt-5"
            type="info"
            showIcon
            message="Note: Pending records appear as unverified in leaderboards and profiles. Admin verification moves their points into the verified subtotal."
          />
        </>
      )}

      <ReviewDetailsModal
        target={reviewTarget}
        relatedRecord={
          reviewTarget?.type === 'flag'
            ? pendingRecords.find((record) => record.id === reviewTarget.item.player_record_id)
            : reviewTarget?.item
        }
        relatedFlags={
          reviewTarget?.type === 'record'
            ? flags.filter((flag) => flag.player_record_id === reviewTarget.item.id)
            : reviewTarget
              ? [reviewTarget.item]
              : []
        }
        decidingId={decidingId}
        onClose={() => setReviewTarget(null)}
        onDecide={decide}
        onReviewFlags={(relatedFlags) => {
          setSeverityFilter('all');
          setActiveTab('flags');
          setReviewTarget({ type: 'flag', item: relatedFlags[0] });
        }}
      />
    </div>
  );
}

function PendingRecordsCard({ records, query, setQuery, decidingId, decide, onReview }) {
  return (
    <Card
      className="bbx-card bbx-admin-table-card"
      title={
        <div>
          <div>
            Pending Records <Badge count={records.length} size="small" />
          </div>
          <p>Tournament records waiting for your decision.</p>
        </div>
      }
      extra={
        <Space>
          <Select value="all" options={[{ value: 'all', label: 'All' }]} className="w-24" />
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Search player or tournament..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </Space>
      }
    >
      <ResponsiveTableWrapper>
        <Table
          className="bbx-admin-pending-table"
          rowKey="id"
          dataSource={records}
          pagination={{ pageSize: 5, showSizeChanger: false }}
          columns={[
            {
              title: 'Tournament',
              render: (_, record) => (
                <Space direction="vertical" size={0}>
                  <Typography.Text strong>{record.tournament?.name || 'Unknown tournament'}</Typography.Text>
                  <Typography.Text className="bbx-admin-event-date" type="secondary">
                    {record.tournament?.event_date ? formatDate(record.tournament.event_date) : 'Event date not provided'}
                  </Typography.Text>
                </Space>
              )
            },
            {
              title: 'Player',
              render: (_, record) => record.submitted_by_profile?.display_name || record.player_name
            },
            { title: 'Claim (Alias)', dataIndex: 'player_name' },
            {
              title: 'Points',
              dataIndex: 'total_points',
              render: (value) => <strong className="text-bbx-red">{value}</strong>
            },
            { title: 'Swiss Wins', dataIndex: 'swiss_wins' },
            { title: 'Final', dataIndex: 'final_placement', render: formatPlacement },
            {
              title: 'Flags',
              dataIndex: 'review_flags',
              render: (reviewFlags = []) =>
                reviewFlags.length ? (
                  <StatusTag status="review">{reviewFlags.length} open</StatusTag>
                ) : (
                  <StatusTag status="clean">Clean</StatusTag>
                )
            },
            { title: 'Submitted', dataIndex: 'created_at', render: formatDate },
            {
              title: 'Action',
              width: 190,
              render: (_, record) => (
                <Space className="bbx-admin-row-actions" size={8}>
                  <Button
                    type="primary"
                    size="small"
                    icon={<EyeOutlined />}
                    loading={decidingId === record.id}
                    onClick={() => onReview(record)}
                  >
                    Review
                  </Button>
                  <Button
                    size="small"
                    danger
                    icon={<CloseOutlined />}
                    loading={decidingId === record.id}
                    onClick={() => decide(record, 'rejected')}
                  >
                    Reject
                  </Button>
                </Space>
              )
            }
          ]}
        />
      </ResponsiveTableWrapper>
    </Card>
  );
}

function ReviewFlagsCard({ flags, severityFilter, setSeverityFilter, decidingId, onReview }) {
  return (
    <Card
      className="bbx-card bbx-admin-table-card"
      title={
        <div>
          <div>
            Open Review Flags <Badge count={flags.length} size="small" />
          </div>
          <p>Records that need investigation or additional action.</p>
        </div>
      }
      extra={
        <Space>
          {['all', 'high', 'medium', 'low'].map((severity) => (
            <Button
              key={severity}
              size="small"
              className={severityFilter === severity ? 'bbx-admin-filter is-active' : 'bbx-admin-filter'}
              onClick={() => setSeverityFilter(severity)}
            >
              {severity === 'all' ? 'All' : titleize(severity)}
            </Button>
          ))}
        </Space>
      }
    >
      <ResponsiveTableWrapper>
        <Table
          rowKey="id"
          dataSource={flags}
          scroll={{ x: 980 }}
          pagination={{ pageSize: 5, showSizeChanger: false }}
          columns={[
            {
              title: 'Severity',
              dataIndex: 'severity',
              render: (severity) => <SeverityTag severity={severity} />
            },
            { title: 'Flag', dataIndex: 'flag_type', render: titleize },
            { title: 'Message', dataIndex: 'message', width: 360 },
            { title: 'Created', dataIndex: 'created_at', render: formatDate },
            {
              title: 'Record',
              dataIndex: 'player_record_id',
              render: (value) => <span className="font-mono text-xs">{value}</span>
            },
            {
              title: 'Action',
              fixed: 'right',
              width: 110,
              render: (_, flag) => (
                <Button
                  className="bbx-admin-review-button"
                  type="primary"
                  size="small"
                  icon={<EyeOutlined />}
                  loading={decidingId === flag.id}
                  onClick={() => onReview(flag)}
                >
                  Review
                </Button>
              )
            }
          ]}
        />
      </ResponsiveTableWrapper>
    </Card>
  );
}

function AdminSummaryCard({ tone, icon, label, value, hint }) {
  return (
    <Card className={`bbx-card bbx-admin-summary is-${tone}`}>
      <div className="bbx-admin-summary-icon">{icon}</div>
      <div>
        <div className="text-xs font-black uppercase text-bbx-muted">{label}</div>
        <div className="stat-number mt-1 text-3xl font-black leading-none text-bbx-ink">{value}</div>
        <div className="mt-2 text-xs font-semibold text-bbx-muted">{hint}</div>
      </div>
    </Card>
  );
}

function SeverityTag({ severity }) {
  const color = severity === 'high' ? 'red' : severity === 'low' ? 'blue' : 'orange';
  return <Tag color={color}>{titleize(severity)}</Tag>;
}

function ReviewDetailsModal({ target, relatedRecord, relatedFlags, decidingId, onClose, onDecide, onReviewFlags }) {
  if (!target) return null;

  const { item, type } = target;
  const decisionItem = type === 'flag' ? item : relatedRecord;
  const isDeciding = decidingId === item.id;
  const hasReviewFlags = type === 'record' && relatedFlags.length > 0;

  return (
    <Modal
      className="bbx-review-modal"
      open
      width={680}
      title={type === 'flag' ? 'Review Flag' : 'Review Tournament Record'}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        <Button
          key="reject"
          danger
          icon={<CloseOutlined />}
          loading={isDeciding}
          onClick={() => onDecide(decisionItem, 'rejected')}
        >
          Reject
        </Button>,
        <Button
          key={hasReviewFlags ? 'review-flags' : 'approve'}
          type="primary"
          icon={hasReviewFlags ? <FlagOutlined /> : <CheckOutlined />}
          loading={isDeciding}
          onClick={() => (hasReviewFlags ? onReviewFlags(relatedFlags) : onDecide(decisionItem, 'approved'))}
        >
          {hasReviewFlags ? `Review Flags (${relatedFlags.length})` : 'Verify'}
        </Button>
      ]}
    >
      {type === 'flag' ? (
        <>
          <Alert
            className="mb-4"
            type={item.severity === 'high' ? 'error' : 'warning'}
            showIcon
            message={titleize(item.flag_type)}
            description={item.message}
          />
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="Severity">
              <SeverityTag severity={item.severity} />
            </Descriptions.Item>
            <Descriptions.Item label="Created">{formatDate(item.created_at)}</Descriptions.Item>
            <Descriptions.Item label="Record ID">
              <span className="font-mono text-xs">{item.player_record_id}</span>
            </Descriptions.Item>
          </Descriptions>
        </>
      ) : null}

      {relatedRecord ? (
        <Descriptions className={type === 'flag' ? 'mt-4' : ''} bordered size="small" column={2}>
          <Descriptions.Item label="Tournament" span={2}>
            {relatedRecord.tournament?.name || 'Unknown tournament'}
          </Descriptions.Item>
          <Descriptions.Item label="Player">
            {relatedRecord.submitted_by_profile?.display_name || relatedRecord.player_name}
          </Descriptions.Item>
          <Descriptions.Item label="Claimed Alias">{relatedRecord.player_name}</Descriptions.Item>
          <Descriptions.Item label="Points">{relatedRecord.total_points}</Descriptions.Item>
          <Descriptions.Item label="Swiss Wins">{relatedRecord.swiss_wins}</Descriptions.Item>
          <Descriptions.Item label="Final Placement">{formatPlacement(relatedRecord.final_placement)}</Descriptions.Item>
          <Descriptions.Item label="Submitted">{formatDate(relatedRecord.created_at)}</Descriptions.Item>
          <Descriptions.Item label="Challonge Links" span={2}>
            {(relatedRecord.tournament_sources || []).length ? (
              <Space wrap>
                {relatedRecord.tournament_sources.map((source) => (
                  <Button
                    key={source.id}
                    size="small"
                    type="link"
                    icon={<ExportOutlined />}
                    href={source.challonge_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {source.source_type === 'top_cut' ? 'Open Top Cut' : 'Open Main Tournament'}
                  </Button>
                ))}
              </Space>
            ) : (
              <Typography.Text type="secondary">No Challonge link available.</Typography.Text>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Review Flags" span={2}>
            {(relatedRecord.review_flags || []).length ? (
              <Space wrap>
                {relatedRecord.review_flags.map((flag, index) => (
                  <StatusTag key={flag.id || `${flag.flag_type}-${index}`} status={flag.severity || 'review'}>
                    {titleize(flag.flag_type || 'Review flag')}
                  </StatusTag>
                ))}
              </Space>
            ) : (
              <StatusTag status="clean">No open flags</StatusTag>
            )}
          </Descriptions.Item>
        </Descriptions>
      ) : (
        <Alert
          className={type === 'flag' ? 'mt-4' : ''}
          type="info"
          showIcon
          message="The related pending record is not available in the current queue."
        />
      )}
    </Modal>
  );
}
