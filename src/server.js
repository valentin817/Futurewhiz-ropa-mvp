import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb, getDb } from './db.js';
import {
  ACTIVITY_FIELD_META,
  ALLOWED_UPLOAD_EXTENSIONS,
  ATTACHMENT_TYPE_OPTIONS,
  BOOLEAN_FILTERS,
  FUTUREWHIZ_ROLE_OPTIONS,
  REQUIRED_ACTIVITY_FIELDS,
  REVIEW_INTERVAL_OPTIONS,
  ROLE_OPTIONS,
  STATUS_OPTIONS
} from './constants.js';
import {
  addMonths,
  boolFromInput,
  buildActivityCsv,
  buildActivityDetailPdf,
  buildCompanyDetailsPdf,
  buildActivityExcelXml,
  buildRegisterPdf,
  buildSecurityDetailPdf,
  buildSecurityRegisterPdf,
  displayValue,
  escapeHtml,
  futurewhizRoleLabel,
  formatDate,
  formatDateTime,
  normalizeFieldValue,
  nowIso,
  parseJsonArray,
  activityControllerContactValue,
  controllerProfileSummary,
  registerFlagLabels,
  statusClass,
  statusLabel,
  stringifyJsonArray,
  todayIsoDate,
  toArray
} from './helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

await initDb();
const db = getDb();

