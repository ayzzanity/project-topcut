import {
  CheckCircleOutlined,
  DatabaseOutlined,
  EyeOutlined,
  FireOutlined,
  LinkOutlined,
  ReloadOutlined,
  TeamOutlined,
  TrophyOutlined,
  UserOutlined
} from '@ant-design/icons';
import { Alert, Button, Card, Collapse, Form, Input, Result, Segmented, Select, Space, Table, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ResponsiveTableWrapper from '../components/ResponsiveTableWrapper.jsx';
import StatusTag from '../components/StatusTag.jsx';
import { api } from '../lib/apiClient.js';
import { formatPlacement, titleize } from '../utils/formatters.js';

export default function ImportTournamentPage() {
  const [form] = Form.useForm();
  const [participantsPayload, setParticipantsPayload] = useState(null);
  const [preview, setPreview] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(null);
  const [importedSources, setImportedSources] = useState([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [sourceError, setSourceError] = useState(null);
  const [mainSourceMode, setMainSourceMode] = useState('link');
  const [topCutSourceMode, setTopCutSourceMode] = useState('link');
  const selectedMainSourceId = Form.useWatch('mainSourceId', form);

  useEffect(() => {
    async function loadImportedSources() {
      try {
        setImportedSources(await api.getImportedTournamentSources());
      } catch (nextError) {
        setSourceError(nextError);
      } finally {
        setLoadingSources(false);
      }
    }

    loadImportedSources();
  }, []);

  function clearLoadedImport() {
    setParticipantsPayload(null);
    setPreview(null);
    setConfirmation(null);
    form.setFieldValue('mainParticipantId', undefined);
  }

  function handleMainSourceModeChange(mode) {
    setMainSourceMode(mode);
    form.setFieldsValue({ mainLink: undefined, mainSourceId: undefined, topCutLink: undefined, topCutSourceId: undefined });
    clearLoadedImport();
  }

  function handleTopCutSourceModeChange(mode) {
    setTopCutSourceMode(mode);
    form.setFieldsValue({ topCutLink: undefined, topCutSourceId: undefined });
    setPreview(null);
    setConfirmation(null);
  }

  function selectImportedSource(fieldName, linkFieldName, sourceId) {
    const source = importedSources.find((item) => item.id === sourceId);
    form.setFieldValue(linkFieldName, source?.challongeUrl);
    form.setFieldValue(fieldName, sourceId);

    if (linkFieldName === 'mainLink') {
      form.setFieldsValue({ topCutLink: undefined, topCutSourceId: undefined });
      clearLoadedImport();
    } else {
      setPreview(null);
      setConfirmation(null);
    }
  }

  function resolveImportValues(values) {
    const allValues = form.getFieldsValue(true);
    const mergedValues = { ...allValues, ...values };
    const selectedMainSourceForSubmit = importedSources.find((item) => item.id === mergedValues.mainSourceId);
    const selectedTopCutSourceForSubmit = importedSources.find((item) => item.id === mergedValues.topCutSourceId);

    return {
      ...mergedValues,
      mainLink: mergedValues.mainLink || selectedMainSourceForSubmit?.challongeUrl,
      topCutLink: mergedValues.topCutLink || selectedTopCutSourceForSubmit?.challongeUrl || null
    };
  }

  async function validateMainSource() {
    const fields = mainSourceMode === 'imported' ? ['mainSourceId'] : ['mainLink'];
    await form.validateFields(fields);
    const values = resolveImportValues({});

    if (!values.mainLink) {
      throw new Error('Select or paste a main Challonge tournament.');
    }

    return values;
  }

  async function validatePreviewFields() {
    const fields = [
      mainSourceMode === 'imported' ? 'mainSourceId' : 'mainLink',
      topCutSourceMode === 'imported' ? 'topCutSourceId' : 'topCutLink',
      'mainParticipantId'
    ];

    await form.validateFields(fields);
    const values = resolveImportValues({});

    if (!values.mainLink) {
      throw new Error('Select or paste a main Challonge tournament.');
    }

    return values;
  }

  async function fetchParticipants() {
    setError(null);
    setPreview(null);
    setConfirmation(null);
    setParticipantsPayload(null);
    form.setFieldValue('mainParticipantId', undefined);
    setLoadingParticipants(true);

    try {
      const values = await validateMainSource();
      const payload = await api.fetchParticipants(values.mainLink);
      setParticipantsPayload(payload);
    } catch (nextError) {
      setError(nextError);
    } finally {
      setLoadingParticipants(false);
    }
  }

  async function previewResult() {
    setError(null);
    setConfirmation(null);
    setLoadingPreview(true);

    try {
      const values = await validatePreviewFields();
      setPreview(await api.previewImport(values));
    } catch (nextError) {
      setError(nextError);
    } finally {
      setLoadingPreview(false);
    }
  }

  async function confirmImport() {
    setError(null);
    setConfirming(true);

    try {
      const values = await validatePreviewFields();
      setConfirmation(await api.confirmImport(values));
    } catch (nextError) {
      setError(nextError);
    } finally {
      setConfirming(false);
    }
  }

  function resetFlow() {
    form.resetFields();
    setMainSourceMode('link');
    setTopCutSourceMode('link');
    setParticipantsPayload(null);
    setPreview(null);
    setConfirmation(null);
    setError(null);
  }

  const currentStep = preview ? 3 : participantsPayload ? 2 : 1;
  const mainSources = importedSources.filter((source) => source.sourceType === 'main');
  const topCutSources = importedSources.filter((source) => source.sourceType === 'top_cut');
  const selectedMainSource = mainSources.find((source) => source.id === selectedMainSourceId);
  const topCutSourcesForSelectedMain = selectedMainSource
    ? topCutSources.filter((source) => source.tournamentId === selectedMainSource.tournamentId)
    : [];
  const sourceOptions = (sources) =>
    sources.map((source) => ({
      value: source.id,
      searchText: `${source.tournamentName} ${source.sourceName || ''} ${source.tournamentDate || ''}`,
      plainLabel: source.tournamentName,
      label: (
        <div className="bbx-import-source-option">
          <strong>{source.tournamentName}</strong>
          <span>
            {source.tournamentDate || 'Date not provided'}
            {source.sourceName && source.sourceName !== source.tournamentName ? ` · ${source.sourceName}` : ''}
          </span>
        </div>
      )
    }));

  return (
    <div className="bbx-import-page">
      {confirmation ? (
        <Result
          status="success"
          icon={<CheckCircleOutlined />}
          title="Import submitted for admin review"
          subTitle={`This result is currently ${titleize(confirmation.status)}. It will appear on your profile and the leaderboard as unverified, then count as verified after admin review.`}
          extra={[
            <Button key="leaderboard" type="primary">
              <Link to="/leaderboard">View Leaderboard</Link>
            </Button>,
            <Button key="profile">
              <Link to="/profile">View My Profile</Link>
            </Button>,
            <Button key="again" icon={<ReloadOutlined />} onClick={resetFlow}>
              Import Another
            </Button>
          ]}
        />
      ) : (
        <div className="bbx-import-grid">
          <div className="min-w-0">
            <ImportStepBar currentStep={currentStep} />

            <Card className="bbx-card bbx-import-form-card">
              {error ? <Alert className="mb-5" type="error" showIcon message={error.message} /> : null}

              <Form className="bbx-import-form" form={form} layout="vertical">
                <SectionHeading icon={<CheckCircleOutlined />} title="Tournament Links" />

                <div className="bbx-import-source-picker">
                  <div className="bbx-import-source-picker-label">Main / Swiss tournament</div>
                  <Segmented
                    block
                    value={mainSourceMode}
                    onChange={handleMainSourceModeChange}
                    options={[
                      { label: 'Challonge Link', value: 'link', icon: <LinkOutlined /> },
                      { label: 'Imported Tournament', value: 'imported', icon: <DatabaseOutlined /> }
                    ]}
                  />
                </div>

                {mainSourceMode === 'link' ? (
                  <Form.Item
                    label="Challonge link"
                    name="mainLink"
                    rules={[{ required: true, message: 'Paste the main Challonge link.' }]}
                  >
                    <Input prefix={<LinkOutlined />} placeholder="https://challonge.com/..." />
                  </Form.Item>
                ) : (
                  <Form.Item
                    label="Imported tournament"
                    name="mainSourceId"
                    rules={[{ required: true, message: 'Select an imported tournament.' }]}
                  >
                    <Select
                      showSearch
                      loading={loadingSources}
                      optionFilterProp="searchText"
                      optionLabelProp="plainLabel"
                      placeholder="Search imported tournaments"
                      options={sourceOptions(mainSources)}
                      notFoundContent={sourceError ? 'Could not load imported tournaments' : 'No imported tournaments yet'}
                      onChange={(sourceId) => selectImportedSource('mainSourceId', 'mainLink', sourceId)}
                    />
                  </Form.Item>
                )}
                <Collapse
                  className="bbx-top-cut-collapse"
                  ghost
                  items={[
                    {
                      key: 'top-cut',
                      label: 'Add Top Cut / Final Stage',
                      children: (
                        <>
                          <Segmented
                            className="mb-3"
                            block
                            value={topCutSourceMode}
                            onChange={handleTopCutSourceModeChange}
                            options={[
                              { label: 'Challonge Link', value: 'link', icon: <LinkOutlined /> },
                              { label: 'Imported Tournament', value: 'imported', icon: <DatabaseOutlined /> }
                            ]}
                          />
                          {topCutSourceMode === 'link' ? (
                            <Form.Item
                              name="topCutLink"
                              extra="Optional. This is treated as the final stage for the same tournament, not a separate event."
                            >
                              <Input prefix={<LinkOutlined />} placeholder="Optional same-tournament final stage link" />
                            </Form.Item>
                          ) : (
                            <Form.Item
                              name="topCutSourceId"
                              extra="Optional. Select a previously imported Top Cut source for this same tournament."
                            >
                              <Select
                                allowClear
                                showSearch
                                loading={loadingSources}
                                disabled={!selectedMainSource}
                                optionFilterProp="searchText"
                                optionLabelProp="plainLabel"
                                placeholder={
                                  selectedMainSource
                                    ? 'Select linked Top Cut source'
                                    : 'Select an imported main tournament first'
                                }
                                options={sourceOptions(topCutSourcesForSelectedMain)}
                                notFoundContent={
                                  sourceError
                                    ? 'Could not load imported tournaments'
                                    : 'No linked Top Cut source for this tournament'
                                }
                                onChange={(sourceId) => selectImportedSource('topCutSourceId', 'topCutLink', sourceId)}
                                onClear={() => form.setFieldValue('topCutLink', undefined)}
                              />
                            </Form.Item>
                          )}
                        </>
                      )
                    }
                  ]}
                />

                <Button
                  className="mt-3"
                  type="primary"
                  icon={<TeamOutlined />}
                  loading={loadingParticipants}
                  onClick={fetchParticipants}
                >
                  Fetch Participants
                </Button>

                {participantsPayload ? (
                  <div className="mt-5">
                    <SectionHeading icon={<TrophyOutlined />} title="Imported Tournament" subtle />
                    {participantsPayload.alreadyImportedByUser ? (
                      <Alert
                        className="bbx-import-user-warning mb-2"
                        type="warning"
                        showIcon
                        message={`You already imported this tournament.`}
                      />
                    ) : null}
                    <Alert
                      className="bbx-import-source-alert mb-5"
                      type="info"
                      showIcon
                      message={
                        `[${participantsPayload.source?.tournamentDate}] ${participantsPayload.source?.name} - ${participantsPayload.source?.participantCount || participantsPayload.participants?.length || 0} participants` ||
                        'Participants loaded'
                      }
                    />

                    <SectionHeading icon={<UserOutlined />} title="Your participant name" subtle />
                    <Form.Item
                      name="mainParticipantId"
                      rules={[{ required: true, message: 'Select the participant name you used.' }]}
                    >
                      <Select
                        showSearch
                        optionFilterProp="searchText"
                        placeholder="Select your Challonge participant"
                        options={[...(participantsPayload.participants || [])]
                          .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }))
                          .map((participant) => ({
                            value: participant.challongeParticipantId,
                            disabled: participant.disabled || participant.claimed,
                            searchText: participant.name,
                            label: (
                              <div className="flex items-center justify-between gap-3">
                                <span className={participant.claimed ? 'text-bbx-muted' : 'font-semibold text-bbx-ink'}>
                                  {participant.name}
                                </span>
                                {participant.claimed ? (
                                  <StatusTag status="claimed">Already claimed</StatusTag>
                                ) : (
                                  <StatusTag status="available">Available</StatusTag>
                                )}
                              </div>
                            )
                          }))}
                      />
                    </Form.Item>
                    <Button
                      className="bbx-outline-button"
                      icon={<EyeOutlined />}
                      loading={loadingPreview}
                      onClick={previewResult}
                    >
                      Preview Result
                    </Button>
                  </div>
                ) : null}
              </Form>
            </Card>
          </div>

          <Card className="bbx-card bbx-import-preview-card self-start xl:sticky xl:top-24" title="Scoring Preview">
            {preview ? (
              <PreviewPanel preview={preview} confirming={confirming} onConfirm={confirmImport} />
            ) : (
              <EmptyPreview />
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function ImportStepBar({ currentStep }) {
  const steps = [
    { title: 'Tournament Links', step: 1 },
    { title: 'Select Participant', step: 2 },
    { title: 'Preview & Confirm', step: 3 }
  ];

  return (
    <div className="bbx-import-stepbar">
      {steps.map((item) => {
        const done = currentStep > item.step;
        const active = currentStep === item.step;

        return (
          <div key={item.title} className="bbx-import-step">
            <span className={`bbx-import-step-dot ${active ? 'is-active' : ''} ${done ? 'is-done' : ''}`}>
              {done ? <CheckCircleOutlined /> : item.step}
            </span>
            <span className="bbx-import-step-label">{item.title}</span>
            {item.step < steps.length ? <span className="bbx-import-step-line" aria-hidden="true" /> : null}
          </div>
        );
      })}
    </div>
  );
}

function SectionHeading({ icon, title, subtle = false }) {
  return (
    <div className={`bbx-import-section-heading ${subtle ? 'is-subtle' : ''}`}>
      <span>{icon}</span>
      <strong>{title}</strong>
    </div>
  );
}

function PreviewPanel({ preview, confirming, onConfirm }) {
  const pointRows = preview.pointBreakdown || [];
  const swissRecordIncomplete = preview.swissRecord && preview.swissRecord.isComplete === false;
  const matchRows = (preview.matchSummaries || [])
    .map((match) => ({
      key: `${match.stage}-${match.challongeMatchId}`,
      stage: match.stage,
      result: match.result,
      round: match.roundNumber,
      opponentName: match.opponentName,
      score: match.score
    }))
    .sort(
      (a, b) =>
        (a.stage === b.stage ? 0 : a.stage === 'swiss' ? -1 : 1) ||
        (isMissingMatchRound(a.round) ? 1 : 0) - (isMissingMatchRound(b.round) ? 1 : 0) ||
        (a.round || 0) - (b.round || 0)
    );

  const swissRecordText = swissRecordIncomplete
    ? 'Needs admin review'
    : preview.swissRecord
      ? `${preview.swissRecord.wins} - ${preview.swissRecord.losses} - ${preview.swissRecord.ties}`
      : `${preview.swissWins || 0} wins`;

  return (
    <div>
      <div className="grid gap-3">
        <PreviewStatCard icon={<TrophyOutlined />} label="Total Points" value={preview.totalPoints || 0} featured />
        <div className="grid grid-cols-2 gap-3">
          <PreviewStatCard icon={<FireOutlined />} label="Match Wins" value={preview.validWins || 0} />
          <PreviewStatCard label="Placement" value={formatPlacement(preview.finalPlacement)} />
        </div>
      </div>

      <Card size="small" className="bbx-import-summary-card">
        <SummaryRow label="Player" value={preview.selectedParticipant?.name} />
        <SummaryRow label="Main event" value={preview.main?.name} />
        <SummaryRow label="Tournament date" value={preview.main?.tournamentDate || 'Not provided'} />
        <SummaryRow label="Top Cut" value={preview.topCut?.name || 'None provided'} />
        <SummaryRow label="Swiss record" value={swissRecordText} />
        <SummaryRow
          label="Top Cut status"
          value={
            <Tag color={preview.topCutEntry ? 'orange' : 'default'}>{preview.topCutEntry ? 'Entered' : 'Not entered'}</Tag>
          }
        />
        <SummaryRow
          label="Swiss King"
          value={
            <Tag color={preview.isSwissKing ? 'orange' : 'default'}>
              {preview.isSwissKing ? 'Swiss King' : titleize(preview.swissKingStatus || 'Not Swiss King')}
            </Tag>
          }
        />
      </Card>

      {swissRecordIncomplete ? (
        <Alert
          className="mb-3"
          type="warning"
          showIcon
          message="Swiss record needs admin review"
          description={preview.swissRecord.message}
        />
      ) : null}

      {preview.reviewFlags?.length ? (
        <Alert
          className="bbx-review-flags-alert mb-3"
          type="warning"
          showIcon
          message={`${preview.reviewFlags.length} review flag${preview.reviewFlags.length === 1 ? '' : 's'}`}
          description={
            <Space direction="vertical" className="w-full">
              {preview.reviewFlags.map((flag, index) => (
                <div key={`${flag.flag_type}-${index}`} className="bbx-review-flag-item">
                  <StatusTag status={flag.severity === 'high' ? 'high' : 'review'}>{titleize(flag.flag_type)}</StatusTag>
                  <span>{flag.message}</span>
                </div>
              ))}
            </Space>
          }
        />
      ) : (
        <div className="bbx-preview-clean-status">
          <CheckCircleOutlined />
          <span>No review flags returned.</span>
        </div>
      )}

      <Collapse
        className="bbx-preview-details-collapse"
        ghost
        items={[
          {
            key: 'points',
            label: `Point Breakdown (${pointRows.length})`,
            children: pointRows.length ? (
              <div className="bbx-preview-detail-body">
                <ResponsiveTableWrapper>
                  <Table
                    size="small"
                    rowKey="key"
                    dataSource={pointRows}
                    pagination={false}
                    tableLayout="fixed"
                    columns={[
                      { title: 'Item', dataIndex: 'label', width: '50%' },
                      { title: 'Value', dataIndex: 'value', width: '32%' },
                      {
                        title: 'Points',
                        dataIndex: 'points',
                        width: '18%',
                        render: (value) => <strong className="text-bbx-red">{value}</strong>
                      }
                    ]}
                  />
                </ResponsiveTableWrapper>
              </div>
            ) : (
              <div className="px-3 pb-3 text-xs text-bbx-muted">No point breakdown was returned.</div>
            )
          },
          ...(matchRows.length
            ? [
                {
                  key: 'matches',
                  label: `Imported Matches (${matchRows.length})`,
                  children: (
                    <div className="bbx-preview-detail-body">
                      <ResponsiveTableWrapper>
                        <Table
                          size="small"
                          rowKey="key"
                          dataSource={matchRows}
                          pagination={false}
                          tableLayout="fixed"
                          rowClassName={(record, index) =>
                            record.stage === 'top_cut' && matchRows[index - 1]?.stage !== 'top_cut'
                              ? 'bbx-match-stage-divider'
                              : ''
                          }
                          columns={[
                            {
                              title: 'Stage',
                              dataIndex: 'stage',
                              width: '48%',
                              render: (value, record) => (
                                <span>
                                  <Tag color={value === 'swiss' ? 'gray' : 'gold'}>{titleize(value).toUpperCase()}</Tag>
                                  <span>vs {record.opponentName}</span>
                                </span>
                              )
                            },
                            {
                              title: 'Match',
                              dataIndex: 'round',
                              width: '14%',
                              render: (value) => (isMissingMatchRound(value) ? 'N/A' : value)
                            },
                            { title: 'Score', dataIndex: 'score', width: '18%', render: (value) => value || '-' },
                            {
                              title: 'Result',
                              dataIndex: 'result',
                              width: '20%',
                              render: (value) => (
                                <Tag color={value === 'win' ? 'green' : value === 'loss' ? 'red' : 'gold'}>
                                  {titleize(value)}
                                </Tag>
                              )
                            }
                          ]}
                        />
                      </ResponsiveTableWrapper>
                      {matchRows.some((match) => isMissingMatchRound(match.round)) ? (
                        <p className="bbx-match-round-note">
                          N/A matches are extra bracket matches, such as a battle for third place or another placement match.
                        </p>
                      ) : null}
                    </div>
                  )
                }
              ]
            : [])
        ]}
      />

      <Button className="mt-3" type="primary" icon={<CheckCircleOutlined />} loading={confirming} onClick={onConfirm} block>
        Confirm Import
      </Button>
    </div>
  );
}

function isMissingMatchRound(round) {
  return round == null || Number(round) <= 0;
}

function PreviewStatCard({ icon, label, value, featured = false }) {
  return (
    <div className={`bbx-import-preview-stat ${featured ? 'is-featured' : ''}`}>
      {icon ? <span className="bbx-import-preview-stat-icon">{icon}</span> : null}
      <div>
        <div className="text-[11px] font-black uppercase text-bbx-muted">{label}</div>
        <div
          className={`stat-number ${featured ? 'text-3xl text-bbx-red' : 'text-xl text-bbx-ink'} font-black leading-none`}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="bbx-import-summary-row">
      <span>{label}:</span>
      <strong>{value || 'N/A'}</strong>
    </div>
  );
}

function EmptyPreview() {
  return (
    <div className="py-6">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded border border-bbx-line bg-bbx-warm text-bbx-red">
        <TrophyOutlined />
      </div>
      <Typography.Title level={4} className="m-0 text-bbx-ink">
        Waiting for preview
      </Typography.Title>
      <p className="mt-2 text-sm leading-6 text-bbx-muted">
        Backend scoring will appear here with total points, Swiss record, Top Cut status, placement, review flags, and
        imported match rows.
      </p>
    </div>
  );
}
