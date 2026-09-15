// src/routes/admin/cashAccounts.routes.js
import express from 'express';
import {
  listAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  getReconciliation,
  getOrCreateReconciliation,
  closeReconciliation,
  listReconciliations,
  getDefaultDrawer,
} from '../../controllers/admin/cashAccountsController.js';
import { requireStaffAuth } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/role.middleware.js';

const cashAccountRouter = express.Router();

cashAccountRouter.use(requireStaffAuth, requirePermission('can_access_reports'));

// Default drawer lookup (used by POS checkout)
cashAccountRouter.get('/drawer/default', getDefaultDrawer);

cashAccountRouter.get('/', listAccounts);
cashAccountRouter.post('/', createAccount);
cashAccountRouter.put('/:id', updateAccount);
cashAccountRouter.delete('/:id', deleteAccount);

// Daily reconciliation endpoints
cashAccountRouter.get('/:accountId/reconciliations', listReconciliations);
cashAccountRouter.get('/:accountId/reconciliations/today', getOrCreateReconciliation);
cashAccountRouter.get('/:accountId/reconciliations/:date', getReconciliation);
cashAccountRouter.post('/:accountId/reconciliations/close', closeReconciliation);

export default cashAccountRouter;