const app = express();

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 3080);
const SESSION_SECRET = process.env.SESSION_SECRET || 'futurewhiz-ropa-dev-secret';
const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Europe/Amsterdam';
const ALLOWED_DOMAIN = (process.env.ALLOWED_DOMAIN || 'futurewhiz.com').toLowerCase();
const ADMIN_DEMO_EMAIL = 'linda.vermeer@futurewhiz.com';
const UPLOAD_DIR = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'data/uploads');
const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB || 15);

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax'
    }
  })
);

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, UPLOAD_DIR);
  },
  filename: (_req, file, callback) => {
    const safeName = String(file.originalname || 'attachment')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 80);
    callback(null, `${Date.now()}-${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_UPLOAD_EXTENSIONS.has(extension)) {
      const error = new Error('Unsupported file type.');
      error.statusCode = 400;
      callback(error);
      return;
    }
    callback(null, true);
  }
});

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  res.locals.currentPath = req.path;
  res.locals.formatDate = (value) => formatDate(value, APP_TIMEZONE);
  res.locals.formatDateTime = (value) => formatDateTime(value, APP_TIMEZONE);
  res.locals.registerFlagLabels = registerFlagLabels;
  res.locals.statusClass = statusClass;
  res.locals.statusLabel = statusLabel;
  res.locals.parseJsonArray = parseJsonArray;
  res.locals.attachmentTypeOptions = ATTACHMENT_TYPE_OPTIONS;
  res.locals.futurewhizRoleLabel = futurewhizRoleLabel;
  res.locals.activityControllerContactValue = activityControllerContactValue;
  res.locals.controllerProfileSummary = controllerProfileSummary;
  res.locals.controllerProfileContactDetails = controllerProfileContactDetails;
  next();
});

function setFlash(req, type, message) {
  req.session.flash = { type, message };
}

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function ensureAuth(req, res, next) {
  if (req.session.user) {
    return next();
  }
  setFlash(req, 'info', 'Sign in to continue.');
  return res.redirect('/login');
}

function ensureLegal(req, res, next) {
  const role = req.session.user?.role;
  if (role === 'legal' || role === 'admin') {
    return next();
  }
  return res.status(403).render('error', {
    message: 'Only legal/privacy reviewers or admins can access this page.'
  });
}

function ensureAdmin(req, res, next) {
  if (req.session.user?.role === 'admin') {
    return next();
  }
  return res.status(403).render('error', {
    message: 'Only admins can access this page.'
  });
}

async function getActiveUsers() {
  return db
    .prepare('SELECT * FROM users WHERE active = 1 ORDER BY CASE role WHEN "admin" THEN 0 WHEN "legal" THEN 1 ELSE 2 END, name ASC')
    .all();
}

async function getVocabulary(groupKey) {
  return db
    .prepare(
      `
        SELECT id, group_key, value_key, label, sort_order, active
        FROM vocabulary_values
        WHERE group_key = ? AND active = 1
        ORDER BY sort_order ASC, label ASC
      `
    )
    .all(groupKey);
}

async function getVocabBundle() {
  const [departments, products, lawfulBases, dataSubjects, personalData, recipients, transferMechanisms] =
    await Promise.all([
      getVocabulary('department'),
      getVocabulary('product_service'),
      getVocabulary('lawful_basis'),
      getVocabulary('data_subject_category'),
      getVocabulary('personal_data_category'),
      getVocabulary('recipient_category'),
      getVocabulary('transfer_mechanism')
    ]);

  return {
    departments,
    products,
    lawfulBases,
    dataSubjects,
    personalData,
    recipients,
    transferMechanisms
  };
}

async function getControllerProfile() {
  return db.prepare('SELECT * FROM controller_profile ORDER BY id ASC LIMIT 1').get();
}

function controllerProfileContactDetails(profile) {
  if (!profile) return '';
  return [
    profile.contact_name,
    profile.address,
    profile.phone_number,
    profile.email,
    profile.chamber_of_commerce ? `KvK ${profile.chamber_of_commerce}` : ''
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' | ');
}

async function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(email);
}

async function createBusinessUserIfNeeded(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.endsWith(`@${ALLOWED_DOMAIN}`)) {
    return null;
  }

  let user = await getUserByEmail(normalizedEmail);
  if (user) return user;

  const name = normalizedEmail
    .split('@')[0]
    .split('.')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

  const result = await db
    .prepare(
      `
        INSERT INTO users (name, email, role, department, active, created_at, updated_at)
        VALUES (?, ?, 'business', '', 1, ?, ?)
      `
    )
    .run(name, normalizedEmail, nowIso(), nowIso());

  user = await db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  return user;
}

function likeJsonParam(value) {
  return `%${String(value).replaceAll('"', '""')}%`;
}

function buildActivityFilters(query) {
  return {
    futurewhiz_role: ['controller', 'processor'].includes(String(query.futurewhiz_role || ''))
      ? String(query.futurewhiz_role)
      : '',
    q: String(query.q || '').trim(),
    vendor: String(query.vendor || ''),
    product: String(query.product || ''),
    department: String(query.department || ''),
    owner: String(query.owner || ''),
    status: String(query.status || ''),
    lawful_basis: String(query.lawful_basis || ''),
    children_data: String(query.children_data || 'all'),
    special_category_data: String(query.special_category_data || 'all'),
    international_transfers: String(query.international_transfers || 'all'),
    ai_involvement: String(query.ai_involvement || 'all'),
    overdue_review: String(query.overdue_review || 'all'),
    missing_security_measures: String(query.missing_security_measures || 'all'),
    missing_links: String(query.missing_links || ''),
    retention_state: String(query.retention_state || 'all'),
    retention_search: String(query.retention_search || '').trim(),
    sort: String(query.sort || 'next_review_asc')
  };
}

function buildActivityWhere(filters) {
  const clauses = ['1 = 1'];
  const params = [];

  if (filters.q) {
    clauses.push(
      `(reference_code LIKE ? OR activity_name LIKE ? OR business_process LIKE ? OR short_description LIKE ? OR futurewhiz_internal_use LIKE ? OR purpose_of_processing LIKE ? OR processors_vendors_json LIKE ? OR security_measures LIKE ? OR legal_remarks LIKE ? OR action_required LIKE ?)`
    );
    const searchTerm = `%${filters.q}%`;
    params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
  }

  if (filters.futurewhiz_role) {
    clauses.push('futurewhiz_role = ?');
    params.push(filters.futurewhiz_role);
  }

  if (filters.vendor) {
    clauses.push('processors_vendors_json LIKE ?');
    params.push(likeJsonParam(filters.vendor));
  }

  if (filters.product) {
    clauses.push('product_service = ?');
    params.push(filters.product);
  }

  if (filters.department) {
    clauses.push('department = ?');
    params.push(filters.department);
  }

  if (filters.owner) {
    clauses.push('business_owner_email = ?');
    params.push(filters.owner);
  }

  if (filters.status) {
    clauses.push('status = ?');
    params.push(filters.status);
  }

  if (filters.lawful_basis) {
    clauses.push('lawful_basis = ?');
    params.push(filters.lawful_basis);
  }

  for (const flag of ['children_data', 'special_category_data', 'international_transfers', 'ai_involvement']) {
    if (filters[flag] === 'yes') {
      clauses.push(`${flag} = 1`);
    } else if (filters[flag] === 'no') {
      clauses.push(`${flag} = 0`);
    }
  }

  if (filters.overdue_review === 'yes') {
    clauses.push(`status != 'archived' AND next_review_date IS NOT NULL AND next_review_date != '' AND date(next_review_date) < date(?)`);
    params.push(todayIsoDate());
  } else if (filters.overdue_review === 'no') {
    clauses.push(
      `(next_review_date IS NULL OR next_review_date = '' OR date(next_review_date) >= date(?) OR status = 'archived')`
    );
    params.push(todayIsoDate());
  }

  if (filters.missing_security_measures === 'yes') {
    clauses.push(`(security_measures IS NULL OR security_measures = '')`);
  } else if (filters.missing_security_measures === 'no') {
    clauses.push(`(security_measures IS NOT NULL AND security_measures != '')`);
  }

  if (filters.retention_search) {
    clauses.push('retention_period LIKE ?');
    params.push(`%${filters.retention_search}%`);
  }

  if (filters.retention_state === 'missing') {
    clauses.push(`(retention_period IS NULL OR retention_period = '')`);
  } else if (filters.retention_state === 'present') {
    clauses.push(`(retention_period IS NOT NULL AND retention_period != '')`);
  }

  if (filters.missing_links === 'missing_dpia') {
    clauses.push(`(dpia_ref IS NULL OR dpia_ref = '')`);
  } else if (filters.missing_links === 'missing_vendor_review') {
    clauses.push(`(vendor_review_ref IS NULL OR vendor_review_ref = '')`);
  } else if (filters.missing_links === 'missing_security_review') {
    clauses.push(`(security_review_ref IS NULL OR security_review_ref = '')`);
  } else if (filters.missing_links === 'missing_any_core_link') {
    clauses.push(
      `((dpia_ref IS NULL OR dpia_ref = '') OR (vendor_review_ref IS NULL OR vendor_review_ref = '') OR (security_review_ref IS NULL OR security_review_ref = ''))`
    );
  }

  const orderBy = {
    activity_name_asc: 'activity_name ASC',
    updated_desc: 'last_updated_at DESC',
    status_asc: 'status ASC, activity_name ASC',
    next_review_asc: 'CASE WHEN next_review_date IS NULL OR next_review_date = "" THEN 1 ELSE 0 END ASC, next_review_date ASC, activity_name ASC'
  }[filters.sort] || 'activity_name ASC';

  return {
    whereSql: clauses.join(' AND '),
    params,
    orderBy
  };
}

function summarizeActivityFilters(filters) {
  const summaries = [];
  const yesNoLabel = (value) => (value === 'yes' ? 'Yes' : 'No');
  const sortLabels = {
    next_review_asc: 'Next review date',
    updated_desc: 'Last updated',
    activity_name_asc: 'Activity name',
    status_asc: 'Status'
  };

  if (filters.futurewhiz_role) summaries.push(`Futurewhiz role: ${futurewhizRoleLabel(filters.futurewhiz_role)}`);
  if (filters.q) summaries.push(`Keyword: ${filters.q}`);
  if (filters.vendor) summaries.push(`Vendor: ${filters.vendor}`);
  if (filters.product) summaries.push(`Product: ${filters.product}`);
  if (filters.department) summaries.push(`Department: ${filters.department}`);
  if (filters.owner) summaries.push(`Owner: ${filters.owner}`);
  if (filters.status) summaries.push(`Status: ${statusLabel(filters.status)}`);
  if (filters.lawful_basis) summaries.push(`Lawful basis: ${filters.lawful_basis}`);

  for (const key of ['children_data', 'special_category_data', 'international_transfers', 'ai_involvement']) {
    if (filters[key] !== 'all') {
      const label = key
        .replaceAll('_', ' ')
        .replace(/\b\w/g, (character) => character.toUpperCase());
      summaries.push(`${label}: ${yesNoLabel(filters[key])}`);
    }
  }

  if (filters.overdue_review !== 'all') summaries.push(`Overdue review: ${yesNoLabel(filters.overdue_review)}`);
  if (filters.missing_security_measures !== 'all') {
    summaries.push(`Security measures present: ${filters.missing_security_measures === 'yes' ? 'No' : 'Yes'}`);
  }
  if (filters.missing_links) summaries.push(`Missing link check: ${filters.missing_links.replaceAll('_', ' ')}`);
  if (filters.retention_state !== 'all') summaries.push(`Retention state: ${filters.retention_state}`);
  if (filters.retention_search) summaries.push(`Retention contains: ${filters.retention_search}`);
  if (filters.sort && filters.sort !== 'next_review_asc') summaries.push(`Sorted by: ${sortLabels[filters.sort] || filters.sort}`);

  return summaries;
}

function makeReference(prefix, id) {
  return `${prefix}-${String(id).padStart(4, '0')}`;
}

async function createActivityReference() {
  const row = await db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM activities').get();
  return makeReference('ROPA', row.next_id);
}

function decorateActivity(activity) {
  if (!activity) return null;
  const nextReviewDate = activity.next_review_date || '';
  const isOverdue = Boolean(
    nextReviewDate && activity.status !== 'archived' && nextReviewDate < todayIsoDate()
  );
  return {
    ...activity,
    data_subject_categories: parseJsonArray(activity.data_subject_categories_json),
    personal_data_categories: parseJsonArray(activity.personal_data_categories_json),
    recipient_categories: parseJsonArray(activity.recipient_categories_json),
    processors_vendors: parseJsonArray(activity.processors_vendors_json),
    transfer_mechanisms: parseJsonArray(activity.transfer_mechanisms_json),
    transfer_countries: parseJsonArray(activity.transfer_countries_json),
    is_overdue: isOverdue,
    missing_security_measures: !String(activity.security_measures || '').trim(),
    missing_vendor_review: !String(activity.vendor_review_ref || '').trim(),
    missing_dpia: !String(activity.dpia_ref || '').trim(),
    missing_security_review: !String(activity.security_review_ref || '').trim(),
    missing_retention_period: !String(activity.retention_period || '').trim(),
    processes_personal_data: Number(activity.processes_personal_data),
    processing_lawful: Number(activity.processing_lawful),
    data_within_eu: Number(activity.data_within_eu),
    processor_agreement_signed: Number(activity.processor_agreement_signed),
    tia_performed: Number(activity.tia_performed)
  };
}

async function getActivityById(id) {
  const row = await db.prepare('SELECT * FROM activities WHERE id = ?').get(id);
  return decorateActivity(row);
}

function canEditActivity(user, activity) {
  if (!user || !activity) return false;
  if (user.role === 'legal' || user.role === 'admin') return true;
  return (
    user.role === 'business' &&
    activity.business_owner_email === user.email &&
    ['draft', 'pending_business_input', 'needs_update'].includes(activity.status)
  );
}

async function fetchFiltersSupportData() {
  const [users, productsRows, vendorRows] = await Promise.all([
    getActiveUsers(),
    db.prepare('SELECT DISTINCT product_service FROM activities WHERE product_service != "" ORDER BY product_service ASC').all(),
    db.prepare('SELECT processors_vendors_json FROM activities').all()
  ]);

  const vendors = [...new Set(vendorRows.flatMap((row) => parseJsonArray(row.processors_vendors_json)))].sort((a, b) =>
    a.localeCompare(b)
  );

  return {
    owners: users.filter((user) => user.role === 'business'),
    products: productsRows.map((row) => row.product_service),
    vendors
  };
}

function buildSecurityMeasureFilters(query) {
  return {
    q: String(query.q || '').trim(),
    category: String(query.category || '').trim(),
    sort: String(query.sort || 'category_asc')
  };
}

function buildSecurityMeasureWhere(filters) {
  const clauses = ['1 = 1'];
  const params = [];

  if (filters.q) {
    clauses.push('(title LIKE ? OR description LIKE ? OR category LIKE ?)');
    const term = `%${filters.q}%`;
    params.push(term, term, term);
  }

  if (filters.category) {
    clauses.push('category = ?');
    params.push(filters.category);
  }

  const orderBy = {
    category_asc: 'category ASC, sort_order ASC, title ASC',
    title_asc: 'title ASC',
    updated_desc: 'updated_at DESC, title ASC'
  }[filters.sort] || 'category ASC, sort_order ASC, title ASC';

  return { whereSql: clauses.join(' AND '), params, orderBy };
}

function summarizeSecurityMeasureFilters(filters) {
  const summaries = [];
  if (filters.q) summaries.push(`Keyword: ${filters.q}`);
  if (filters.category) summaries.push(`Category: ${filters.category}`);
  if (filters.sort && filters.sort !== 'category_asc') {
    const labels = {
      title_asc: 'Title',
      updated_desc: 'Last updated'
    };
    summaries.push(`Sorted by: ${labels[filters.sort] || filters.sort}`);
  }
  return summaries;
}

async function renderSecurityMeasureLibrary(req, res, options = {}) {
  const filters = options.filters || buildSecurityMeasureFilters(req.query);
  const { whereSql, params, orderBy } = buildSecurityMeasureWhere(filters);
  const [measures, categoryRows] = await Promise.all([
    db.prepare(`SELECT * FROM security_measure_library WHERE ${whereSql} ORDER BY ${orderBy}`).all(params),
    db.prepare('SELECT DISTINCT category FROM security_measure_library ORDER BY category ASC').all()
  ]);

  return res.render('security_measures', {
    pageTitle: 'Security measures',
    measures,
    activeFilters: summarizeSecurityMeasureFilters(filters),
    filters,
    exportQuery: new URLSearchParams(filters).toString(),
    categoryOptions: categoryRows.map((row) => row.category),
    formErrors: options.formErrors || [],
    formValues: options.formValues || { category: '', title: '', description: '' },
    showNewForm: Boolean(options.showNewForm)
  });
}

async function writeChangeLog(activityId, actor, eventType, fieldName, oldValue, newValue, reason) {
  await db
    .prepare(
      `
        INSERT INTO activity_change_log (
          activity_id, actor_id, actor_name, actor_email, event_type, field_name, old_value, new_value, reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
    .run(
      activityId,
      actor?.id || null,
      actor?.name || '',
      actor?.email || 'system@futurewhiz.com',
      eventType,
      fieldName,
      oldValue,
      newValue,
      reason || '',
      nowIso()
    );
}

// Compare and log field-level changes so the activity page has a meaningful audit trail.
async function recordActivityFieldChanges(activityId, previousActivity, nextPayload, actor, reason) {
  for (const field of ACTIVITY_FIELD_META) {
    const beforeValue = normalizeFieldValue(field, previousActivity[field.key]);
    const afterValue = normalizeFieldValue(field, nextPayload[field.key]);
    if (beforeValue !== afterValue) {
      await writeChangeLog(
        activityId,
        actor,
        field.key === 'status' ? 'status_change' : 'field_change',
        field.label,
        displayValue(field, previousActivity[field.key]),
        displayValue(field, nextPayload[field.key]),
        reason
      );
    }
  }
}

async function replaceReminder(activityId, scheduledFor, status = 'scheduled', note = 'Scheduled review') {
  await db.prepare('DELETE FROM activity_reminders WHERE activity_id = ?').run(activityId);
  if (!scheduledFor) return;

  await db
    .prepare(
      `
        INSERT INTO activity_reminders (activity_id, trigger_source, scheduled_for, status, note, created_at, updated_at)
        VALUES (?, 'scheduled_review', ?, ?, ?, ?, ?)
      `
    )
    .run(activityId, scheduledFor, status, note, nowIso(), nowIso());
}

async function bumpActivityMeta(activityId, actor) {
  await db
    .prepare(
      `
        UPDATE activities
        SET last_updated_by_id = ?, last_updated_by_name = ?, last_updated_by_email = ?, last_updated_at = ?
        WHERE id = ?
      `
    )
    .run(actor?.id || null, actor?.name || '', actor?.email || '', nowIso(), activityId);
}

async function lookupUserSummary(email) {
  if (!email) {
    return { id: null, name: '', email: '' };
  }
  const user = await getUserByEmail(email);
  if (user) {
    return { id: user.id, name: user.name, email: user.email };
  }
  return { id: null, name: email, email };
}

function validateActivityPayload(payload, mode = 'form') {
  const errors = [];

  if (mode === 'form') {
    for (const field of REQUIRED_ACTIVITY_FIELDS) {
      if (!String(payload[field] || '').trim()) {
        const label = ACTIVITY_FIELD_META.find((item) => item.key === field)?.label || field;
        errors.push(`${label} is required.`);
      }
    }
  }

  if (!String(payload.business_owner_email || '').trim()) {
    errors.push('Business owner is required.');
  }

  if (payload.futurewhiz_role === 'processor') {
    if (!String(payload.controller_name || '').trim() || !String(payload.controller_contact_details || '').trim()) {
      errors.push('When Futurewhiz acts as processor, the customer / controller name and contact details are required.');
    }
  }

  if (payload.legal_reviewer_email && !payload.legal_reviewer_email.endsWith(`@${ALLOWED_DOMAIN}`)) {
    errors.push('Legal reviewer must be an internal Futurewhiz user.');
  }

  if (!String(payload.security_measures || '').trim() && mode === 'form') {
    errors.push('Security measures are mandatory for RoPA records.');
  }

  return errors;
}

async function buildActivityPayload(body, actor, existingActivity = null, mode = 'form') {
  const controllerProfile = await getControllerProfile();
  const owner = await lookupUserSummary(body.business_owner_email || existingActivity?.business_owner_email || actor.email);
  const reviewer = await lookupUserSummary(body.legal_reviewer_email || existingActivity?.legal_reviewer_email || '');
  const reviewIntervalMonths = Number(body.review_interval_months || existingActivity?.review_interval_months || 12);
  const lastReviewDate = String(body.last_review_date || existingActivity?.last_review_date || '').trim();
  const nextReviewDate =
    String(body.next_review_date || '').trim() ||
    addMonths(lastReviewDate || todayIsoDate(), reviewIntervalMonths);
  const requestedStatus = String(body.status || existingActivity?.status || 'draft').trim() || 'draft';
  const futurewhizRole =
    String(body.futurewhiz_role || existingActivity?.futurewhiz_role || 'controller').trim() || 'controller';
  const controllerName =
    futurewhizRole === 'processor'
      ? String(body.controller_name || existingActivity?.controller_name || '').trim()
      : String(controllerProfile?.company_name || existingActivity?.controller_name || '').trim();
  const controllerContactDetails =
    futurewhizRole === 'processor'
      ? String(body.controller_contact_details || existingActivity?.controller_contact_details || '').trim()
      : controllerProfileContactDetails(controllerProfile);

  return {
    reference_code: existingActivity?.reference_code || (await createActivityReference()),
    activity_name: String(body.activity_name || existingActivity?.activity_name || '').trim(),
    business_process: String(body.business_process || existingActivity?.business_process || '').trim(),
    short_description: String(body.short_description || existingActivity?.short_description || '').trim(),
    processes_personal_data:
      body.processes_personal_data === undefined
        ? Number(existingActivity?.processes_personal_data ?? 1)
        : boolFromInput(body.processes_personal_data),
    futurewhiz_internal_use: String(body.futurewhiz_internal_use || existingActivity?.futurewhiz_internal_use || '').trim(),
    processing_lawful:
      body.processing_lawful === undefined
        ? Number(existingActivity?.processing_lawful ?? (body.lawful_basis || existingActivity?.lawful_basis ? 1 : 0))
        : boolFromInput(body.processing_lawful),
    processing_type: String(body.processing_type || existingActivity?.processing_type || '').trim(),
    business_owner_id: owner.id,
    business_owner_name: owner.name,
    business_owner_email: owner.email,
    futurewhiz_role: futurewhizRole,
    controller_name: controllerName,
    controller_contact_details: controllerContactDetails,
    joint_controller_name: String(body.joint_controller_name || existingActivity?.joint_controller_name || '').trim(),
    joint_controller_contact_details: String(
      body.joint_controller_contact_details || existingActivity?.joint_controller_contact_details || ''
    ).trim(),
    controller_representative_name: String(
      body.controller_representative_name || existingActivity?.controller_representative_name || ''
    ).trim(),
    controller_representative_contact_details: String(
      body.controller_representative_contact_details || existingActivity?.controller_representative_contact_details || ''
    ).trim(),
    dpo_name: String(body.dpo_name || existingActivity?.dpo_name || '').trim(),
    dpo_contact_details: String(body.dpo_contact_details || existingActivity?.dpo_contact_details || '').trim(),
    legal_reviewer_id: reviewer.id,
    legal_reviewer_name: reviewer.name,
    legal_reviewer_email: reviewer.email,
    department: String(body.department || existingActivity?.department || '').trim(),
    product_service: String(body.product_service || existingActivity?.product_service || '').trim(),
    purpose_of_processing: String(body.purpose_of_processing || existingActivity?.purpose_of_processing || '').trim(),
    data_subject_categories_json: stringifyJsonArray(body.data_subject_categories ?? []),
    personal_data_categories_json: stringifyJsonArray(body.personal_data_categories ?? []),
    lawful_basis: String(body.lawful_basis || existingActivity?.lawful_basis || '').trim(),
    recipient_categories_json: stringifyJsonArray(body.recipient_categories ?? []),
    processors_vendors_json: stringifyJsonArray(body.processors_vendors ?? ''),
    international_transfers: boolFromInput(body.international_transfers),
    transfer_mechanisms_json: stringifyJsonArray(body.transfer_mechanisms ?? []),
    transfer_countries_json: stringifyJsonArray(body.transfer_countries ?? ''),
    retention_period: String(body.retention_period || existingActivity?.retention_period || '').trim(),
    retention_period_internal: String(body.retention_period_internal || existingActivity?.retention_period_internal || '').trim(),
    retention_enforcement: String(body.retention_enforcement || existingActivity?.retention_enforcement || '').trim(),
    old_data_deletion_details: String(body.old_data_deletion_details || existingActivity?.old_data_deletion_details || '').trim(),
    data_within_eu:
      body.data_within_eu === undefined
        ? Number(existingActivity?.data_within_eu ?? (body.international_transfers || existingActivity?.international_transfers ? 0 : 1))
        : boolFromInput(body.data_within_eu),
    processor_agreement_signed:
      body.processor_agreement_signed === undefined
        ? Number(existingActivity?.processor_agreement_signed ?? 0)
        : boolFromInput(body.processor_agreement_signed),
    source_of_personal_data: String(body.source_of_personal_data || existingActivity?.source_of_personal_data || '').trim(),
    children_data: boolFromInput(body.children_data),
    special_category_data: boolFromInput(body.special_category_data),
    ai_involvement: boolFromInput(body.ai_involvement),
    security_measures: String(body.security_measures || existingActivity?.security_measures || '').trim(),
    legal_remarks: String(body.legal_remarks || existingActivity?.legal_remarks || '').trim(),
    action_required: String(body.action_required || existingActivity?.action_required || '').trim(),
    tia_performed:
      body.tia_performed === undefined
        ? Number(existingActivity?.tia_performed ?? 0)
        : boolFromInput(body.tia_performed),
    vendor_review_ref: String(body.vendor_review_ref || existingActivity?.vendor_review_ref || '').trim(),
    vendor_review_url: String(body.vendor_review_url || existingActivity?.vendor_review_url || '').trim(),
    dpia_ref: String(body.dpia_ref || existingActivity?.dpia_ref || '').trim(),
    dpia_url: String(body.dpia_url || existingActivity?.dpia_url || '').trim(),
    lia_ref: String(body.lia_ref || existingActivity?.lia_ref || '').trim(),
    lia_url: String(body.lia_url || existingActivity?.lia_url || '').trim(),
    privacy_notice_ref: String(body.privacy_notice_ref || existingActivity?.privacy_notice_ref || '').trim(),
    privacy_notice_url: String(body.privacy_notice_url || existingActivity?.privacy_notice_url || '').trim(),
    security_review_ref: String(body.security_review_ref || existingActivity?.security_review_ref || '').trim(),
    security_review_url: String(body.security_review_url || existingActivity?.security_review_url || '').trim(),
    ai_tool_review_ref: String(body.ai_tool_review_ref || existingActivity?.ai_tool_review_ref || '').trim(),
    ai_tool_review_url: String(body.ai_tool_review_url || existingActivity?.ai_tool_review_url || '').trim(),
    status: requestedStatus,
    workflow_notes: String(body.workflow_notes || existingActivity?.workflow_notes || '').trim(),
    review_interval_months: reviewIntervalMonths,
    last_updated_by_id: actor.id,
    last_updated_by_name: actor.name,
    last_updated_by_email: actor.email,
    last_updated_at: nowIso(),
    last_review_date: lastReviewDate,
    next_review_date: nextReviewDate,
    comments_notes: String(body.comments_notes || existingActivity?.comments_notes || '').trim(),
    created_by_id: existingActivity?.created_by_id || actor.id,
    created_by_name: existingActivity?.created_by_name || actor.name,
    created_by_email: existingActivity?.created_by_email || actor.email,
    created_at: existingActivity?.created_at || nowIso(),
    archived_at: requestedStatus === 'archived' ? nowIso() : null
  };
}

async function insertActivity(payload) {
  const result = await db
    .prepare(
      `
        INSERT INTO activities (
          reference_code, activity_name, short_description, business_owner_id, business_owner_name, business_owner_email,
          business_process, processes_personal_data, futurewhiz_internal_use, processing_lawful, processing_type,
          futurewhiz_role, controller_name, controller_contact_details, joint_controller_name, joint_controller_contact_details,
          controller_representative_name, controller_representative_contact_details, dpo_name, dpo_contact_details,
          legal_reviewer_id, legal_reviewer_name, legal_reviewer_email, department, product_service, purpose_of_processing,
          data_subject_categories_json, personal_data_categories_json, lawful_basis, recipient_categories_json,
          processors_vendors_json, international_transfers, transfer_mechanisms_json, transfer_countries_json,
          retention_period, retention_period_internal, retention_enforcement, old_data_deletion_details, data_within_eu,
          processor_agreement_signed, source_of_personal_data, children_data, special_category_data, ai_involvement,
          security_measures, legal_remarks, action_required, tia_performed, vendor_review_ref, vendor_review_url, dpia_ref, dpia_url, lia_ref, lia_url,
          privacy_notice_ref, privacy_notice_url, security_review_ref, security_review_url, ai_tool_review_ref,
          ai_tool_review_url, status, workflow_notes, review_interval_months, last_updated_by_id, last_updated_by_name,
          last_updated_by_email, last_updated_at, last_review_date, next_review_date, comments_notes,
          created_by_id, created_by_name, created_by_email, created_at, archived_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
    .run(
      payload.reference_code,
      payload.activity_name,
      payload.short_description,
      payload.business_owner_id,
      payload.business_owner_name,
      payload.business_owner_email,
      payload.business_process,
      payload.processes_personal_data,
      payload.futurewhiz_internal_use,
      payload.processing_lawful,
      payload.processing_type,
      payload.futurewhiz_role,
      payload.controller_name,
      payload.controller_contact_details,
      payload.joint_controller_name,
      payload.joint_controller_contact_details,
      payload.controller_representative_name,
      payload.controller_representative_contact_details,
      payload.dpo_name,
      payload.dpo_contact_details,
      payload.legal_reviewer_id,
      payload.legal_reviewer_name,
      payload.legal_reviewer_email,
      payload.department,
      payload.product_service,
      payload.purpose_of_processing,
      payload.data_subject_categories_json,
      payload.personal_data_categories_json,
      payload.lawful_basis,
      payload.recipient_categories_json,
      payload.processors_vendors_json,
      payload.international_transfers,
      payload.transfer_mechanisms_json,
      payload.transfer_countries_json,
      payload.retention_period,
      payload.retention_period_internal,
      payload.retention_enforcement,
      payload.old_data_deletion_details,
      payload.data_within_eu,
      payload.processor_agreement_signed,
      payload.source_of_personal_data,
      payload.children_data,
      payload.special_category_data,
      payload.ai_involvement,
      payload.security_measures,
      payload.legal_remarks,
      payload.action_required,
      payload.tia_performed,
      payload.vendor_review_ref,
      payload.vendor_review_url,
      payload.dpia_ref,
      payload.dpia_url,
      payload.lia_ref,
      payload.lia_url,
      payload.privacy_notice_ref,
      payload.privacy_notice_url,
      payload.security_review_ref,
      payload.security_review_url,
      payload.ai_tool_review_ref,
      payload.ai_tool_review_url,
      payload.status,
      payload.workflow_notes,
      payload.review_interval_months,
      payload.last_updated_by_id,
      payload.last_updated_by_name,
      payload.last_updated_by_email,
      payload.last_updated_at,
      payload.last_review_date,
      payload.next_review_date,
      payload.comments_notes,
      payload.created_by_id,
      payload.created_by_name,
      payload.created_by_email,
      payload.created_at,
      payload.archived_at
    );

  return result.lastInsertRowid;
}

async function updateActivity(id, payload) {
  await db
    .prepare(
      `
        UPDATE activities SET
          activity_name = ?, business_process = ?, short_description = ?, processes_personal_data = ?, futurewhiz_internal_use = ?, processing_lawful = ?, processing_type = ?, business_owner_id = ?, business_owner_name = ?, business_owner_email = ?,
          futurewhiz_role = ?, controller_name = ?, controller_contact_details = ?, joint_controller_name = ?, joint_controller_contact_details = ?,
          controller_representative_name = ?, controller_representative_contact_details = ?, dpo_name = ?, dpo_contact_details = ?,
          legal_reviewer_id = ?, legal_reviewer_name = ?, legal_reviewer_email = ?, department = ?, product_service = ?,
          purpose_of_processing = ?, data_subject_categories_json = ?, personal_data_categories_json = ?, lawful_basis = ?,
          recipient_categories_json = ?, processors_vendors_json = ?, international_transfers = ?, transfer_mechanisms_json = ?,
          transfer_countries_json = ?, retention_period = ?, retention_period_internal = ?, retention_enforcement = ?, old_data_deletion_details = ?, data_within_eu = ?, processor_agreement_signed = ?, source_of_personal_data = ?, children_data = ?,
          special_category_data = ?, ai_involvement = ?, security_measures = ?, legal_remarks = ?, action_required = ?, tia_performed = ?, vendor_review_ref = ?, vendor_review_url = ?,
          dpia_ref = ?, dpia_url = ?, lia_ref = ?, lia_url = ?, privacy_notice_ref = ?, privacy_notice_url = ?,
          security_review_ref = ?, security_review_url = ?, ai_tool_review_ref = ?, ai_tool_review_url = ?, status = ?,
          workflow_notes = ?, review_interval_months = ?, last_updated_by_id = ?, last_updated_by_name = ?,
          last_updated_by_email = ?, last_updated_at = ?, last_review_date = ?, next_review_date = ?, comments_notes = ?,
          archived_at = ?
        WHERE id = ?
      `
    )
    .run(
      payload.activity_name,
      payload.business_process,
      payload.short_description,
      payload.processes_personal_data,
      payload.futurewhiz_internal_use,
      payload.processing_lawful,
      payload.processing_type,
      payload.business_owner_id,
      payload.business_owner_name,
      payload.business_owner_email,
      payload.futurewhiz_role,
      payload.controller_name,
      payload.controller_contact_details,
      payload.joint_controller_name,
      payload.joint_controller_contact_details,
      payload.controller_representative_name,
      payload.controller_representative_contact_details,
      payload.dpo_name,
      payload.dpo_contact_details,
      payload.legal_reviewer_id,
      payload.legal_reviewer_name,
      payload.legal_reviewer_email,
      payload.department,
      payload.product_service,
      payload.purpose_of_processing,
      payload.data_subject_categories_json,
      payload.personal_data_categories_json,
      payload.lawful_basis,
      payload.recipient_categories_json,
      payload.processors_vendors_json,
      payload.international_transfers,
      payload.transfer_mechanisms_json,
      payload.transfer_countries_json,
      payload.retention_period,
      payload.retention_period_internal,
      payload.retention_enforcement,
      payload.old_data_deletion_details,
      payload.data_within_eu,
      payload.processor_agreement_signed,
      payload.source_of_personal_data,
      payload.children_data,
      payload.special_category_data,
      payload.ai_involvement,
      payload.security_measures,
      payload.legal_remarks,
      payload.action_required,
      payload.tia_performed,
      payload.vendor_review_ref,
      payload.vendor_review_url,
      payload.dpia_ref,
      payload.dpia_url,
      payload.lia_ref,
      payload.lia_url,
      payload.privacy_notice_ref,
      payload.privacy_notice_url,
      payload.security_review_ref,
      payload.security_review_url,
      payload.ai_tool_review_ref,
      payload.ai_tool_review_url,
      payload.status,
      payload.workflow_notes,
      payload.review_interval_months,
      payload.last_updated_by_id,
      payload.last_updated_by_name,
      payload.last_updated_by_email,
      payload.last_updated_at,
      payload.last_review_date,
      payload.next_review_date,
      payload.comments_notes,
      payload.archived_at,
      id
    );
}

async function renderActivityForm(req, res, options = {}) {
  const vocab = await getVocabBundle();
  const users = await getActiveUsers();
  const legalReviewers = users.filter((user) => user.role === 'legal' || user.role === 'admin');
  const businessOwners = users.filter((user) => user.role === 'business' || user.role === 'admin');
  const activity = options.activity || null;
  const formValues = activity
      ? {
          ...activity,
        data_subject_categories: activity.data_subject_categories,
        personal_data_categories: activity.personal_data_categories,
        recipient_categories: activity.recipient_categories,
        processors_vendors: activity.processors_vendors.join('\n'),
        transfer_mechanisms: activity.transfer_mechanisms,
        transfer_countries: activity.transfer_countries.join('\n')
      }
      : {
        activity_name: '',
        business_process: '',
        short_description: '',
        processes_personal_data: 1,
        futurewhiz_internal_use: '',
        processing_lawful: 1,
        processing_type: '',
        business_owner_email: req.session.user.email,
        futurewhiz_role: 'controller',
        controller_name: '',
        controller_contact_details: '',
        joint_controller_name: '',
        joint_controller_contact_details: '',
        controller_representative_name: '',
        controller_representative_contact_details: '',
        dpo_name: '',
        dpo_contact_details: '',
        legal_reviewer_email: '',
        department: '',
        product_service: '',
        purpose_of_processing: '',
        data_subject_categories: [],
        personal_data_categories: [],
        lawful_basis: '',
        recipient_categories: [],
        processors_vendors: '',
        international_transfers: 0,
        transfer_mechanisms: [],
        transfer_countries: '',
        retention_period: '',
        retention_period_internal: '',
        retention_enforcement: '',
        old_data_deletion_details: '',
        data_within_eu: 1,
        processor_agreement_signed: 0,
        source_of_personal_data: '',
        children_data: 0,
        special_category_data: 0,
        ai_involvement: 0,
        security_measures: '',
        legal_remarks: '',
        action_required: '',
        tia_performed: 0,
        vendor_review_ref: '',
        vendor_review_url: '',
        dpia_ref: '',
        dpia_url: '',
        lia_ref: '',
        lia_url: '',
        privacy_notice_ref: '',
        privacy_notice_url: '',
        security_review_ref: '',
        security_review_url: '',
        ai_tool_review_ref: '',
        ai_tool_review_url: '',
        status: req.session.user.role === 'business' ? 'draft' : 'pending_legal_review',
        workflow_notes: '',
        review_interval_months: 12,
        last_review_date: '',
        next_review_date: addMonths(todayIsoDate(), 12),
        comments_notes: ''
      };

  return res.render('activity_form', {
    pageTitle: activity ? `${activity.reference_code} · Edit activity` : 'Create processing activity',
    activity,
    formValues,
    errors: options.errors || [],
    statusOptions: STATUS_OPTIONS,
    reviewIntervals: REVIEW_INTERVAL_OPTIONS,
    futurewhizRoleOptions: FUTUREWHIZ_ROLE_OPTIONS,
    legalReviewers,
    businessOwners,
    vocab,
    canSetStatus: req.session.user.role === 'legal' || req.session.user.role === 'admin'
  });
}

app.get(
  '/',
  asyncHandler(async (req, res) => {
    if (req.session.user) {
      return res.redirect('/activities');
    }
    return res.redirect('/login');
  })
);

app.get(
  '/login',
  asyncHandler(async (_req, res) => {
    const users = await getActiveUsers();
    const demoUsers = users.filter((user) => ['admin', 'legal', 'business'].includes(user.role));
    res.render('login', {
      demoUsers,
      roleOptions: ROLE_OPTIONS
    });
  })
);

app.post(
  '/login',
  asyncHandler(async (req, res) => {
    const email = String(req.body.email || req.body.demo_email || '').trim().toLowerCase();
    if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
      setFlash(req, 'error', `Use an internal @${ALLOWED_DOMAIN} email address.`);
      return res.redirect('/login');
    }

    const user = await createBusinessUserIfNeeded(email);
    if (!user || !user.active) {
      setFlash(req, 'error', 'This user is not active.');
      return res.redirect('/login');
    }

    if (user.role === 'admin' && user.email !== ADMIN_DEMO_EMAIL) {
      setFlash(req, 'error', 'Admin access is limited to the demo admin account.');
      return res.redirect('/login');
    }

    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department
    };
    setFlash(req, 'success', `Signed in as ${user.name}.`);
    return res.redirect('/activities');
  })
);

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

app.get(
  '/controller-identification',
  ensureAuth,
  asyncHandler(async (req, res) => {
    const controllerProfile = await getControllerProfile();
    res.render('controller_identification', {
      pageTitle: 'Company details',
      controllerProfile,
      errors: [],
      canEditControllerProfile: req.session.user.role === 'legal' || req.session.user.role === 'admin'
    });
  })
);

app.post(
  '/controller-identification',
  ensureLegal,
  asyncHandler(async (req, res) => {
    const existingProfile = await getControllerProfile();
    const controllerProfile = {
      id: existingProfile?.id,
      company_name: String(req.body.company_name || '').trim(),
      contact_name: String(req.body.contact_name || '').trim(),
      address: String(req.body.address || '').trim(),
      phone_number: String(req.body.phone_number || '').trim(),
      email: String(req.body.email || '').trim(),
      chamber_of_commerce: String(req.body.chamber_of_commerce || '').trim()
    };

    const errors = [];
    if (!controllerProfile.company_name) errors.push('Company name is required.');
    if (!controllerProfile.contact_name) errors.push('Contact is required.');
    if (!controllerProfile.email) errors.push('Email is required.');

    if (errors.length > 0) {
      return res.status(422).render('controller_identification', {
        pageTitle: 'Company details',
        controllerProfile,
        errors,
        canEditControllerProfile: true
      });
    }

    await db
      .prepare(
        `
          UPDATE controller_profile
          SET company_name = ?, contact_name = ?, address = ?, phone_number = ?, email = ?, chamber_of_commerce = ?, updated_at = ?
          WHERE id = ?
        `
      )
      .run(
        controllerProfile.company_name,
        controllerProfile.contact_name,
        controllerProfile.address,
        controllerProfile.phone_number,
        controllerProfile.email,
        controllerProfile.chamber_of_commerce,
        nowIso(),
        controllerProfile.id
      );

    await db
      .prepare(
        `
          UPDATE activities
          SET controller_name = ?, controller_contact_details = ?
          WHERE futurewhiz_role = 'controller'
        `
      )
      .run(controllerProfile.company_name, controllerProfileContactDetails(controllerProfile));

    setFlash(req, 'success', 'Company details updated.');
    return res.redirect('/controller-identification');
  })
);

app.get(
  '/controller-identification/export.pdf',
  ensureAuth,
  asyncHandler(async (req, res) => {
    const controllerProfile = await getControllerProfile();
    const pdf = buildCompanyDetailsPdf(controllerProfile, {
      title: 'Company details',
      subtitleLines: [
        `Company: ${controllerProfile?.company_name || 'Not set'}`,
        `Exported: ${formatDateTime(nowIso(), APP_TIMEZONE)}`
      ]
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="futurewhiz-company-details.pdf"');
    return res.send(pdf);
  })
);

app.get(
  '/activities',
  ensureAuth,
  asyncHandler(async (req, res) => {
    const filters = buildActivityFilters(req.query);
    const { whereSql, params, orderBy } = buildActivityWhere(filters);
    const [rows, supportData, vocab] = await Promise.all([
      db.prepare(`SELECT * FROM activities WHERE ${whereSql} ORDER BY ${orderBy}`).all(params),
      fetchFiltersSupportData(),
      getVocabBundle()
    ]);

    res.render('activities', {
      pageTitle: 'RoPA register',
      activities: rows.map(decorateActivity),
      activeFilters: summarizeActivityFilters(filters),
      filters,
      exportQuery: new URLSearchParams(filters).toString(),
      filterOptions: {
        ...supportData,
        departments: vocab.departments.map((item) => item.label),
        lawfulBases: vocab.lawfulBases.map((item) => item.label)
      },
      booleanFilters: BOOLEAN_FILTERS,
      resultCount: rows.length
    });
  })
);

app.get(
  '/security-measures',
  ensureAuth,
  asyncHandler(async (req, res) => renderSecurityMeasureLibrary(req, res))
);

app.post(
  '/security-measures',
  ensureAuth,
  asyncHandler(async (req, res) => {
    const formValues = {
      category: String(req.body.category || '').trim(),
      title: String(req.body.title || '').trim(),
      description: String(req.body.description || '').trim()
    };
    const filters = buildSecurityMeasureFilters(req.query);
    const errors = [];

    if (!formValues.category) errors.push('Category is required.');
    if (!formValues.title) errors.push('Measure is required.');

    if (errors.length > 0) {
      return renderSecurityMeasureLibrary(req, res.status(422), {
        filters,
        formErrors: errors,
        formValues,
        showNewForm: true
      });
    }

    const sortRow = await db
      .prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_sort_order FROM security_measure_library WHERE category = ?')
      .get(formValues.category);

    await db
      .prepare(
        `
          INSERT INTO security_measure_library (
            category, title, description, created_by_email, sort_order, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        formValues.category,
        formValues.title,
        formValues.description,
        req.session.user.email,
        sortRow.next_sort_order,
        nowIso(),
        nowIso()
      );

    setFlash(req, 'success', 'Security measure added.');
    return res.redirect('/security-measures');
  })
);

