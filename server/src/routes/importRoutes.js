const express = require('express');
const { z } = require('zod');
const { requireAuth } = require('../middleware/auth');
const {
  getParticipantsForDropdown,
  getImportedTournamentDetails,
  listImportedTournamentSources,
  previewImport,
  confirmImport
} = require('../services/importService');

const router = express.Router();

const participantsSchema = z.object({
  mainLink: z.string().min(1)
});

const previewSchema = z.object({
  mainLink: z.string().min(1),
  topCutLink: z.string().optional().nullable(),
  mainParticipantId: z.coerce.number().int().positive()
});

const confirmSchema = z.object({
  mainLink: z.string().min(1),
  topCutLink: z.string().optional().nullable(),
  mainParticipantId: z.coerce.number().int().positive(),
  deck: z.object({}).passthrough().optional()
});

router.get('/sources', requireAuth, async (_req, res, next) => {
  try {
    const result = await listImportedTournamentSources();
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

router.get('/sources/:sourceId', requireAuth, async (req, res, next) => {
  try {
    const result = await getImportedTournamentDetails(req.params.sourceId);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

router.post('/participants', requireAuth, async (req, res, next) => {
  try {
    const input = participantsSchema.parse(req.body);
    const result = await getParticipantsForDropdown(input.mainLink, req.user.id);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

router.post('/preview', requireAuth, async (req, res, next) => {
  try {
    const input = previewSchema.parse(req.body);
    const result = await previewImport({ ...input, userId: req.user.id });
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

router.post('/confirm', requireAuth, async (req, res, next) => {
  try {
    const input = confirmSchema.parse(req.body);
    const preview = await previewImport({
      mainLink: input.mainLink,
      topCutLink: input.topCutLink,
      mainParticipantId: input.mainParticipantId,
      userId: req.user.id
    });

    const result = await confirmImport({
      userId: req.user.id,
      preview,
      deck: input.deck || {}
    });
    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
});

module.exports = router;