app.get('/activities/new', ensureAuth, asyncHandler(async (req, res) => renderActivityForm(req, res)));

app.post(
  '/activities',
  ensureAuth,
  asyncHandler(async (req, res) => {
    const payload = await buildActivityPayload(req.body, req.session.user, null, 'form');
    if (req.session.user.role === 'business') {
      payload.status = 'draft';
    }

    const errors = validateActivityPayload(payload);
    if (errors.length > 0) {
      return renderActivityForm(req, res.status(422), { errors, activity: decorateActivity(payload) });
    }

    const activityId = await insertActivity(payload);
    await writeChangeLog(
      activityId,
      req.session.user,
      'created',
      'Record created',
      '',
      payload.reference_code,
      req.body.change_reason || 'Created via activity form'
    );
    await replaceReminder(
      activityId,
      payload.next_review_date,
      payload.next_review_date && payload.next_review_date < todayIsoDate() ? 'overdue' : 'scheduled',
      'Next periodic review'
    );
    setFlash(req, 'success', 'Processing activity created.');
    return res.redirect(`/activities/${activityId}`);
  })
);

app.get(
  '/activities/:id',
  ensureAuth,
  asyncHandler(async (req, res) => {
    const activity = await getActivityById(req.params.id);
    if (!activity) {
      return res.status(404).render('error', { message: 'Activity not found.' });
    }

    const attachments = await db
      .prepare('SELECT * FROM activity_attachments WHERE activity_id = ? ORDER BY uploaded_at DESC')
      .all(activity.id);
    const attachmentTypeLabels = Object.fromEntries(
      ATTACHMENT_TYPE_OPTIONS.map((option) => [option.value, option.label])
    );
    const attachmentGroups = ATTACHMENT_TYPE_OPTIONS.reduce((groups, option) => {
      groups[option.value] = attachments.filter((attachment) => attachment.attachment_type === option.value);
      return groups;
    }, {});

    res.render('activity_detail', {
      pageTitle: `${activity.reference_code} · ${activity.activity_name}`,
      activity,
      attachments,
      attachmentGroups,
      attachmentTypeLabels,
      canEdit: canEditActivity(req.session.user, activity)
    });
  })
);

app.get(
  '/activities/:id/edit',
  ensureAuth,
  asyncHandler(async (req, res) => {
    const activity = await getActivityById(req.params.id);
    if (!activity) {
      return res.status(404).render('error', { message: 'Activity not found.' });
    }
    if (!canEditActivity(req.session.user, activity)) {
      return res.status(403).render('error', { message: 'You do not have permission to edit this activity.' });
    }
    return renderActivityForm(req, res, { activity });
  })
);

app.post(
  '/activities/:id',
  ensureAuth,
  asyncHandler(async (req, res) => {
    const existingActivity = await getActivityById(req.params.id);
    if (!existingActivity) {
      return res.status(404).render('error', { message: 'Activity not found.' });
    }
    if (!canEditActivity(req.session.user, existingActivity)) {
      return res.status(403).render('error', { message: 'You do not have permission to edit this activity.' });
    }

    const payload = await buildActivityPayload(req.body, req.session.user, existingActivity, 'form');
    if (req.session.user.role === 'business') {
      payload.status = existingActivity.status === 'approved' ? 'needs_update' : existingActivity.status;
    }

    const errors = validateActivityPayload(payload);
    if (errors.length > 0) {
      return renderActivityForm(req, res.status(422), {
        activity: decorateActivity({ ...payload, id: existingActivity.id }),
        errors
      });
    }

    await updateActivity(existingActivity.id, payload);
    await recordActivityFieldChanges(existingActivity.id, existingActivity, payload, req.session.user, req.body.change_reason);
    await replaceReminder(
      existingActivity.id,
      payload.next_review_date,
      payload.next_review_date && payload.next_review_date < todayIsoDate() ? 'overdue' : 'scheduled',
      'Next periodic review'
    );
    setFlash(req, 'success', 'Processing activity updated.');
    return res.redirect(`/activities/${existingActivity.id}`);
  })
);

app.post(
  '/activities/:id/status',
  ensureLegal,
  asyncHandler(async (req, res) => {
    const activity = await getActivityById(req.params.id);
    if (!activity) {
      return res.status(404).render('error', { message: 'Activity not found.' });
    }

    const nextStatus = String(req.body.status || '').trim();
    if (!STATUS_OPTIONS.some((option) => option.value === nextStatus)) {
      setFlash(req, 'error', 'Choose a valid status.');
      return res.redirect(`/activities/${activity.id}`);
    }

    const lastReviewDate = nextStatus === 'approved' ? String(req.body.last_review_date || todayIsoDate()) : activity.last_review_date;
    const nextReviewDate =
      nextStatus === 'approved'
        ? addMonths(lastReviewDate, Number(activity.review_interval_months || 12))
        : activity.next_review_date;

    await db
      .prepare(
        `
          UPDATE activities
          SET status = ?, workflow_notes = ?, last_review_date = ?, next_review_date = ?, archived_at = ?, last_updated_by_id = ?,
              last_updated_by_name = ?, last_updated_by_email = ?, last_updated_at = ?
          WHERE id = ?
        `
      )
      .run(
        nextStatus,
        String(req.body.workflow_notes || activity.workflow_notes || '').trim(),
        lastReviewDate,
        nextReviewDate,
        nextStatus === 'archived' ? nowIso() : null,
        req.session.user.id,
        req.session.user.name,
        req.session.user.email,
        nowIso(),
        activity.id
      );

    await writeChangeLog(
      activity.id,
      req.session.user,
      'status_change',
      'Status',
      statusLabel(activity.status),
      statusLabel(nextStatus),
      req.body.change_reason || 'Workflow update'
    );

    await replaceReminder(
      activity.id,
      nextReviewDate,
      nextReviewDate && nextReviewDate < todayIsoDate() ? 'overdue' : 'scheduled',
      nextStatus === 'approved' ? 'Approved activity review cadence' : 'Updated review reminder'
    );
    setFlash(req, 'success', 'Status updated.');
    return res.redirect(`/activities/${activity.id}`);
  })
);

app.post(
  '/activities/:id/attachments',
  ensureAuth,
  upload.array('files', 5),
  asyncHandler(async (req, res) => {
    const activity = await getActivityById(req.params.id);
    if (!activity) {
      return res.status(404).render('error', { message: 'Activity not found.' });
    }
    if (!canEditActivity(req.session.user, activity)) {
      return res.status(403).render('error', { message: 'You do not have permission to add attachments.' });
    }

    const files = req.files || [];
    if (files.length === 0) {
      setFlash(req, 'error', 'Select at least one file to upload.');
      return res.redirect(`/activities/${activity.id}`);
    }

    const attachmentType = String(req.body.attachment_type || 'other');
    const label = String(req.body.label || '').trim();

    for (const file of files) {
      await db
        .prepare(
          `
            INSERT INTO activity_attachments (
              activity_id, attachment_type, label, original_name, stored_name, mime_type, size_bytes, uploaded_by_email, uploaded_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          activity.id,
          attachmentType,
          label,
          file.originalname,
          file.filename,
          file.mimetype,
          file.size,
          req.session.user.email,
          nowIso()
        );
    }

    await bumpActivityMeta(activity.id, req.session.user);
    await writeChangeLog(
      activity.id,
      req.session.user,
      'attachment_added',
      'Attachment',
      '',
      `${files.length} file(s) added`,
      label || attachmentType
    );

    setFlash(req, 'success', 'Attachment uploaded.');
    return res.redirect(`/activities/${activity.id}`);
  })
);

app.get(
  '/attachments/:id/download',
  ensureAuth,
  asyncHandler(async (req, res) => {
    const attachment = await db.prepare('SELECT * FROM activity_attachments WHERE id = ?').get(req.params.id);
    if (!attachment) {
      return res.status(404).render('error', { message: 'Attachment not found.' });
    }

    const activity = await getActivityById(attachment.activity_id);
    if (!activity) {
      return res.status(404).render('error', { message: 'Activity not found.' });
    }

    const canAccess = req.session.user.role !== 'business' || activity.business_owner_email === req.session.user.email;
    if (!canAccess) {
      return res.status(403).render('error', { message: 'You do not have permission to access this attachment.' });
    }

    return res.download(path.join(UPLOAD_DIR, attachment.stored_name), attachment.original_name);
  })
);

app.get(
  '/activities/:id/export.pdf',
  ensureAuth,
  asyncHandler(async (req, res) => {
    const activity = await getActivityById(req.params.id);
    if (!activity) {
      return res.status(404).render('error', { message: 'Activity not found.' });
    }

    const pdf = buildActivityDetailPdf(activity, {
      title: `${activity.reference_code} · ${activity.activity_name}`,
      subtitleLines: [
        `Status: ${statusLabel(activity.status)}`,
        `Business owner: ${activity.business_owner_name || 'Not set'}`,
        `Last updated: ${activity.last_updated_at ? formatDateTime(activity.last_updated_at, APP_TIMEZONE) : 'Not set'}`
      ]
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${activity.reference_code}.pdf"`);
    return res.send(pdf);
  })
);

app.get(
  '/activities/:id/security-export.pdf',
  ensureAuth,
  asyncHandler(async (req, res) => {
    const activity = await getActivityById(req.params.id);
    if (!activity) {
      return res.status(404).render('error', { message: 'Activity not found.' });
    }

    const pdf = buildSecurityDetailPdf(activity, {
      title: `${activity.reference_code} · Security measures`,
      subtitleLines: [
        `Activity: ${activity.activity_name}`,
        `Status: ${statusLabel(activity.status)}`,
        `Next review: ${activity.next_review_date || 'Not set'}`
      ]
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${activity.reference_code}-security-measures.pdf"`);
    return res.send(pdf);
  })
);

app.get(
  '/exports/security-measures.pdf',
  ensureAuth,
  asyncHandler(async (req, res) => {
    const filters = buildSecurityMeasureFilters(req.query);
    const { whereSql, params, orderBy } = buildSecurityMeasureWhere(filters);
    const measures = await db.prepare(`SELECT * FROM security_measure_library WHERE ${whereSql} ORDER BY ${orderBy}`).all(params);
    const pdf = buildSecurityRegisterPdf(measures);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="futurewhiz-security-measures-register.pdf"');
    return res.send(pdf);
  })
);

app.get(
  '/exports/register.pdf',
  ensureAuth,
  asyncHandler(async (req, res) => {
    const filters = buildActivityFilters(req.query);
    const { whereSql, params, orderBy } = buildActivityWhere(filters);
    const [activityRows, controllerProfile] = await Promise.all([
      db.prepare(`SELECT * FROM activities WHERE ${whereSql} ORDER BY ${orderBy}`).all(params),
      getControllerProfile()
    ]);
    const activities = activityRows.map(decorateActivity);
    const activeFilters = summarizeActivityFilters(filters);
    const pdf = buildRegisterPdf(activities, {
      title: 'Futurewhiz RoPA register',
      subtitleLines: [
        `Records exported: ${activities.length}`,
        activeFilters.length ? `Active filters: ${activeFilters.join(' | ')}` : 'Active filters: none'
      ],
      controllerProfile
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="futurewhiz-ropa-register.pdf"');
    return res.send(pdf);
  })
);

app.get(
  '/exports/register.csv',
  ensureAuth,
  asyncHandler(async (req, res) => {
    const filters = buildActivityFilters(req.query);
    const { whereSql, params, orderBy } = buildActivityWhere(filters);
    const [activities, controllerProfile] = await Promise.all([
      db.prepare(`SELECT * FROM activities WHERE ${whereSql} ORDER BY ${orderBy}`).all(params),
      getControllerProfile()
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="futurewhiz-ropa-register.csv"');
    return res.send(buildActivityCsv(activities, controllerProfile));
  })
);

app.get(
  '/exports/register.xls',
  ensureAuth,
  asyncHandler(async (req, res) => {
    const filters = buildActivityFilters(req.query);
    const { whereSql, params, orderBy } = buildActivityWhere(filters);
    const [activities, controllerProfile] = await Promise.all([
      db.prepare(`SELECT * FROM activities WHERE ${whereSql} ORDER BY ${orderBy}`).all(params),
      getControllerProfile()
    ]);
    res.setHeader('Content-Type', 'application/vnd.ms-excel');
    res.setHeader('Content-Disposition', 'attachment; filename="futurewhiz-ropa-register.xls"');
    return res.send(buildActivityExcelXml(activities, controllerProfile));
  })
);

app.get(
  '/admin',
  ensureAdmin,
  asyncHandler(async (_req, res) => {
    const [users, vocabularyRows] = await Promise.all([
      db.prepare('SELECT * FROM users ORDER BY active DESC, role ASC, name ASC').all(),
      db.prepare('SELECT * FROM vocabulary_values ORDER BY group_key ASC, sort_order ASC, label ASC').all()
    ]);

    const vocabularyGroups = vocabularyRows.reduce((groups, row) => {
      if (!groups[row.group_key]) groups[row.group_key] = [];
      groups[row.group_key].push(row);
      return groups;
    }, {});

    res.render('admin', {
      pageTitle: 'Admin settings',
      users,
      vocabularyGroups
    });
  })
);

app.post(
  '/admin/users',
  ensureAdmin,
  asyncHandler(async (req, res) => {
    const action = String(req.body.action || 'create');
    if (action === 'update') {
      await db
        .prepare(
          `
            UPDATE users
            SET name = ?, role = ?, department = ?, active = ?, updated_at = ?
            WHERE id = ?
          `
        )
        .run(
          String(req.body.name || '').trim(),
          String(req.body.role || 'business').trim(),
          String(req.body.department || '').trim(),
          boolFromInput(req.body.active),
          nowIso(),
          Number(req.body.user_id)
        );
      setFlash(req, 'success', 'User updated.');
    } else {
      await db
        .prepare(
          `
            INSERT INTO users (name, email, role, department, active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          String(req.body.name || '').trim(),
          String(req.body.email || '').trim().toLowerCase(),
          String(req.body.role || 'business').trim(),
          String(req.body.department || '').trim(),
          boolFromInput(req.body.active),
          nowIso(),
          nowIso()
        );
      setFlash(req, 'success', 'User added.');
    }
    return res.redirect('/admin');
  })
);

app.post(
  '/admin/vocabulary',
  ensureAdmin,
  asyncHandler(async (req, res) => {
    const action = String(req.body.action || 'create');
    if (action === 'update') {
      await db
        .prepare(
          `
            UPDATE vocabulary_values
            SET label = ?, sort_order = ?, active = ?, updated_at = ?
            WHERE id = ?
          `
        )
        .run(
          String(req.body.label || '').trim(),
          Number(req.body.sort_order || 0),
          boolFromInput(req.body.active),
          nowIso(),
          Number(req.body.vocabulary_id)
        );
      setFlash(req, 'success', 'Vocabulary value updated.');
    } else {
      const label = String(req.body.label || '').trim();
      await db
        .prepare(
          `
            INSERT INTO vocabulary_values (group_key, value_key, label, sort_order, active, created_at, updated_at)
            VALUES (?, ?, ?, ?, 1, ?, ?)
          `
        )
        .run(
          String(req.body.group_key || '').trim(),
          label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
          label,
          Number(req.body.sort_order || 0),
          nowIso(),
          nowIso()
        );
      setFlash(req, 'success', 'Vocabulary value added.');
    }
    return res.redirect('/admin');
  })
);

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.statusCode || 500).render('error', {
    message: error.message || 'Something went wrong.'
  });
});

app.listen(PORT, HOST, () => {
  console.log(`Futurewhiz RoPA MVP listening on http://${HOST}:${PORT}`);
});
